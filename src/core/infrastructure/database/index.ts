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

const supabase = getSupabaseClient();

export const productRepository = new SupabaseProductRepository(supabase);
export const categoryRepository = new SupabaseCategoryRepository(supabase);
export const adminRepository = new SupabaseAdminRepository(supabase, getSupabaseAnonClient());
export const clienteRepository = new SupabaseClienteRepository(supabase);
export const empresaRepository = new SupabaseEmpresaRepository(supabase);
export const promocionRepository = new SupabasePromocionRepository(supabase);
export const pedidoRepository = new SupabasePedidoRepository(supabase);

// Use Cases (Clean Architecture - Application Layer)
export const productUseCase = new ProductUseCase(productRepository);
export const categoryUseCase = new CategoryUseCase(categoryRepository);
export const clienteUseCase = new ClienteUseCase(clienteRepository);
export const empresaUseCase = new EmpresaUseCase(empresaRepository);
export const pedidoUseCase = new PedidoUseCase(pedidoRepository, clienteRepository);
