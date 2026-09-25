#!/usr/bin/env npx tsx

/**
 * Rellena las secciones de landing (`empresa_landing_secciones`) de una
 * empresa a partir de una web existente.
 *
 * Extraccion:
 *   - Con FIRECRAWL_API_KEY: Firecrawl /v2/scrape con extraccion JSON guiada
 *     por schema (textos reales de la web, repartidos por seccion).
 *   - Sin key: fallback heuristico sobre el HTML (JSON-LD, meta og:*, h1/h2,
 *     parrafos, <img>, <blockquote>, enlaces tel:).
 *
 * Uso:
 *   npx tsx --env-file=.env.local scripts/seed-landing-desde-web.ts \
 *     --url https://lacasadelabateria.es/ --dominio localhost [--dry-run] \
 *     [--completar-empresa] [--subir-imagenes-r2]
 *
 *   --dominio / --empresa-id   empresa destino (una de las dos)
 *   --dry-run                  imprime el contenido y no escribe nada
 *   --completar-empresa        rellena direccion/telefono_whatsapp de la
 *                              empresa SOLO si estan vacios
 *   --subir-imagenes-r2        copia las imagenes a R2 (requiere R2_*); sin
 *                              esto se referencian las URLs originales
 *
 * Las secciones se hacen upsert por (empresa_id, tipo): re-ejecutar pisa el
 * contenido de esas secciones, no crea duplicados.
 */

import { createClient } from '@supabase/supabase-js';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { createHash } from 'node:crypto';

type Tipo = 'hero' | 'nosotros' | 'cta_carta' | 'testimonio' | 'galeria' | 'visitanos';

interface Extraido {
  nombre?: string;
  heroKicker?: string;
  heroTitulo?: string;
  heroDescripcion?: string;
  heroImagen?: string;
  nosotrosTitulo?: string;
  nosotrosDescripcion?: string;
  nosotrosImagen?: string;
  testimonioTexto?: string;
  testimonioAutor?: string;
  galeriaImagenes?: string[];
  horario?: string;
  direccion?: string;
  telefono?: string;
  ctaTitulo?: string;
  ctaDescripcion?: string;
  ctaTexto?: string;
  ctaUrl?: string;
}

// ─── CLI ───────────────────────────────────────────────────────────────────

function parseArgs(argv: string[]) {
  const flags = new Set<string>();
  const values: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      values[a.slice(2)] = next;
      i++;
    } else {
      flags.add(a.slice(2));
    }
  }
  return { flags, values };
}

// ─── Utilidades ────────────────────────────────────────────────────────────

const MAX_TEXTO = 2000;

function limpiar(s: string | undefined | null): string | undefined {
  if (!s) return undefined;
  const t = decodeEntities(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, MAX_TEXTO) : undefined;
}

function decodeEntities(s: string): string {
  const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', iexcl: '¡', iquest: '¿', ntilde: 'ñ', Ntilde: 'Ñ', aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', uuml: 'ü', laquo: '«', raquo: '»', hellip: '…', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', euro: '€' };
  return s
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(Number.parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n: string) => named[n] ?? m);
}

function absoluta(src: string | undefined, base: string): string | undefined {
  if (!src || src.startsWith('data:')) return undefined;
  try {
    return new URL(src, base).toString();
  } catch {
    return undefined;
  }
}

function es(texto: string | undefined) {
  return texto ? { es: texto } : undefined;
}

// ─── Extraccion con Firecrawl ──────────────────────────────────────────────

const SCHEMA_FIRECRAWL = {
  type: 'object',
  properties: {
    nombre: { type: 'string', description: 'Nombre del negocio' },
    heroKicker: { type: 'string', description: 'Texto corto encima del titulo principal (eslogan o tipo de local)' },
    heroTitulo: { type: 'string', description: 'Titulo principal de la portada' },
    heroDescripcion: { type: 'string', description: 'Subtitulo o frase de presentacion de la portada' },
    heroImagen: { type: 'string', description: 'URL absoluta de la imagen de cabecera/portada' },
    nosotrosTitulo: { type: 'string', description: 'Titulo de la seccion sobre nosotros / historia' },
    nosotrosDescripcion: { type: 'string', description: 'Texto completo sobre el negocio, su historia o filosofia, copiado literalmente' },
    nosotrosImagen: { type: 'string', description: 'URL absoluta de una imagen del local o del equipo' },
    testimonioTexto: { type: 'string', description: 'Una opinion/resena de cliente literal, si existe' },
    testimonioAutor: { type: 'string', description: 'Autor de esa opinion' },
    galeriaImagenes: { type: 'array', items: { type: 'string' }, description: 'URLs absolutas de fotos de platos, local o ambiente (maximo 12, sin logos ni iconos)' },
    horario: { type: 'string', description: 'Horario de apertura en una linea' },
    direccion: { type: 'string', description: 'Direccion postal completa' },
    telefono: { type: 'string', description: 'Telefono de contacto' },
    ctaTitulo: { type: 'string', description: 'Titulo de una llamada a la accion (reservar, ver carta)' },
    ctaDescripcion: { type: 'string', description: 'Texto de esa llamada a la accion' },
    ctaTexto: { type: 'string', description: 'Texto del boton de reserva o contacto' },
    ctaUrl: { type: 'string', description: 'URL absoluta del boton de reserva o contacto (tel:, https:, mailto:)' },
  },
};

async function extraerConFirecrawl(url: string, apiKey: string): Promise<Extraido> {
  const res = await fetch('https://api.firecrawl.dev/v2/scrape', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      url,
      onlyMainContent: false,
      formats: [
        {
          type: 'json',
          schema: SCHEMA_FIRECRAWL,
          prompt: 'Extrae el contenido de la web de este negocio para montar su landing page. Copia los textos LITERALMENTE en su idioma original, no inventes nada: deja vacio lo que no aparezca.',
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Firecrawl ${res.status}: ${await res.text()}`);
  const body = (await res.json()) as { success?: boolean; data?: { json?: Extraido } };
  if (!body.success || !body.data?.json) throw new Error('Firecrawl no devolvio datos JSON');
  return body.data.json;
}

// ─── Fallback: HTML crudo ──────────────────────────────────────────────────

function metaContent(html: string, prop: string): string | undefined {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*>`, 'i');
  const tag = re.exec(html)?.[0];
  return tag ? /content=["']([^"']*)["']/i.exec(tag)?.[1] : undefined;
}

function todos(html: string, re: RegExp): string[] {
  return [...html.matchAll(re)].map((m) => m[1]);
}

function jsonLd(html: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const raw of todos(html, /<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed: unknown = JSON.parse(raw);
      const lista = Array.isArray(parsed) ? parsed : [parsed];
      for (const nodo of lista as Record<string, unknown>[]) {
        const grafo = nodo['@graph'];
        if (Array.isArray(grafo)) out.push(...(grafo as Record<string, unknown>[]));
        else out.push(nodo);
      }
    } catch {
      // JSON-LD malformado: se ignora
    }
  }
  return out;
}

function direccionDeLd(nodo: Record<string, unknown>): string | undefined {
  const a = nodo.address;
  if (typeof a === 'string') return a;
  if (!a || typeof a !== 'object') return undefined;
  const d = a as Record<string, unknown>;
  return [d.streetAddress, d.postalCode, d.addressLocality, d.addressRegion]
    .filter((x): x is string => typeof x === 'string' && x.length > 0)
    .join(', ') || undefined;
}

function horarioDeLd(nodo: Record<string, unknown>): string | undefined {
  const h = nodo.openingHours;
  if (typeof h === 'string') return h;
  if (Array.isArray(h)) return h.join(' · ');
  return undefined;
}

function esImagenDeContenido(src: string): boolean {
  return !/logo|icon|favicon|sprite|avatar|placeholder|\.svg(\?|$)|pixel|badge/i.test(src);
}

async function extraerDeHtml(url: string): Promise<Extraido> {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (multi-shop landing seed)' } });
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
  const html = await res.text();
  const cuerpo = html.replace(/<(script|style|noscript)[^>]*>[\s\S]*?<\/\1>/gi, '');

  const ld = jsonLd(html);
  const negocio = ld.find((n) => n.address || n.openingHours || n.telephone) ?? {};

  const h1 = limpiar(todos(cuerpo, /<h1[^>]*>([\s\S]*?)<\/h1>/gi)[0]);
  const h2s = todos(cuerpo, /<h2[^>]*>([\s\S]*?)<\/h2>/gi).map(limpiar).filter((x): x is string => !!x);
  const parrafos = todos(cuerpo, /<p[^>]*>([\s\S]*?)<\/p>/gi)
    .map(limpiar)
    .filter((x): x is string => !!x && x.length > 60);
  const citas = todos(cuerpo, /<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi).map(limpiar).filter(Boolean) as string[];

  const imgs = [
    ...todos(cuerpo, /<img[^>]+(?:data-src|src)=["']([^"']+)["']/gi),
    ...todos(cuerpo, /background-image:\s*url\(["']?([^"')]+)["']?\)/gi),
  ]
    .map((s) => absoluta(s, url))
    .filter((s): s is string => !!s && esImagenDeContenido(s));
  const unicas = [...new Set(imgs)];

  const ogImage = absoluta(metaContent(html, 'og:image'), url);
  const tel = /href=["']tel:([^"']+)["']/i.exec(html)?.[1];
  const reserva = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?reserv[\s\S]*?)<\/a>/i.exec(cuerpo);

  const nombre = limpiar((negocio.name as string | undefined) ?? metaContent(html, 'og:site_name') ?? /<title>([\s\S]*?)<\/title>/i.exec(html)?.[1]);
  const descripcionMeta = limpiar(metaContent(html, 'og:description') ?? metaContent(html, 'description'));

  return {
    nombre,
    heroTitulo: h1 ?? nombre,
    heroDescripcion: descripcionMeta ?? parrafos[0],
    heroImagen: ogImage ?? unicas[0],
    nosotrosTitulo: h2s[0],
    nosotrosDescripcion: parrafos.slice(descripcionMeta ? 0 : 1, 4).join('\n\n') || undefined,
    nosotrosImagen: unicas.find((u) => u !== ogImage),
    testimonioTexto: citas[0],
    galeriaImagenes: unicas.slice(0, 12),
    horario: limpiar(horarioDeLd(negocio)),
    direccion: limpiar(direccionDeLd(negocio)),
    telefono: limpiar((negocio.telephone as string | undefined) ?? (tel ? decodeURIComponent(tel) : undefined)),
    ctaTexto: reserva ? limpiar(reserva[2]) : undefined,
    ctaUrl: reserva ? absoluta(reserva[1], url) : undefined,
  };
}

// ─── Imagenes → R2 (opcional) ──────────────────────────────────────────────

function crearSubidorR2(empresaId: string) {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, NEXT_PUBLIC_R2_DOMAIN } = process.env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME || !NEXT_PUBLIC_R2_DOMAIN) {
    throw new Error('--subir-imagenes-r2 requiere R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME y NEXT_PUBLIC_R2_DOMAIN');
  }
  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
  });
  const cache = new Map<string, string>();

  return async (src: string | undefined): Promise<string | undefined> => {
    if (!src) return undefined;
    const hecha = cache.get(src);
    if (hecha) return hecha;
    try {
      const res = await fetch(src);
      if (!res.ok) throw new Error(`${res.status}`);
      const contentType = res.headers.get('content-type') ?? 'image/jpeg';
      if (!contentType.startsWith('image/')) throw new Error(`content-type ${contentType}`);
      const buffer = Buffer.from(await res.arrayBuffer());
      const ext = contentType.split('/')[1]?.split(';')[0] ?? 'jpg';
      const key = `${empresaId}/landing/${createHash('sha1').update(src).digest('hex').slice(0, 16)}.${ext}`;
      await client.send(new PutObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key, Body: buffer, ContentType: contentType, ContentLength: buffer.byteLength }));
      const publica = `https://${NEXT_PUBLIC_R2_DOMAIN.replace(/^https?:\/\//, '')}/${key}`;
      cache.set(src, publica);
      return publica;
    } catch (e) {
      console.warn(`  ! No se pudo copiar ${src} a R2 (${(e as Error).message}); se usa la URL original`);
      return src;
    }
  };
}

// ─── Mapeo a secciones ─────────────────────────────────────────────────────

function sinVacios(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined && !(Array.isArray(v) && v.length === 0)),
  );
}

function construirSecciones(d: Extraido): { tipo: Tipo; contenido: Record<string, unknown> }[] {
  const secciones: { tipo: Tipo; contenido: Record<string, unknown> }[] = [
    {
      tipo: 'hero',
      contenido: sinVacios({
        kicker: es(d.heroKicker),
        titulo: es(d.heroTitulo ?? d.nombre),
        descripcion: es(d.heroDescripcion),
        imagenUrl: d.heroImagen,
        ctaSecundariaTexto: d.ctaUrl ? es(d.ctaTexto ?? 'Reservar') : undefined,
        ctaSecundariaUrl: d.ctaUrl,
        horario: es(d.horario),
      }),
    },
    {
      tipo: 'nosotros',
      contenido: sinVacios({
        titulo: es(d.nosotrosTitulo),
        descripcion: es(d.nosotrosDescripcion),
        imagenUrl: d.nosotrosImagen,
      }),
    },
    {
      tipo: 'cta_carta',
      contenido: sinVacios({
        titulo: es(d.ctaTitulo),
        descripcion: es(d.ctaDescripcion),
        ctaSecundariaTexto: d.ctaUrl ? es(d.ctaTexto ?? 'Reservar') : undefined,
        ctaSecundariaUrl: d.ctaUrl,
      }),
    },
    {
      tipo: 'testimonio',
      contenido: sinVacios({ texto: es(d.testimonioTexto), autor: es(d.testimonioAutor) }),
    },
    {
      tipo: 'galeria',
      contenido: sinVacios({ imagenes: (d.galeriaImagenes ?? []).slice(0, 20) }),
    },
    {
      tipo: 'visitanos',
      contenido: sinVacios({ horario: es(d.horario) }),
    },
  ];
  // cta_carta y visitanos se pintan con defaults del tema aunque no traigan
  // contenido propio; el resto solo tiene sentido si hay algo que mostrar.
  const siempre = new Set<Tipo>(['hero', 'cta_carta', 'visitanos']);
  return secciones.filter((s) => siempre.has(s.tipo) || Object.keys(s.contenido).length > 0);
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  const { flags, values } = parseArgs(process.argv.slice(2));
  const url = values.url;
  if (!url || (!values.dominio && !values['empresa-id'])) {
    console.error('Uso: npx tsx --env-file=.env.local scripts/seed-landing-desde-web.ts --url <url> (--dominio <dominio> | --empresa-id <uuid>) [--dry-run] [--completar-empresa] [--subir-imagenes-r2]');
    process.exit(1);
  }

  const firecrawlKey = process.env.FIRECRAWL_API_KEY;
  console.log(`Extrayendo ${url} ${firecrawlKey ? 'con Firecrawl' : 'con fallback HTML (define FIRECRAWL_API_KEY para mejor extraccion)'}...`);
  const extraido = firecrawlKey ? await extraerConFirecrawl(url, firecrawlKey) : await extraerDeHtml(url);

  if (flags.has('dry-run')) {
    console.log(JSON.stringify({ extraido, secciones: construirSecciones(extraido) }, null, 2));
    return;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error('Faltan NEXT_PUBLIC_SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const consulta = supabase.from('empresas').select('id, nombre, dominio, direccion, telefono_whatsapp');
  const { data: empresa, error: empresaError } = await (values['empresa-id']
    ? consulta.eq('id', values['empresa-id'])
    : consulta.eq('dominio', values.dominio)
  ).maybeSingle();
  if (empresaError || !empresa) {
    console.error(`Empresa no encontrada (${values['empresa-id'] ?? values.dominio}): ${empresaError?.message ?? 'sin resultados'}`);
    process.exit(1);
  }
  console.log(`Empresa destino: ${empresa.nombre} (${empresa.dominio}) — ${empresa.id}`);

  if (flags.has('subir-imagenes-r2')) {
    const subir = crearSubidorR2(empresa.id as string);
    extraido.heroImagen = await subir(extraido.heroImagen);
    extraido.nosotrosImagen = await subir(extraido.nosotrosImagen);
    const galeria: string[] = [];
    for (const img of extraido.galeriaImagenes ?? []) {
      const nueva = await subir(img);
      if (nueva) galeria.push(nueva);
    }
    extraido.galeriaImagenes = galeria;
  }

  const secciones = construirSecciones(extraido);
  const filas = secciones.map((s, orden) => ({ empresa_id: empresa.id, tipo: s.tipo, activo: true, orden, contenido: s.contenido }));
  const { error: upsertError } = await supabase.from('empresa_landing_secciones').upsert(filas, { onConflict: 'empresa_id,tipo' });
  if (upsertError) {
    console.error(`Error guardando secciones: ${upsertError.message}`);
    process.exit(1);
  }
  for (const s of secciones) console.log(`  ✓ ${s.tipo}: ${Object.keys(s.contenido).join(', ') || '(defaults)'}`);

  if (flags.has('completar-empresa')) {
    const cambios: Record<string, string> = {};
    if (!empresa.direccion && extraido.direccion) cambios.direccion = extraido.direccion;
    if (!empresa.telefono_whatsapp && extraido.telefono) cambios.telefono_whatsapp = extraido.telefono;
    if (Object.keys(cambios).length > 0) {
      const { error } = await supabase.from('empresas').update(cambios).eq('id', empresa.id);
      if (error) console.error(`  ! No se pudo completar la empresa: ${error.message}`);
      else console.log(`  ✓ empresa: ${Object.keys(cambios).join(', ')}`);
    }
  }

  console.log('Listo. Recarga la landing (el contenido no pasa por unstable_cache).');
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
