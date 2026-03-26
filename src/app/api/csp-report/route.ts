import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { rateLimitPublic } from '@/core/infrastructure/api/rate-limit';
import { logger } from '@/core/infrastructure/logging/logger';

const cspReportSchema = z.object({
  'csp-report': z.object({
    'blocked-uri': z.string().max(2000).optional(),
    'violated-directive': z.string().max(500).optional(),
    'document-uri': z.string().max(2000).optional(),
    'effective-directive': z.string().max(500).optional(),
    'original-policy': z.string().max(5000).optional(),
    'status-code': z.number().optional(),
  }).optional(),
});

/** Strip query string and fragment from a URI to avoid logging PII (tokens, emails, etc.) */
function sanitizeUri(uri: string | undefined): string | undefined {
  if (!uri) return undefined;
  try {
    const parsed = new URL(uri);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    // Not a valid URL — return the first 200 chars without query string
    return uri.split('?')[0].slice(0, 200);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const rateLimited = await rateLimitPublic(request);
  if (rateLimited) return rateLimited;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new NextResponse(null, { status: 204 });
  }

  const parsed = cspReportSchema.safeParse(body);
  if (!parsed.success) {
    return new NextResponse(null, { status: 204 });
  }

  const cspReport = parsed.data?.['csp-report'];

  await logger.logError({
    codigo: 'CSP_VIOLATION',
    mensaje: 'Content Security Policy violation reported by browser',
    modulo: 'api',
    metodo: 'POST /api/csp-report',
    severity: 'warning',
    metadata: {
      blockedUri: sanitizeUri(cspReport?.['blocked-uri']),
      violatedDirective: cspReport?.['violated-directive'],
      // Strip query string to avoid logging PII (tokens, emails) from document-uri
      documentUri: sanitizeUri(cspReport?.['document-uri']),
      effectiveDirective: cspReport?.['effective-directive'],
    },
  });

  return new NextResponse(null, { status: 204 });
}
