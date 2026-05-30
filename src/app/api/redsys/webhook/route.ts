import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';
import { processRedsysWebhookUseCase } from '@/core/application/use-cases/payment/processRedsysWebhookUseCase';

// Redsys retries if we return non-200 — ALWAYS return 200.
const OK = () => NextResponse.json({ ok: true }, { status: 200 });

export async function POST(request: NextRequest) {
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
    } else {
      // JSON fallback
      let body: Record<string, unknown>;
      try {
        body = (await request.json()) as Record<string, unknown>;
      } catch {
        return OK();
      }
      dsParameters = (body['Ds_MerchantParameters'] as string | null) ?? null;
      dsSignature = (body['Ds_Signature'] as string | null) ?? null;
      dsSignatureVersion = (body['Ds_SignatureVersion'] as string | null) ?? null;
    }

    if (!dsParameters || !dsSignature || !dsSignatureVersion) {
      return OK();
    }

    // Decode Ds_MerchantParameters (Base64 → JSON) to get Ds_Order
    let dsOrder: string | null = null;
    try {
      const decoded = Buffer.from(dsParameters, 'base64').toString('utf8');
      const merchantParams = JSON.parse(decoded) as Record<string, unknown>;
      dsOrder = (merchantParams['Ds_Order'] as string | undefined)
        ?? (merchantParams['DS_MERCHANT_ORDER'] as string | undefined)
        ?? null;
    } catch {
      return OK();
    }

    if (!dsOrder) return OK();

    // Find empresaId by payment_order_ref
    const supabase = getSupabaseClient();
    const { data: pedido } = await supabase
      .from('pedidos')
      .select('empresa_id')
      .eq('payment_order_ref', dsOrder)
      .maybeSingle();

    if (!pedido) return OK();

    const empresaId = (pedido as Record<string, unknown>)['empresa_id'] as string;

    await processRedsysWebhookUseCase({
      dsParameters,
      dsSignature,
      dsSignatureVersion,
      empresaId,
    });

    return OK();
  } catch {
    // Never let an exception produce a non-200 — Redsys would retry indefinitely
    return OK();
  }
}
