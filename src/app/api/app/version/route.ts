import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';

const VERSION = process.env.APP_VERSION ?? '1.2.11';
const parsed = parseInt(process.env.APP_VERSION_CODE ?? '31', 10);
const VERSION_CODE = Number.isNaN(parsed) ? 1 : parsed;
const APK_PATH = `waiter-${VERSION_CODE}.apk`;

const GITHUB_REPO = 'Waterproof82/multi-shop';

interface GithubAsset {
  name: string;
  browser_download_url: string;
}

interface GithubRelease {
  tag_name: string;
  assets: GithubAsset[];
}

async function getTpvRelease(): Promise<{ version: string; exeUrl: string } | null> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
      { headers: { 'User-Agent': 'multishop-server' }, cache: 'no-store' }
    );
    if (!res.ok) return null;
    const release = await res.json() as GithubRelease;
    const version = release.tag_name?.replace(/^v/, '');
    const asset = release.assets?.find(a => a.name.startsWith('TPV') && a.name.endsWith('.exe'));
    if (!version || !asset) return null;
    return { version, exeUrl: asset.browser_download_url };
  } catch {
    return null;
  }
}

export async function GET() {
  const supabase = getSupabaseClient();

  const [apkResult, tpvRelease] = await Promise.all([
    supabase.storage.from('app-releases').createSignedUrl(APK_PATH, 3600),
    getTpvRelease(),
  ]);

  return NextResponse.json({
    version: VERSION,
    versionCode: VERSION_CODE,
    apkUrl: apkResult.data?.signedUrl ?? null,
    tpv: tpvRelease,
  });
}
