import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  requireAuth,
  requireRole,
  validationErrorResponse,
  type AuthResult,
} from '@/core/infrastructure/api/helpers';
import { getAuditLogRepository } from '@/core/infrastructure/database';

const querySchema = z.object({
  page: z.coerce.number().int().gte(1).default(1),
  limit: z.coerce.number().int().gte(1).lte(100).default(50),
  action: z.string().optional(),
  actorTipo: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

export async function GET(request: NextRequest) {
  const { empresaId, error: authError } = (await requireAuth(request)) as AuthResult;
  if (authError) return authError;

  const forbidden = requireRole(request, ['admin', 'superadmin']);
  if (forbidden) return forbidden;

  if (!empresaId) return validationErrorResponse('empresaId requerido');

  const searchParams = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = querySchema.safeParse(searchParams);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { page, limit, action, actorTipo, from, to } = parsed.data;

  const { items, total } = await getAuditLogRepository().findByEmpresa(empresaId, {
    page,
    limit,
    action,
    actorTipo,
    fromDate: from,
    toDate: to,
  });

  return NextResponse.json({
    data: items,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
}
