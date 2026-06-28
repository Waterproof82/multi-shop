import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';

const VERSION = process.env.APP_VERSION ?? '1.0.0';
const VERSION_CODE = parseInt(process.env.APP_VERSION_CODE ?? '1', 10);
const APK_PATH = `waiter-${VERSION_CODE}.apk`;

export async function GET() {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase.storage
    .from('app-releases')
    .createSignedUrl(APK_PATH, 3600); // 1h expiry

  if (error || !data) {
    // APK not yet uploaded — return version info without URL
    return NextResponse.json({
      version: VERSION,
      versionCode: VERSION_CODE,
      apkUrl: null,
    });
  }

  return NextResponse.json({
    version: VERSION,
    versionCode: VERSION_CODE,
    apkUrl: data.signedUrl,
  });
}
