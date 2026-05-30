import { NextRequest, NextResponse } from 'next/server';
import { processGlovoWebhookUseCase } from '@/core/application/use-cases/glovo/processGlovoWebhookUseCase';

/**
 * Public endpoint — no auth.
 * Glovo requires HTTP 200 even on error, so we never throw.
 */
export async function POST(request: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      // Malformed body — still return 200
      return NextResponse.json({ received: true }, { status: 200 });
    }

    await processGlovoWebhookUseCase(body);
  } catch {
    // Safety net — always 200
  }

  return NextResponse.json({ received: true }, { status: 200 });
}
