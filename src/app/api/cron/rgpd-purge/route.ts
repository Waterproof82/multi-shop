import { NextRequest, NextResponse } from 'next/server';
import { getClienteRepository } from '@/core/infrastructure/database';
import { purgeExpiredClientesUseCase } from '@/core/application/use-cases/rgpd/purge-expired-clientes.use-case';

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('authorization');

  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const repo = getClienteRepository();
  const result = await purgeExpiredClientesUseCase(repo);

  if (!result.success) {
    return NextResponse.json({ error: result.error.message }, { status: 500 });
  }

  return NextResponse.json({ anonymized: result.data });
}
