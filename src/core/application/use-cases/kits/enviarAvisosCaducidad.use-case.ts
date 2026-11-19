// src/core/application/use-cases/kits/enviarAvisosCaducidad.use-case.ts
// kit-expiry-m3 (sdd en kitemergenciacanarias, docs/sdd/kit-expiry-reminders/m3/)
// M3e/DD12: orquesta el envío diario de avisos de caducidad. Toda la lógica
// de negocio vive en funciones puras ya probadas (`avisos.ts`, `estado.ts`,
// `email-aviso-caducidad.ts`); este caso de uso solo lee del repositorio,
// decide pausa/remitente/tope y llama a los puertos. Partido en
// `procesarEmpresa` → `procesarBloque` → `enviarUno` (DD12, complejidad
// ≤ 15 cada uno).
//
// M3e se partió en 2 PR (>400 líneas, tasks.md): M3ea añadió el bucle de
// empresas y bloques con caché por lote (`enviarUno` solo aplazaba); M3eb
// (este commit) añade el envío real: cabeceras RFC 8058 + `IdempotencyKey`,
// marcado, tope y `simular`.
import type { IKitAvisosEnvioRepository } from '@/core/domain/repositories/IKitAvisosEnvioRepository';
import type {
  CaducidadDeLote,
  EmpresaConAvisos,
  KitConContacto,
  LoteKit,
  ResumenAvisos,
} from '@/core/domain/entities/kit-avisos-envio-types';
import type { EmailKitAvisos } from '@/core/domain/entities/kit-avisos-types';
import type { Result } from '@/core/domain/entities/types';
import type { Caducidad } from '@/lib/kit-caducidad/estado';
import { estadoDelKit } from '@/lib/kit-caducidad/estado';
import {
  avisosDebidos,
  clavesVigentes,
  parsearClaveAviso,
  type AvisoDebido,
  type FilaEnviado,
  type KitParaAvisos,
} from '@/lib/kit-caducidad/avisos';
import { emailAvisoCaducidad, cabecerasBajaUnClic, claveIdempotencia } from '@/lib/kit-caducidad/email-aviso-caducidad';
import { remitenteDe, type Remitente } from '@/lib/kit-caducidad/emails-avisos';
import { URL_TIENDA_KEC, urlBajaUnClic } from '@/lib/kit-caducidad/etiqueta-urls';
import { logger } from '@/core/infrastructure/logging/logger';

/** DD4: tamaño del bloque de kits por lectura (cabe de sobra en la URL del `.in()`). */
const BLOQUE_KITS = 200;

/** DD11: tope de envíos por ejecución del cron (el resto, al día siguiente). */
export const TOPE_ENVIOS = 300;

/** DD8: lo mínimo del titular legal que necesita `remitenteDe`. `null` = sin empresa legal resuelta. */
export type TitularLegal = { nombre: string; nif: string | null; direccion: string | null; email: string | null };
export type TitularDe = (empresaId: string) => Promise<TitularLegal | null>;

export interface PuertosEnviarAvisos {
  repo: IKitAvisosEnvioRepository;
  email: EmailKitAvisos;
  titularDe: TitularDe;
}

export interface OpcionesEnviarAvisos {
  /** Hoy en Canarias (`hoyEnCanarias()`), 'YYYY-MM-DD'. */
  hoy: string;
  /** R-M3.1.3: no llama a `enviar` ni a `marcarEnviados`, solo calcula recuentos. */
  simular?: boolean;
  /** DD11, por defecto `TOPE_ENVIOS`. */
  tope?: number;
  /** DD7, por defecto `URL_TIENDA_KEC`. */
  baseUrl?: string;
}

interface EstadoTope {
  restantes: number;
}

interface CacheLote {
  lotes: Map<string, LoteKit>;
  caducidades: Map<string, Caducidad[]>;
}

interface ContextoEmpresa {
  repo: IKitAvisosEnvioRepository;
  email: EmailKitAvisos;
  empresaId: string;
  remitente: Remitente;
  hoy: string;
  simular: boolean;
  baseUrl: string;
  cache: CacheLote;
}

interface DatosEnvio {
  kitEmail: string;
  token: string;
  kitNombre: string;
}

function nuevoResumen(empresas: number): ResumenAvisos {
  return {
    empresas,
    pausadas: 0,
    sinRemitente: 0,
    kits: 0,
    enviados: 0,
    fallidos: 0,
    sinMarcar: 0,
    aplazados: 0,
    empresasConError: 0,
  };
}

function agruparCaducidadesPorLote(filas: readonly CaducidadDeLote[]): Map<string, Caducidad[]> {
  const mapa = new Map<string, Caducidad[]>();
  for (const fila of filas) {
    const lista = mapa.get(fila.loteId) ?? [];
    lista.push({ ingredienteId: fila.ingredienteId, consumible: fila.consumible, parte: fila.parte, caducaEl: fila.caducaEl });
    mapa.set(fila.loteId, lista);
  }
  return mapa;
}

// DD12/diagrama de design.md ("caché por lote"): un `loteId` que ya ha
// aparecido en un bloque anterior de la misma empresa no vuelve a leerse.
async function rellenarCacheLotes(ctx: ContextoEmpresa, loteIds: readonly string[]): Promise<Result<void>> {
  const nuevos = loteIds.filter((id) => !ctx.cache.lotes.has(id));
  if (nuevos.length === 0) return { success: true, data: undefined };

  const [lotesResult, caducidadesResult] = await Promise.all([
    ctx.repo.findLotesKit(ctx.empresaId, nuevos),
    ctx.repo.findCaducidades(ctx.empresaId, nuevos),
  ]);
  if (!lotesResult.success) return lotesResult;
  if (!caducidadesResult.success) return caducidadesResult;

  for (const l of lotesResult.data) ctx.cache.lotes.set(l.loteId, l);
  for (const [loteId, filas] of agruparCaducidadesPorLote(caducidadesResult.data)) {
    ctx.cache.caducidades.set(loteId, filas);
  }
  return { success: true, data: undefined };
}

function construirKitParaAvisos(kit: KitConContacto, cache: CacheLote): KitParaAvisos {
  return {
    serie: kit.serie,
    kitSlug: cache.lotes.get(kit.loteId)?.kitSlug ?? '',
    avisosEmail: true,
    caducidades: cache.caducidades.get(kit.loteId) ?? [],
  };
}

// R-M3.3/R-M3.4/DD11: un email por aviso debido (ya agrupado por kit en
// `avisosDebidos`). El tope se consume aquí, ANTES de intentar nada —
// agotado, el resto de la ejecución se aplaza (D-M3-12), tanto si `simular`
// como si no (los recuentos deben coincidir en los dos modos).
async function enviarUno(ctx: ContextoEmpresa, datos: DatosEnvio, aviso: AvisoDebido, resumen: ResumenAvisos, estado: EstadoTope): Promise<void> {
  if (estado.restantes <= 0) {
    resumen.aplazados += 1;
    return;
  }
  estado.restantes -= 1;

  const { elementos } = estadoDelKit(ctx.hoy, aviso.elementos);
  const contenido = emailAvisoCaducidad({
    serie: aviso.serie,
    kitNombre: datos.kitNombre,
    kitSlug: aviso.kitSlug || null,
    elementos,
    remitente: ctx.remitente,
    baseUrl: ctx.baseUrl,
    token: datos.token,
  });
  const cabeceras = {
    ...cabecerasBajaUnClic(urlBajaUnClic(datos.token), ctx.remitente.email),
    IdempotencyKey: claveIdempotencia(aviso.marcar),
  };

  // R-M3.1.3: `simular` calcula los mismos recuentos que un envío real,
  // sin llamar a Brevo ni escribir `kit_avisos_enviados`.
  if (ctx.simular) {
    resumen.enviados += 1;
    return;
  }

  try {
    // W1 (verify-report.md m3): `remitenteNombre` explícito en cada envío —
    // el puerto `ctx.email` es compartido entre empresas (M3h), así que el
    // remitente de Brevo no puede depender de un estado mutable fuera de
    // esta llamada.
    await ctx.email.enviar(datos.kitEmail, contenido, { cabeceras, remitenteNombre: ctx.remitente.nombre, remitenteEmail: ctx.remitente.email });
  } catch {
    resumen.fallidos += 1;
    return;
  }

  resumen.enviados += 1;
  const filas = aviso.marcar.map(parsearClaveAviso).filter((f): f is FilaEnviado => f !== null);
  const marcarResult = await ctx.repo.marcarEnviados(ctx.empresaId, filas);
  if (!marcarResult.success) {
    resumen.sinMarcar += 1;
  }
}

async function procesarBloque(ctx: ContextoEmpresa, kits: readonly KitConContacto[], resumen: ResumenAvisos, estado: EstadoTope): Promise<Result<void>> {
  const loteIds = Array.from(new Set(kits.map((k) => k.loteId)));
  const cacheResult = await rellenarCacheLotes(ctx, loteIds);
  if (!cacheResult.success) return cacheResult;

  const series = kits.map((k) => k.serie);
  const enviadosResult = await ctx.repo.findEnviados(ctx.empresaId, series);
  if (!enviadosResult.success) return enviadosResult;

  const registradoAtPorSerie = new Map(kits.map((k) => [k.serie, k.registradoAt]));
  const vigentes = clavesVigentes(enviadosResult.data, registradoAtPorSerie);
  const kitsParaAvisos = kits.map((k) => construirKitParaAvisos(k, ctx.cache));
  const avisos = avisosDebidos(ctx.hoy, kitsParaAvisos, vigentes);
  const kitsPorSerie = new Map(kits.map((k) => [k.serie, k]));

  for (const aviso of avisos) {
    const kit = kitsPorSerie.get(aviso.serie);
    if (!kit) continue; // defensivo: avisosDebidos solo genera avisos de kits del propio bloque
    const kitNombre = ctx.cache.lotes.get(kit.loteId)?.kitNombre ?? '';
    await enviarUno(ctx, { kitEmail: kit.email, token: kit.token, kitNombre }, aviso, resumen, estado);
  }

  return { success: true, data: undefined };
}

async function procesarEmpresa(
  puertos: PuertosEnviarAvisos,
  opciones: OpcionesEnviarAvisos,
  empresa: EmpresaConAvisos,
  resumen: ResumenAvisos,
  estado: EstadoTope,
): Promise<Result<void>> {
  if (empresa.pausada) {
    resumen.pausadas += 1;
    return { success: true, data: undefined };
  }

  const titular = await puertos.titularDe(empresa.id);
  const remitente = titular ? remitenteDe(titular) : null;
  if (!remitente) {
    resumen.sinRemitente += 1;
    return { success: true, data: undefined };
  }

  const ctx: ContextoEmpresa = {
    repo: puertos.repo,
    email: puertos.email,
    empresaId: empresa.id,
    remitente,
    hoy: opciones.hoy,
    simular: Boolean(opciones.simular),
    baseUrl: opciones.baseUrl ?? URL_TIENDA_KEC,
    cache: { lotes: new Map(), caducidades: new Map() },
  };

  for (let desde = 0; ; desde += BLOQUE_KITS) {
    const kitsResult = await puertos.repo.findKitsConAvisos(empresa.id, desde, desde + BLOQUE_KITS - 1);
    if (!kitsResult.success) return kitsResult;
    if (kitsResult.data.length === 0) break;

    resumen.kits += kitsResult.data.length;
    const bloqueResult = await procesarBloque(ctx, kitsResult.data, resumen, estado);
    if (!bloqueResult.success) return bloqueResult;

    if (kitsResult.data.length < BLOQUE_KITS) break;
  }

  return { success: true, data: undefined };
}

/** R-M3.1/R-M3.2/R-M3.3: envía los avisos de hoy de todas las empresas con el módulo activo. */
export async function enviarAvisosCaducidadUseCase(
  puertos: PuertosEnviarAvisos,
  opciones: OpcionesEnviarAvisos,
): Promise<Result<ResumenAvisos>> {
  const empresasResult = await puertos.repo.findEmpresasConAvisos();
  if (!empresasResult.success) return empresasResult;

  const resumen = nuevoResumen(empresasResult.data.length);
  const estado: EstadoTope = { restantes: opciones.tope ?? TOPE_ENVIOS };

  // W2 (verify-report.md m3): un fallo de LECTURA de una empresa (p. ej.
  // `findKitsConAvisos`/`findLotesKit`/`findCaducidades`/`findEnviados`) ya
  // no aborta las empresas siguientes — se registra sin PII (solo
  // `empresa.id`, nunca email/teléfono/token) y se cuenta en
  // `empresasConError`; el cron sigue con la empresa siguiente.
  for (const empresa of empresasResult.data) {
    const result = await procesarEmpresa(puertos, opciones, empresa, resumen, estado);
    if (!result.success) {
      resumen.empresasConError += 1;
      logger.logError({
        codigo: result.error.code,
        mensaje: result.error.message,
        modulo: 'use-case',
        metodo: 'enviarAvisosCaducidadUseCase.procesarEmpresa',
        empresaId: empresa.id,
      });
      continue;
    }
  }

  return { success: true, data: resumen };
}
