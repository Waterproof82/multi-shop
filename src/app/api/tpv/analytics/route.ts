import { NextRequest } from 'next/server';
import {
  requireAuth,
  requireRole,
  handleResult,
  validationErrorResponse,
  type AuthResult,
} from '@/core/infrastructure/api/helpers';
import { SupabaseTpvRepository } from '@/core/infrastructure/repositories/supabase-tpv.repository';
import { z } from 'zod';

const querySchema = z.object({
  desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato inválido: YYYY-MM-DD'),
  hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato inválido: YYYY-MM-DD'),
}).refine(
  ({ desde, hasta }) => {
    const d = new Date(desde);
    const h = new Date(hasta);
    const diffDays = (h.getTime() - d.getTime()) / 86_400_000;
    return diffDays >= 0 && diffDays <= 365;
  },
  { message: 'El rango no puede superar 365 días ni ser negativo' }
);

const repo = new SupabaseTpvRepository();

export async function GET(req: NextRequest) {
  const { empresaId, error: authError } = (await requireAuth(req)) as AuthResult;
  if (authError) return authError;

  const forbidden = requireRole(req, ['admin', 'superadmin']);
  if (forbidden) return forbidden;

  if (!empresaId) return validationErrorResponse('empresaId requerido');

  const { searchParams } = new URL(req.url);
  const raw = {
    desde: searchParams.get('desde') ?? '',
    hasta: searchParams.get('hasta') ?? '',
  };

  const parsed = querySchema.safeParse(raw);
  if (!parsed.success) {
    return validationErrorResponse(parsed.error.errors[0].message);
  }

  const result = await repo.getAnalytics({
    empresaId,
    desde: parsed.data.desde,
    hasta: parsed.data.hasta,
  });

  return handleResult(result);
}
