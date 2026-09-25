import { type NextRequest } from 'next/server';
import { getLandingSeccionUseCase } from '@/core/infrastructure/database';
import { resolveAdminContextWithEmpresa, handleResultWithStatus } from '@/core/infrastructure/api/helpers';

export async function GET(request: NextRequest) {
  const ctx = await resolveAdminContextWithEmpresa(request);
  if (ctx.error) return ctx.error;
  const { empresaId } = ctx;

  const result = await getLandingSeccionUseCase().getAll(empresaId);
  return handleResultWithStatus(result);
}
