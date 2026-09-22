import { type NextRequest } from 'next/server';
import { getMenuVirtualUseCase } from '@/core/infrastructure/database';
import { createMenuVirtualSchema } from '@/core/application/dtos/menu-virtual.dto';
import { resolveAdminContextWithEmpresa, handleResultWithStatus, validationErrorResponse } from '@/core/infrastructure/api/helpers';

export async function GET(request: NextRequest) {
  const ctx = await resolveAdminContextWithEmpresa(request);
  if (ctx.error) return ctx.error;
  const { empresaId } = ctx;

  const [nodosResult, countsResult] = await Promise.all([
    getMenuVirtualUseCase().getAll(empresaId),
    getMenuVirtualUseCase().getProductCounts(empresaId),
  ]);

  if (!nodosResult.success) return handleResultWithStatus(nodosResult);
  if (!countsResult.success) return handleResultWithStatus(countsResult);

  const nodosConConteo = nodosResult.data.map(nodo => ({
    ...nodo,
    productosCount: countsResult.data.get(nodo.id) ?? 0,
  }));

  return handleResultWithStatus({ success: true as const, data: nodosConConteo });
}

export async function POST(request: NextRequest) {
  const ctx = await resolveAdminContextWithEmpresa(request);
  if (ctx.error) return ctx.error;
  const { empresaId } = ctx;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return validationErrorResponse('JSON inválido');
  }

  const parsed = createMenuVirtualSchema.safeParse({ ...(body as Record<string, unknown>), empresaId });
  if (!parsed.success) {
    return validationErrorResponse(parsed.error.issues[0].message);
  }

  const result = await getMenuVirtualUseCase().create(parsed.data);
  return handleResultWithStatus(result, 201);
}
