import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';

const VERSION = process.env.APP_VERSION ?? '1.2.11';
const parsed = parseInt(process.env.APP_VERSION_CODE ?? '31', 10);
const VERSION_CODE = Number.isNaN(parsed) ? 1 : parsed;
const APK_PATH = `waiter-${VERSION_CODE}.apk`;

const TPV_VERSION = process.env.TPV_VERSION ?? null;
const TPV_EXE_PATH = TPV_VERSION ? `tpv-${TPV_VERSION}.exe` : null;

export async function GET() {
  const supabase = getSupabaseClient();

  const [apkResult, tpvResult] = await Promise.all([
    supabase.storage.from('app-releases').createSignedUrl(APK_PATH, 3600),
    TPV_EXE_PATH
      ? supabase.storage.from('app-releases').createSignedUrl(TPV_EXE_PATH, 3600)
      : Promise.resolve({ data: null, error: null }),
  ]);

  return NextResponse.json({
    version: VERSION,
    versionCode: VERSION_CODE,
    apkUrl: apkResult.data?.signedUrl ?? null,
    tpv: TPV_VERSION
      ? { version: TPV_VERSION, exeUrl: tpvResult.data?.signedUrl ?? null }
      : null,
  });
}
