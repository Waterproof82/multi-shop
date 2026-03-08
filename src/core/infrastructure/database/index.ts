import { getSupabaseClient, getSupabaseAnonClient } from './supabase-client';
import { SupabaseProductRepository } from './SupabaseProductRepository';
import { SupabaseCategoryRepository } from './SupabaseCategoryRepository';
import { SupabaseAdminRepository } from './SupabaseAdminRepository';
import { SupabaseClienteRepository, SupabaseEmpresaRepository } from './SupabaseClienteEmpresaRepository';
import { SupabasePromocionRepository, SupabasePedidoRepository } from './SupabasePromocionPedidoRepository';
import { ProductUseCase } from '@/core/application/use-cases/product.use-case';
import { CategoryUseCase } from '@/core/application/use-cases/category.use-case';
import { ClienteUseCase } from '@/core/application/use-cases/cliente.use-case';
import { EmpresaUseCase } from '@/core/application/use-cases/empresa.use-case';
import { PedidoUseCase } from '@/core/application/use-cases/pedido.use-case';
import { PromocionUseCase } from '@/core/application/use-cases/promocion.use-case';
import { AuthAdminUseCase } from '@/core/application/use-cases/auth-admin.use-case';

const supabase = getSupabaseClient();
const supabaseAnon = getSupabaseAnonClient();

const productRepository = new SupabaseProductRepository(supabase);
const categoryRepository = new SupabaseCategoryRepository(supabase);
export const adminRepository = new SupabaseAdminRepository(supabase, supabaseAnon);
const clienteRepository = new SupabaseClienteRepository(supabase);
export const empresaRepository = new SupabaseEmpresaRepository(supabase);
const promocionRepository = new SupabasePromocionRepository(supabase);
const pedidoRepository = new SupabasePedidoRepository(supabase);

// Public repository (anon key) for public-facing pages
export const empresaPublicRepository = new SupabaseEmpresaRepository(supabaseAnon);

// Use Cases (Clean Architecture - Application Layer)
export const productUseCase = new ProductUseCase(productRepository);
export const categoryUseCase = new CategoryUseCase(categoryRepository);
export const clienteUseCase = new ClienteUseCase(clienteRepository);
export const empresaUseCase = new EmpresaUseCase(empresaRepository);
export const pedidoUseCase = new PedidoUseCase(pedidoRepository, clienteRepository);
export const promocionUseCase = new PromocionUseCase(promocionRepository, clienteRepository);
export const authAdminUseCase = new AuthAdminUseCase(adminRepository);
