import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';
import { processRedsysWebhookUseCase } from '@/core/application/use-cases/payment/processRedsysWebhookUseCase';

/**
 * Redsys URLOK handler — receives the browser-side POST after a successful payment.
 * Redsys POSTs the same Ds_MerchantParameters/Ds_Signature payload here (form-encoded)
 * before redirecting the user's browser. We process it idempotently (same logic as the
 * server-to-server webhook) and then redirect to the mesa ticket page.
 *
 * This acts as a reliable fallback when the server-to-server webhook notification fails
 * or arrives after the browser redirect.
 */
export async function POST(request: NextRequest) {
  const redirectTo = request.nextUrl.searchParams.get('redirect') ?? '/';

  try {
    const contentType = request.headers.get('content-type') ?? '';

    let dsParameters: string | null = null;
    let dsSignature: string | null = null;
    let dsSignatureVersion: string | null = null;

    if (contentType.includes('application/x-www-form-urlencoded')) {
      const text = await request.text();
      const params = new URLSearchParams(text);
      dsParameters = params.get('Ds_MerchantParameters');
      dsSignature = params.get('Ds_Signature');
      dsSignatureVersion = params.get('Ds_SignatureVersion');
    }

    if (dsParameters && dsSignature && dsSignatureVersion) {
      // Decode Ds_Order from parameters to look up the empresa
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

        if (pedido) {
          const empresaId = (pedido as Record<string, unknown>)['empresa_id'] as string;
          // Fire-and-forget — idempotent; webhook may have already handled it
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

  return NextResponse.redirect(new URL(redirectTo, request.nextUrl.origin));
}
