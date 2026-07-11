import { type NextRequest, NextResponse } from 'next/server';
import { productUseCase, categoryUseCase } from '@/core/infrastructure/database';
import { requireAuth, requireRole, validationErrorResponse } from '@/core/infrastructure/api/helpers';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';

export async function GET(req: NextRequest) {
  const { empresaId, error: authError } = await requireAuth(req);
  if (authError) return authError;
  const forbidden = requireRole(req, ['cajero', 'encargado', 'admin', 'superadmin']);
  if (forbidden) return forbidden;
  if (!empresaId) return validationErrorResponse('empresaId requerido');

  const supabase = getSupabaseClient();
  const [productsResult, categoriesResult, empresaRes] = await Promise.all([
    productUseCase.getAll(empresaId),
    categoryUseCase.getAll(empresaId),
    supabase
      .from('empresas')
      .select('tipo_impuesto, porcentaje_impuesto')
      .eq('id', empresaId)
      .maybeSingle(),
  ]);

  const empresaRow = empresaRes.data as { tipo_impuesto: string | null; porcentaje_impuesto: number | null } | null;

  return NextResponse.json({
    products: productsResult.success ? productsResult.data : [],
    categories: categoriesResult.success ? categoriesResult.data : [],
    tipoImpuesto: (empresaRow?.tipo_impuesto as 'iva' | 'igic' | null) ?? 'iva',
    porcentajeImpuesto: empresaRow?.porcentaje_impuesto ?? 10,
  });
}
