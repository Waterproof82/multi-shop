import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';

const ALLOWED_PATTERN = /^tpv-setup-[\d.]+\.(exe|blockmap)$/;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ file: string }> },
): Promise<NextResponse> {
  const { file } = await params;

  if (!ALLOWED_PATTERN.test(file)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase.storage
    .from('app-releases')
    .createSignedUrl(file, 3600);

  if (error ?? !data) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  return NextResponse.redirect(data.signedUrl, 307);
}
