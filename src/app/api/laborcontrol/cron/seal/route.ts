import { NextRequest, NextResponse } from 'next/server';
import { getLcChainRepo } from '@/core/laborcontrol/infrastructure';

// GET /api/laborcontrol/cron/seal
// Vercel Cron job — seals previous month's chain anchors
// Secured by CRON_SECRET
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('authorization');

  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  // Seal the previous month
  const month = now.getMonth() === 0 ? 12 : now.getMonth();
  const year  = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();

  const repo = getLcChainRepo();
  const result = await repo.sealMonthAnchors(year, month);

  if (!result.success) {
    return NextResponse.json({ error: result.error.message }, { status: 500 });
  }

  return NextResponse.json({ sealed: result.data.length, year, month });
}
