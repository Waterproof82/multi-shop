// src/core/domain/repositories/IKitAvisosEnvioRepository.ts
// kit-expiry-m3 (sdd en kitemergenciacanarias, docs/sdd/kit-expiry-reminders/m3/)
// M3d1/DD1: repositorio NUEVO del cron diario — no amplía
// `IKitAvisosRepository` (M2b) por el mismo motivo que DD1 de M2b: no
// tocar sus `fakeRepo()`. M3d2/M3d3/M3d4 implementan cada método; hasta
// entonces, el repositorio real devuelve `NOT_IMPLEMENTED`.
import type { Result } from '@/core/domain/entities/types';
import type {
  CaducidadDeLote,
  CaducidadDeLoteMinima,
  EmpresaConAvisos,
  EnviadoAviso,
  FilaEnviado,
  KitConContacto,
  LoteKit,
} from '@/core/domain/entities/kit-avisos-envio-types';

export interface IKitAvisosEnvioRepository {
  // ---- Envío (M3d2/M3d3) ----

  /** R-M3.2.1: empresas con `kits_caducidad_habilitado = true` y si están pausadas. */
  findEmpresasConAvisos(): Promise<Result<EmpresaConAvisos[]>>;

  /** R-M3.2.2: kits con contacto de esa empresa, en bloques de `desde`/`hasta` (DD4: 200), ordenados por `serie`. */
  findKitsConAvisos(empresaId: string, desde: number, hasta: number): Promise<Result<KitConContacto[]>>;

  /** R-M3.2.3: nombre y slug del kit de cada lote del bloque. */
  findLotesKit(empresaId: string, loteIds: readonly string[]): Promise<Result<LoteKit[]>>;

  /** R-M3.2.3: caducidades efectivas de los lotes del bloque (`.range()` de 1000 hasta agotar). */
  findCaducidades(empresaId: string, loteIds: readonly string[]): Promise<Result<CaducidadDeLote[]>>;

  /** R-M3.2.4: avisos ya enviados (`canal = 'email'`) de las series del bloque. */
  findEnviados(empresaId: string, series: readonly string[]): Promise<Result<EnviadoAviso[]>>;

  /** R-M3.3.1: `upsert` sobre la PK (`serie,ingrediente_id,parte,umbral_dias,canal`); lista vacía no llama a la BD. */
  marcarEnviados(empresaId: string, filas: readonly FilaEnviado[]): Promise<Result<void>>;

  // ---- Purgas (M3d4, R-M3.5.4: globales, sin `empresa_id`) ----

  /** R-M3.5.1: pone a `NULL` las 6 columnas de contacto de pendientes caducados; devuelve el recuento. */
  purgarPendientes(antesDe: string): Promise<Result<number>>;

  /** R-M3.5.2: `lote_id` distintos con algún contacto (`.range()` hasta agotar, sin duplicados). */
  findLotesConContacto(): Promise<Result<string[]>>;

  /** R-M3.5.2: la caducidad más tardía de cada lote, de la vista de caducidades efectivas. */
  findUltimasCaducidades(loteIds: readonly string[]): Promise<Result<CaducidadDeLoteMinima[]>>;

  /** R-M3.5.2: pone a `NULL` las 6 columnas de contacto Y `registrado_at` de los lotes inactivos; lista vacía → 0 sin llamar. */
  purgarContactoDeLotes(loteIds: readonly string[]): Promise<Result<number>>;
}
