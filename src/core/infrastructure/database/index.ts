import { getSupabaseClient, getSupabaseAnonClient } from './supabase-client';
import { SupabaseProductRepository } from './SupabaseProductRepository';
import { SupabaseCategoryRepository } from './SupabaseCategoryRepository';
import { SupabaseAdminRepository } from './SupabaseAdminRepository';
import { SupabaseClienteRepository } from './supabase-cliente.repository';
import { SupabaseEmpresaRepository } from './supabase-empresa.repository';
import { SupabasePromocionRepository } from './supabase-promocion.repository';
import { SupabasePedidoRepository } from './supabase-pedido.repository';
import { SupabaseMesaRepository } from './supabase-mesa.repository';
import { SupabaseMesaSesionRepository } from './supabase-mesa-sesion.repository';
import { SupabaseSuperAdminRepository } from './SupabaseSuperAdminRepository';
import { SupabaseTgtgRepository } from './supabase-tgtg.repository';
import { SupabaseDescuentoRepository } from './supabase-descuento.repository';
import { SupabaseMesaClientTokenRepository } from './supabase-mesa-client-token.repository';
import { SupabaseValoracionRepository } from './supabase-valoracion.repository';
import { SupabaseEmpleadoTpvRepository } from '../repositories/supabase-empleado-tpv.repository';
import { ProductUseCase } from '@/core/application/use-cases/product.use-case';
import { CategoryUseCase } from '@/core/application/use-cases/category.use-case';
import { ClienteUseCase } from '@/core/application/use-cases/cliente.use-case';
import { EmpresaUseCase } from '@/core/application/use-cases/empresa.use-case';
import { PedidoUseCase } from '@/core/application/use-cases/pedido.use-case';
import { MesaUseCase } from '@/core/application/use-cases/mesa.use-case';
import { MesaSesionUseCase } from '@/core/application/use-cases/mesa-sesion.use-case';
import { PromocionUseCase } from '@/core/application/use-cases/promocion.use-case';
import { TgtgUseCase } from '@/core/application/use-cases/tgtg.use-case';
import { AuthAdminUseCase } from '@/core/application/use-cases/auth-admin.use-case';
import { SuperAdminUseCase } from '@/core/application/use-cases/superadmin.use-case';
import { DescuentoUseCase } from '@/core/application/use-cases/descuento.use-case';
import { MesaClientTokenUseCase } from '@/core/application/use-cases/mesa-client-token.use-case';
import { ValoracionUseCase } from '@/core/application/use-cases/valoracion.use-case';
import { EmpleadoTpvLoginUseCase } from '@/core/application/use-cases/tpv/empleado-tpv-login.use-case';
import { SupabaseComplementoGrupoRepository } from './supabase-complemento-grupo.repository';
import { ComplementoGrupoUseCase } from '@/core/application/use-cases/complemento-grupo.use-case';
import { SupabaseStockRepository } from '../repositories/supabase-stock.repository';
import { SupabaseTpvRepository } from '../repositories/supabase-tpv.repository';

// ---------------------------------------------------------------------------
// Private lazy repository getters (shared between use cases, not exported)
// ---------------------------------------------------------------------------

let _clienteRepository: SupabaseClienteRepository | undefined;
function getClienteRepository(): SupabaseClienteRepository {
  return _clienteRepository ??= new SupabaseClienteRepository(getSupabaseClient());
}

let _productRepository: SupabaseProductRepository | undefined;
function getProductRepository(): SupabaseProductRepository {
  return _productRepository ??= new SupabaseProductRepository(getSupabaseClient());
}

let _descuentoRepository: SupabaseDescuentoRepository | undefined;
function getDescuentoRepository(): SupabaseDescuentoRepository {
  return _descuentoRepository ??= new SupabaseDescuentoRepository(getSupabaseClient());
}

// ---------------------------------------------------------------------------
// Public lazy repository getters (used directly by some routes/use-cases)
// ---------------------------------------------------------------------------

let _empresaRepository: SupabaseEmpresaRepository | undefined;
export function getEmpresaRepository(): SupabaseEmpresaRepository {
  return _empresaRepository ??= new SupabaseEmpresaRepository(getSupabaseClient());
}

let _pedidoRepository: SupabasePedidoRepository | undefined;
export function getPedidoRepository(): SupabasePedidoRepository {
  return _pedidoRepository ??= new SupabasePedidoRepository(getSupabaseClient());
}

let _mesaRepository: SupabaseMesaRepository | undefined;
export function getMesaRepository(): SupabaseMesaRepository {
  return _mesaRepository ??= new SupabaseMesaRepository(getSupabaseClient());
}

let _mesaSesionRepository: SupabaseMesaSesionRepository | undefined;
export function getMesaSesionRepository(): SupabaseMesaSesionRepository {
  return _mesaSesionRepository ??= new SupabaseMesaSesionRepository(getSupabaseClient());
}

let _valoracionRepository: SupabaseValoracionRepository | undefined;
export function getValoracionRepository(): SupabaseValoracionRepository {
  return _valoracionRepository ??= new SupabaseValoracionRepository(getSupabaseClient());
}

let _empleadoTpvRepository: SupabaseEmpleadoTpvRepository | undefined;
export function getEmpleadoTpvRepository(): SupabaseEmpleadoTpvRepository {
  return _empleadoTpvRepository ??= new SupabaseEmpleadoTpvRepository();
}

let _complementoGrupoRepository: SupabaseComplementoGrupoRepository | undefined;
export function getComplementoGrupoRepository(): SupabaseComplementoGrupoRepository {
  return _complementoGrupoRepository ??= new SupabaseComplementoGrupoRepository(getSupabaseClient());
}

let _empresaPublicRepository: SupabaseEmpresaRepository | undefined;
export function getEmpresaPublicRepository(): SupabaseEmpresaRepository {
  return _empresaPublicRepository ??= new SupabaseEmpresaRepository(getSupabaseAnonClient());
}

// ---------------------------------------------------------------------------
// Public lazy use case getters
// ---------------------------------------------------------------------------

let _productUseCase: ProductUseCase | undefined;
export function getProductUseCase(): ProductUseCase {
  return _productUseCase ??= new ProductUseCase(getProductRepository());
}

let _categoryUseCase: CategoryUseCase | undefined;
export function getCategoryUseCase(): CategoryUseCase {
  return _categoryUseCase ??= new CategoryUseCase(
    new SupabaseCategoryRepository(getSupabaseClient())
  );
}

let _clienteUseCase: ClienteUseCase | undefined;
export function getClienteUseCase(): ClienteUseCase {
  return _clienteUseCase ??= new ClienteUseCase(getClienteRepository());
}

let _empresaUseCase: EmpresaUseCase | undefined;
export function getEmpresaUseCase(): EmpresaUseCase {
  return _empresaUseCase ??= new EmpresaUseCase(getEmpresaRepository());
}

let _pedidoUseCase: PedidoUseCase | undefined;
export function getPedidoUseCase(): PedidoUseCase {
  return _pedidoUseCase ??= new PedidoUseCase(
    getPedidoRepository(),
    getClienteRepository(),
    getProductRepository(),
    getDescuentoRepository(),
    getMesaSesionRepository()
  );
}

let _mesaUseCase: MesaUseCase | undefined;
export function getMesaUseCase(): MesaUseCase {
  return _mesaUseCase ??= new MesaUseCase(getMesaRepository());
}

let _mesaSesionUseCase: MesaSesionUseCase | undefined;
export function getMesaSesionUseCase(): MesaSesionUseCase {
  return _mesaSesionUseCase ??= new MesaSesionUseCase(
    getMesaSesionRepository(),
    getMesaRepository()
  );
}

let _promocionUseCase: PromocionUseCase | undefined;
export function getPromocionUseCase(): PromocionUseCase {
  return _promocionUseCase ??= new PromocionUseCase(
    new SupabasePromocionRepository(getSupabaseClient()),
    getClienteRepository()
  );
}

let _tgtgUseCase: TgtgUseCase | undefined;
export function getTgtgUseCase(): TgtgUseCase {
  return _tgtgUseCase ??= new TgtgUseCase(
    new SupabaseTgtgRepository(getSupabaseClient()),
    getClienteRepository()
  );
}

let _authAdminUseCase: AuthAdminUseCase | undefined;
export function getAuthAdminUseCase(): AuthAdminUseCase {
  return _authAdminUseCase ??= new AuthAdminUseCase(
    new SupabaseAdminRepository(getSupabaseClient(), getSupabaseAnonClient())
  );
}

let _superAdminUseCase: SuperAdminUseCase | undefined;
export function getSuperAdminUseCase(): SuperAdminUseCase {
  return _superAdminUseCase ??= new SuperAdminUseCase(
    new SupabaseSuperAdminRepository(getSupabaseClient())
  );
}

let _descuentoUseCase: DescuentoUseCase | undefined;
export function getDescuentoUseCase(): DescuentoUseCase {
  return _descuentoUseCase ??= new DescuentoUseCase(
    getDescuentoRepository(),
    getEmpresaRepository()
  );
}

let _mesaClientTokenUseCase: MesaClientTokenUseCase | undefined;
export function getMesaClientTokenUseCase(): MesaClientTokenUseCase {
  return _mesaClientTokenUseCase ??= new MesaClientTokenUseCase(
    new SupabaseMesaClientTokenRepository(getSupabaseClient()),
    getMesaSesionRepository()
  );
}

let _valoracionUseCase: ValoracionUseCase | undefined;
export function getValoracionUseCase(): ValoracionUseCase {
  return _valoracionUseCase ??= new ValoracionUseCase(getValoracionRepository());
}

let _empleadoTpvLoginUseCase: EmpleadoTpvLoginUseCase | undefined;
export function getEmpleadoTpvLoginUseCase(): EmpleadoTpvLoginUseCase {
  return _empleadoTpvLoginUseCase ??= new EmpleadoTpvLoginUseCase(getEmpleadoTpvRepository());
}

let _complementoGrupoUseCase: ComplementoGrupoUseCase | undefined;
export function getComplementoGrupoUseCase(): ComplementoGrupoUseCase {
  return _complementoGrupoUseCase ??= new ComplementoGrupoUseCase(getComplementoGrupoRepository());
}

let _stockRepository: SupabaseStockRepository | undefined;
export function getStockRepository(): SupabaseStockRepository {
  return _stockRepository ??= new SupabaseStockRepository();
}

let _tpvRepository: SupabaseTpvRepository | undefined;
export function getTpvRepository(): SupabaseTpvRepository {
  return _tpvRepository ??= new SupabaseTpvRepository();
}

import type { IComprasRepository } from '@/core/domain/repositories/IComprasRepository';
import { SupabaseComprasRepository } from './supabase-compras.repository';

let _comprasRepository: IComprasRepository | undefined;
export function getComprasRepository(): IComprasRepository {
  return _comprasRepository ??= new SupabaseComprasRepository();
}

import { SupabaseAnalyticsRepository } from '../repositories/supabase-analytics.repository';
import { AnalyticsUseCase } from '@/core/application/use-cases/analytics.use-case';

let _analyticsRepository: SupabaseAnalyticsRepository | undefined;
export function getAnalyticsRepository(): SupabaseAnalyticsRepository {
  return _analyticsRepository ??= new SupabaseAnalyticsRepository();
}

let _analyticsUseCase: AnalyticsUseCase | undefined;
export function getAnalyticsUseCase(): AnalyticsUseCase {
  return _analyticsUseCase ??= new AnalyticsUseCase(getAnalyticsRepository());
}
