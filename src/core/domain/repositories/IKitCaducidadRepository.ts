// src/core/domain/repositories/IKitCaducidadRepository.ts
import type { Result } from '@/core/domain/entities/types';
import type {
  ProductoKit, ConsumibleKit, KitLote, KitLoteCaducidad, CaducidadInput,
  Paginado, CreateKitLoteInput, Pagina,
} from '@/core/domain/entities/kit-caducidad-types';

/**
 * Troceo de M4a2 (auto-chain, tasks.md): la estimación de ~390 líneas no
 * cubría el peso real de introducir todo el dominio + repositorio + 4 casos
 * de uso con TDD estricto (~900 líneas). Se divide en rebanadas verticales
 * independientemente revisables y mergeables:
 *   - M4a2  (hecho): lotes — crear y listar.
 *   - M4a2b (esta): `findCaducidades`/`replaceCaducidades` (DD5, RPC
 *     transaccional) + `getKitLoteEditor`/`replaceKitLoteCaducidades.use-case.ts`.
 *   - M4b1 (siguiente): `findLineasCandidatas`/`findPartesUsadas` (DD8/R-M4.3.5),
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
}
