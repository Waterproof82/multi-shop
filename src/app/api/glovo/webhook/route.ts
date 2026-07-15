import { NextRequest, NextResponse } from 'next/server';
import { processGlovoWebhookUseCase } from '@/core/application/use-cases/glovo/processGlovoWebhookUseCase';

const GLOVO_WEBHOOK_SECRET = process.env.GLOVO_WEBHOOK_SECRET ?? '';

/**
 * Verify the HMAC-SHA256 signature sent by Glovo/DH On Demand.
 * Glovo sends the signature as a hex digest in the `X-Glovo-Hmac-Sha256` header.
 * The secret is the shared key configured in the Glovo partner portal.
 * @see https://partner-api.glovoapp.com/docs (Webhook Authentication)
 */
async function verifyGlovoSignature(rawBody: string, signatureHeader: string | null): Promise<boolean> {
  if (!signatureHeader) return false;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(GLOVO_WEBHOOK_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
  const expected = Buffer.from(mac).toString('hex');
  // Constant-time comparison to avoid timing attacks
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader.toLowerCase());
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/**
 * Glovo webhook — requires HMAC-SHA256 signature verification.
 * Glovo requires HTTP 200 even on business-logic errors, so we only return
 * non-200 for auth failures (401) or missing config (503).
 */
export async function POST(request: NextRequest) {
  // Fail-closed: refuse all requests if the secret is not configured
  if (!GLOVO_WEBHOOK_SECRET) {
    return NextResponse.json({ received: false }, { status: 503 });
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return NextResponse.json({ received: false }, { status: 400 });
  }

  const signature = request.headers.get('X-Glovo-Hmac-Sha256');
  const isValid = await verifyGlovoSignature(rawBody, signature);
  if (!isValid) {
    return NextResponse.json({ received: false }, { status: 401 });
  }

  try {
    const body: unknown = JSON.parse(rawBody);
    await processGlovoWebhookUseCase(body);
  } catch {
    // Safety net — always 200 for authenticated Glovo requests with valid payload
  }

  return NextResponse.json({ received: true }, { status: 200 });
}
