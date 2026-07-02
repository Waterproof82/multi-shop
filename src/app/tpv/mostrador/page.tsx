import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { authAdminUseCase, productUseCase, categoryUseCase } from '@/core/infrastructure/database';
import { SupabaseTpvRepository } from '@/core/infrastructure/repositories/supabase-tpv.repository';
import { MostradorClient } from '@/components/tpv/MostradorClient';

export const dynamic = 'force-dynamic';

export default async function MostradorPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('admin_token')?.value;

  if (!token) redirect('/admin/login');

  const admin = await authAdminUseCase.verifyToken(token);

  if (!admin) redirect('/admin/login');
  if (!admin.empresaId) redirect('/admin/login');

  const repo = new SupabaseTpvRepository();
  const turnoResult = await repo.findTurnoActivo(admin.empresaId);

  if (!turnoResult.success || turnoResult.data === null) {
    redirect('/tpv/turno/abrir');
  }

  const [productsResult, categoriesResult] = await Promise.all([
    productUseCase.getAll(admin.empresaId),
    categoryUseCase.getAll(admin.empresaId),
  ]);

  const products = productsResult.success ? productsResult.data : [];
  const categories = categoriesResult.success ? categoriesResult.data : [];

  return (
    <MostradorClient
      turno={turnoResult.data}
      products={products}
      categories={categories}
    />
  );
}
