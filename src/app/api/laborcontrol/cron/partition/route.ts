import { NextRequest, NextResponse } from 'next/server';
import { getLcChainRepo } from '@/core/laborcontrol/infrastructure';
import { verifyCronSecret } from '@/lib/cron-auth';

// GET /api/laborcontrol/cron/partition
// Vercel Cron job — creates next month's partition
// Secured by CRON_SECRET
export async function GET(req: NextRequest) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const repo = getLcChainRepo();
  const result = await repo.createNextPartition();

  if (!result.success) {
    return NextResponse.json({ error: result.error.message }, { status: 500 });
  }

  return NextResponse.json({ message: result.data });
}
