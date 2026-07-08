import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export function GET(): NextResponse {
  const version = process.env.ELECTRON_VERSION ?? '1.0.0';
  const sha512 = process.env.ELECTRON_SHA512 ?? '';
  const releaseDate =
    process.env.ELECTRON_RELEASE_DATE ?? new Date().toISOString();

  const yaml = [
    `version: ${version}`,
    `path: tpv-setup-${version}.exe`,
    `sha512: ${sha512}`,
    `releaseDate: '${releaseDate}'`,
  ].join('\n');

  return new NextResponse(yaml, {
    headers: {
      'Content-Type': 'application/yaml',
      'Cache-Control': 'no-store',
    },
  });
}
