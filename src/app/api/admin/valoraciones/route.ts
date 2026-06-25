import { NextRequest } from 'next/server';
import { requireAuth, handleResult } from '@/core/infrastructure/api/helpers';
import { rateLimitAdmin } from '@/core/infrastructure/api/rate-limit';
import { valoracionUseCase } from '@/core/infrastructure/database';
import { z } from 'zod';

const pageSchema = z.coerce.number().int().min(0).default(0);

export async function GET(request: NextRequest) {
  const rateLimited = await rateLimitAdmin(request);
  if (rateLimited) return rateLimited;

  const { empresaId, error } = await requireAuth(request);
  if (error) return error;

  const page = pageSchema.parse(request.nextUrl.searchParams.get('page') ?? '0');

  const [statsResult, listResult] = await Promise.all([
    valoracionUseCase.getStats(empresaId!),
    valoracionUseCase.list(empresaId!, page),
  ]);

  if (!statsResult.success) return handleResult(statsResult);
  if (!listResult.success) return handleResult(listResult);

  return handleResult({ success: true, data: { stats: statsResult.data, list: listResult.data } });
}
