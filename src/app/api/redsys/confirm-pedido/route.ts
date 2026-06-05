import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';
import { processRedsysWebhookUseCase } from '@/core/application/use-cases/payment/processRedsysWebhookUseCase';

/**
 * Redsys URLOK handler for pedido (recogida/tienda) payments.
 *
 * Redsys dev simulator (sis-d) sends params via GET query string.
 * Redsys production sends params via POST form-encoded body.
 *
 * Acts as a reliable fallback when the server-to-server webhook notification
 * fails or arrives after the browser redirect. Idempotent — webhook may have
 * already processed the payment.
 *
 * After processing, redirects to /pedido/pago-ok?token=<tracking_token>
 * which in turn redirects the user to the tracking page.
 */
async function processAndRedirect(
  dsParameters: string | null,
  dsSignature: string | null,
  dsSignatureVersion: string | null,
  token: string | null,
  origin: string
): Promise<NextResponse> {
  try {
    if (dsParameters && dsSignature && dsSignatureVersion) {
      let dsOrder: string | null = null;
      try {
        const decoded = Buffer.from(dsParameters, 'base64').toString('utf8');
        const merchantParams = JSON.parse(decoded) as Record<string, unknown>;
        dsOrder =
          (merchantParams['Ds_Order'] as string | undefined) ??
          (merchantParams['DS_MERCHANT_ORDER'] as string | undefined) ??
          null;
      } catch {
        // fall through to redirect
      }

      if (dsOrder) {
        const supabase = getSupabaseClient();
        const { data: pedido } = await supabase
          .from('pedidos')
          .select('empresa_id')
          .eq('payment_order_ref', dsOrder)
          .maybeSingle();

        const empresaId = pedido
          ? ((pedido as Record<string, unknown>)['empresa_id'] as string)
          : null;

        if (empresaId) {
          await processRedsysWebhookUseCase({
            dsParameters,
            dsSignature,
            dsSignatureVersion,
            empresaId,
          });
        }
      }
    }
  } catch {
    // Never block the redirect — payment is already confirmed by Redsys
  }

  const redirectTo = token
    ? `/pedido/pago-ok?token=${encodeURIComponent(token)}`
    : '/pedido/pago-ok';

  return NextResponse.redirect(new URL(redirectTo, origin));
}

/** Redsys production: POST with form-encoded body */
export async function POST(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const token = sp.get('token');

  let dsParameters: string | null = null;
  let dsSignature: string | null = null;
  let dsSignatureVersion: string | null = null;

  try {
    const contentType = request.headers.get('content-type') ?? '';
    if (contentType.includes('application/x-www-form-urlencoded')) {
      const text = await request.text();
      const params = new URLSearchParams(text);
      dsParameters = params.get('Ds_MerchantParameters');
      dsSignature = params.get('Ds_Signature');
      dsSignatureVersion = params.get('Ds_SignatureVersion');
    }
  } catch {
    // fall through
  }

  return processAndRedirect(dsParameters, dsSignature, dsSignatureVersion, token, request.nextUrl.origin);
}

/** Redsys dev simulator: GET with params in query string */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const token = sp.get('token');
  const dsParameters = sp.get('Ds_MerchantParameters');
  const dsSignature = sp.get('Ds_Signature');
  const dsSignatureVersion = sp.get('Ds_SignatureVersion');

  return processAndRedirect(dsParameters, dsSignature, dsSignatureVersion, token, request.nextUrl.origin);
}
