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
import type { IComprasRepository } from '@/core/domain/repositories/IComprasRepository';
import { SupabaseComprasRepository } from './supabase-compras.repository';
import { SupabaseAnalyticsRepository } from '../repositories/supabase-analytics.repository';
import { AnalyticsUseCase } from '@/core/application/use-cases/analytics.use-case';

// ---------------------------------------------------------------------------
// Private lazy repository getters (shared between use cases, not exported)
// ---------------------------------------------------------------------------

let _clienteRepository: SupabaseClienteRepository | undefined;
function getClienteRepository(): SupabaseClienteRepository {
  _clienteRepository ??= new SupabaseClienteRepository(getSupabaseClient());
  return _clienteRepository;
}

let _productRepository: SupabaseProductRepository | undefined;
function getProductRepository(): SupabaseProductRepository {
  _productRepository ??= new SupabaseProductRepository(getSupabaseClient());
  return _productRepository;
}

let _descuentoRepository: SupabaseDescuentoRepository | undefined;
function getDescuentoRepository(): SupabaseDescuentoRepository {
  _descuentoRepository ??= new SupabaseDescuentoRepository(getSupabaseClient());
  return _descuentoRepository;
}

// ---------------------------------------------------------------------------
// Public lazy repository getters (used directly by some routes/use-cases)
// ---------------------------------------------------------------------------

let _empresaRepository: SupabaseEmpresaRepository | undefined;
export function getEmpresaRepository(): SupabaseEmpresaRepository {
  _empresaRepository ??= new SupabaseEmpresaRepository(getSupabaseClient());
  return _empresaRepository;
}

let _pedidoRepository: SupabasePedidoRepository | undefined;
export function getPedidoRepository(): SupabasePedidoRepository {
  _pedidoRepository ??= new SupabasePedidoRepository(getSupabaseClient());
  return _pedidoRepository;
}

let _mesaRepository: SupabaseMesaRepository | undefined;
export function getMesaRepository(): SupabaseMesaRepository {
  _mesaRepository ??= new SupabaseMesaRepository(getSupabaseClient());
  return _mesaRepository;
}

let _mesaSesionRepository: SupabaseMesaSesionRepository | undefined;
export function getMesaSesionRepository(): SupabaseMesaSesionRepository {
  _mesaSesionRepository ??= new SupabaseMesaSesionRepository(getSupabaseClient());
  return _mesaSesionRepository;
}

let _valoracionRepository: SupabaseValoracionRepository | undefined;
function getValoracionRepository(): SupabaseValoracionRepository {
  _valoracionRepository ??= new SupabaseValoracionRepository(getSupabaseClient());
  return _valoracionRepository;
}

let _empleadoTpvRepository: SupabaseEmpleadoTpvRepository | undefined;
export function getEmpleadoTpvRepository(): SupabaseEmpleadoTpvRepository {
  _empleadoTpvRepository ??= new SupabaseEmpleadoTpvRepository();
  return _empleadoTpvRepository;
}

let _complementoGrupoRepository: SupabaseComplementoGrupoRepository | undefined;
export function getComplementoGrupoRepository(): SupabaseComplementoGrupoRepository {
  _complementoGrupoRepository ??= new SupabaseComplementoGrupoRepository(getSupabaseClient());
  return _complementoGrupoRepository;
}

let _empresaPublicRepository: SupabaseEmpresaRepository | undefined;
export function getEmpresaPublicRepository(): SupabaseEmpresaRepository {
  _empresaPublicRepository ??= new SupabaseEmpresaRepository(getSupabaseAnonClient());
  return _empresaPublicRepository;
}

// ---------------------------------------------------------------------------
// Public lazy use case getters
// ---------------------------------------------------------------------------

let _productUseCase: ProductUseCase | undefined;
export function getProductUseCase(): ProductUseCase {
  _productUseCase ??= new ProductUseCase(getProductRepository());
  return _productUseCase;
}

let _categoryUseCase: CategoryUseCase | undefined;
export function getCategoryUseCase(): CategoryUseCase {
  _categoryUseCase ??= new CategoryUseCase(new SupabaseCategoryRepository(getSupabaseClient()));
  return _categoryUseCase;
}

let _clienteUseCase: ClienteUseCase | undefined;
export function getClienteUseCase(): ClienteUseCase {
  _clienteUseCase ??= new ClienteUseCase(getClienteRepository());
  return _clienteUseCase;
}

let _empresaUseCase: EmpresaUseCase | undefined;
export function getEmpresaUseCase(): EmpresaUseCase {
  _empresaUseCase ??= new EmpresaUseCase(getEmpresaRepository());
  return _empresaUseCase;
}

let _pedidoUseCase: PedidoUseCase | undefined;
export function getPedidoUseCase(): PedidoUseCase {
  _pedidoUseCase ??= new PedidoUseCase(
    getPedidoRepository(),
    getClienteRepository(),
    getProductRepository(),
    getDescuentoRepository(),
    getMesaSesionRepository()
  );
  return _pedidoUseCase!;
}

let _mesaUseCase: MesaUseCase | undefined;
export function getMesaUseCase(): MesaUseCase {
  _mesaUseCase ??= new MesaUseCase(getMesaRepository());
  return _mesaUseCase;
}

let _mesaSesionUseCase: MesaSesionUseCase | undefined;
export function getMesaSesionUseCase(): MesaSesionUseCase {
  _mesaSesionUseCase ??= new MesaSesionUseCase(getMesaSesionRepository(), getMesaRepository());
  return _mesaSesionUseCase;
}

let _promocionUseCase: PromocionUseCase | undefined;
export function getPromocionUseCase(): PromocionUseCase {
  _promocionUseCase ??= new PromocionUseCase(
    new SupabasePromocionRepository(getSupabaseClient()),
    getClienteRepository()
  );
  return _promocionUseCase;
}

let _tgtgUseCase: TgtgUseCase | undefined;
export function getTgtgUseCase(): TgtgUseCase {
  _tgtgUseCase ??= new TgtgUseCase(
    new SupabaseTgtgRepository(getSupabaseClient()),
    getClienteRepository()
  );
  return _tgtgUseCase;
}

let _authAdminUseCase: AuthAdminUseCase | undefined;
export function getAuthAdminUseCase(): AuthAdminUseCase {
  _authAdminUseCase ??= new AuthAdminUseCase(
    new SupabaseAdminRepository(getSupabaseClient(), getSupabaseAnonClient())
  );
  return _authAdminUseCase;
}

let _superAdminUseCase: SuperAdminUseCase | undefined;
export function getSuperAdminUseCase(): SuperAdminUseCase {
  _superAdminUseCase ??= new SuperAdminUseCase(new SupabaseSuperAdminRepository(getSupabaseClient()));
  return _superAdminUseCase;
}

let _descuentoUseCase: DescuentoUseCase | undefined;
export function getDescuentoUseCase(): DescuentoUseCase {
  _descuentoUseCase ??= new DescuentoUseCase(getDescuentoRepository(), getEmpresaRepository());
  return _descuentoUseCase;
}

let _mesaClientTokenUseCase: MesaClientTokenUseCase | undefined;
export function getMesaClientTokenUseCase(): MesaClientTokenUseCase {
  _mesaClientTokenUseCase ??= new MesaClientTokenUseCase(
    new SupabaseMesaClientTokenRepository(getSupabaseClient()),
    getMesaSesionRepository()
  );
  return _mesaClientTokenUseCase;
}

let _valoracionUseCase: ValoracionUseCase | undefined;
export function getValoracionUseCase(): ValoracionUseCase {
  _valoracionUseCase ??= new ValoracionUseCase(getValoracionRepository());
  return _valoracionUseCase;
}

let _empleadoTpvLoginUseCase: EmpleadoTpvLoginUseCase | undefined;
export function getEmpleadoTpvLoginUseCase(): EmpleadoTpvLoginUseCase {
  _empleadoTpvLoginUseCase ??= new EmpleadoTpvLoginUseCase(getEmpleadoTpvRepository());
  return _empleadoTpvLoginUseCase;
}

let _complementoGrupoUseCase: ComplementoGrupoUseCase | undefined;
export function getComplementoGrupoUseCase(): ComplementoGrupoUseCase {
  _complementoGrupoUseCase ??= new ComplementoGrupoUseCase(getComplementoGrupoRepository());
  return _complementoGrupoUseCase;
}

let _stockRepository: SupabaseStockRepository | undefined;
export function getStockRepository(): SupabaseStockRepository {
  _stockRepository ??= new SupabaseStockRepository();
  return _stockRepository;
}

let _tpvRepository: SupabaseTpvRepository | undefined;
export function getTpvRepository(): SupabaseTpvRepository {
  _tpvRepository ??= new SupabaseTpvRepository();
  return _tpvRepository;
}

let _comprasRepository: IComprasRepository | undefined;
export function getComprasRepository(): IComprasRepository {
  _comprasRepository ??= new SupabaseComprasRepository();
  return _comprasRepository;
}

let _analyticsRepository: SupabaseAnalyticsRepository | undefined;
function getAnalyticsRepository(): SupabaseAnalyticsRepository {
  _analyticsRepository ??= new SupabaseAnalyticsRepository();
  return _analyticsRepository;
}

let _analyticsUseCase: AnalyticsUseCase | undefined;
export function getAnalyticsUseCase(): AnalyticsUseCase {
  _analyticsUseCase ??= new AnalyticsUseCase(getAnalyticsRepository());
  return _analyticsUseCase;
}
