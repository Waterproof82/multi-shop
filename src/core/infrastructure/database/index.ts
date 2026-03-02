import { getSupabaseClient } from './supabase-client';
import { SupabaseProductRepository } from './SupabaseProductRepository';
import { SupabaseCategoryRepository } from './SupabaseCategoryRepository';
import { SupabaseAdminRepository } from './SupabaseAdminRepository';

const supabase = getSupabaseClient();

export const productRepository = new SupabaseProductRepository(supabase);
export const categoryRepository = new SupabaseCategoryRepository(supabase);
export const adminRepository = new SupabaseAdminRepository(supabase);
