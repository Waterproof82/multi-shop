import { type NextRequest, NextResponse } from 'next/server';
import { productUseCase, categoryUseCase, complementoGrupoRepository } from '@/core/infrastructure/database';
import { requireAuth, requireRole, validationErrorResponse } from '@/core/infrastructure/api/helpers';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';

export async function GET(req: NextRequest) {
  const { empresaId, error: authError } = await requireAuth(req);
  if (authError) return authError;
  const forbidden = requireRole(req, ['cajero', 'encargado', 'admin', 'superadmin']);
  if (forbidden) return forbidden;
  if (!empresaId) return validationErrorResponse('empresaId requerido');

  const supabase = getSupabaseClient();
  const [productsResult, categoriesResult, empresaRes, gruposResult] = await Promise.all([
    productUseCase.getAll(empresaId),
    categoryUseCase.getAll(empresaId),
    supabase
      .from('empresas')
      .select('tipo_impuesto, porcentaje_impuesto')
      .eq('id', empresaId)
      .maybeSingle(),
    complementoGrupoRepository.findAllByTenant(empresaId),
  ]);

  const activeIds = (productsResult.success ? productsResult.data : [])
    .filter((p: { activo: boolean }) => p.activo)
    .map((p: { id: string }) => p.id);

  const assignmentsResult = await complementoGrupoRepository.findAssignmentsByProductos(activeIds, empresaId);

  const empresaRow = empresaRes.data as { tipo_impuesto: string | null; porcentaje_impuesto: number | null } | null;

  return NextResponse.json({
    products: productsResult.success ? productsResult.data : [],
    categories: categoriesResult.success ? categoriesResult.data : [],
    tipoImpuesto: (empresaRow?.tipo_impuesto as 'iva' | 'igic' | null) ?? 'iva',
    porcentajeImpuesto: empresaRow?.porcentaje_impuesto ?? 10,
    complementoGrupos: gruposResult.success ? gruposResult.data : [],
    productoGrupos: assignmentsResult.success ? assignmentsResult.data : [],
  });
}
