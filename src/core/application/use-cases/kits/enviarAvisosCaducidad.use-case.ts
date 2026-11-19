// src/core/application/use-cases/kits/enviarAvisosCaducidad.use-case.ts
// kit-expiry-m3 (sdd en kitemergenciacanarias, docs/sdd/kit-expiry-reminders/m3/)
// M3e/DD12: orquesta el envío diario de avisos de caducidad. Toda la lógica
// de negocio vive en funciones puras ya probadas (`avisos.ts`, `estado.ts`,
// `email-aviso-caducidad.ts`); este caso de uso solo lee del repositorio,
// decide pausa/remitente/tope y llama a los puertos. Partido en
// `procesarEmpresa` → `procesarBloque` → `enviarUno` (DD12, complejidad
// ≤ 15 cada uno).
//
// M3e se partió en 2 PR (>400 líneas, tasks.md): M3ea (bucle de empresas y
// bloques, caché por lote) deja `enviarUno` en un stub que solo aplaza;
// M3eb lo sustituye por el envío real (cabeceras, marcado, tope, `simular`).
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
import { avisosDebidos, clavesVigentes, type AvisoDebido, type KitParaAvisos } from '@/lib/kit-caducidad/avisos';
import { remitenteDe, type Remitente } from '@/lib/kit-caducidad/emails-avisos';
import { URL_TIENDA_KEC } from '@/lib/kit-caducidad/etiqueta-urls';

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
  return { empresas, pausadas: 0, sinRemitente: 0, kits: 0, enviados: 0, fallidos: 0, sinMarcar: 0, aplazados: 0 };
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

// M3eb reemplaza este stub por el envío real (cabeceras RFC 8058 +
// `IdempotencyKey`, `email.enviar`, `marcarEnviados`, tope y `simular`).
function enviarUno(_ctx: ContextoEmpresa, _datos: DatosEnvio, _aviso: AvisoDebido, resumen: ResumenAvisos, _estado: EstadoTope): Promise<void> {
  resumen.aplazados += 1;
  return Promise.resolve();
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

  for (const empresa of empresasResult.data) {
    const result = await procesarEmpresa(puertos, opciones, empresa, resumen, estado);
    if (!result.success) return result;
  }

  return { success: true, data: resumen };
}
