// src/core/domain/repositories/IKitCaducidadRepository.ts
import type { Result } from '@/core/domain/entities/types';
import type {
  ProductoKit, ConsumibleKit, KitLote, KitLoteCaducidad, CaducidadInput,
  LineaCandidata, KitSerie, KitRegistradoListado, ContactoKit, Paginado, CreateKitLoteInput, Pagina,
} from '@/core/domain/entities/kit-caducidad-types';

/**
 * Troceo de M4a2 (auto-chain, tasks.md): la estimación de ~390 líneas no
 * cubría el peso real de introducir todo el dominio + repositorio + 4 casos
 * de uso con TDD estricto (~900 líneas). Se dividió en rebanadas verticales
 * independientemente revisables y mergeables:
 *   - M4a2  (hecho): lotes — crear y listar.
 *   - M4a2b (hecho): `findCaducidades`/`replaceCaducidades` (DD5, RPC
 *     transaccional) + `getKitLoteEditor`/`replaceKitLoteCaducidades.use-case.ts`.
 *   - M4b1 (esta): `findLineasCandidatas`/`findPartesUsadas` (DD8/R-M4.3.5),
 *     junto con la ruta `api/admin/kits/candidatas` que los consume.
 */
export interface IKitCaducidadRepository {
  findProductosKit(empresaId: string): Promise<Result<ProductoKit[]>>;
  findConsumiblesDelKit(empresaId: string, productoId: string): Promise<Result<ConsumibleKit[]>>;
  createLote(empresaId: string, input: CreateKitLoteInput): Promise<Result<KitLote>>;
  findLotes(empresaId: string, pagina: Pagina): Promise<Result<Paginado<KitLote>>>;
  findLoteById(empresaId: string, loteId: string): Promise<Result<KitLote | null>>;
  findCaducidades(empresaId: string, loteId: string): Promise<Result<KitLoteCaducidad[]>>;
  replaceCaducidades(empresaId: string, loteId: string, items: CaducidadInput[]): Promise<Result<void>>;
  /** DD8: solo albaranes `recibido`, `fecha_caducidad >= desde`, orden ascendente, `.limit(200)`. */
  findLineasCandidatas(empresaId: string, ingredienteIds: string[], desde: string): Promise<Result<LineaCandidata[]>>;
  /** R-M4.3.5: valores `DISTINCT` de `parte` ya usados por la propia empresa. */
  findPartesUsadas(empresaId: string): Promise<Result<string[]>>;
  /**
   * DD10: `upsert(..., { onConflict: 'serie', ignoreDuplicates: true }).select('serie')`
   * — `ON CONFLICT DO NOTHING RETURNING`. Devuelve solo las series que
   * efectivamente se insertaron (`pedido_id` queda NULL); el caso de uso
   * reintenta lo que falte.
   */
  insertSeriesIgnorandoDuplicados(empresaId: string, loteId: string, series: string[]): Promise<Result<string[]>>;
  /** R-M4.4.5/DD11: recorre `.range()` en bloques de 1000 hasta agotar, para exportar todas las series del lote. */
  findSeriesDeLote(empresaId: string, loteId: string): Promise<Result<KitSerie[]>>;
  /** R-M4.5.1/DD11: paginado real (`.range()`, `count: 'exact'`), email/telefono ya enmascarados en el mapper (DD12). */
  findRegistrados(empresaId: string, pagina: Pagina): Promise<Result<Paginado<KitRegistradoListado>>>;
  /** R-M4.5.2: único método que devuelve el email/telefono completos de una fila. */
  findContacto(empresaId: string, serie: string): Promise<Result<ContactoKit | null>>;
}
