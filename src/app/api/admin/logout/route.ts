import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { rateLimitAdmin } from '@/core/infrastructure/api/rate-limit';

export async function POST(request: NextRequest) {
  const rateLimited = await rateLimitAdmin(request);
  if (rateLimited) return rateLimited;

  const cookieStore = await cookies();
  cookieStore.delete('admin_token');
  cookieStore.delete('csrf_token');

  return NextResponse.json({ success: true });
}
