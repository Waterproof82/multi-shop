import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    console.error('[CSP Violation]', {
      blockedUri: body['blocked-uri'],
      violatedDirective: body['violated-directive'],
      documentUri: body['document-uri'],
      referrer: body.referrer,
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json({ received: true });
  } catch {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }
}
