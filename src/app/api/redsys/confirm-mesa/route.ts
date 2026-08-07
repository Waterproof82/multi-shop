import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';
import {
  decodificarParametros,
  processRedsysWebhookUseCase,
} from '@/core/application/use-cases/payment/processRedsysWebhookUseCase';

/**
 * Vuelta del navegador tras pagar (URLOK de Redsys).
 *
 * El simulador de desarrollo manda los parámetros por GET en la query; la
 * pasarela de producción los manda por POST con el cuerpo form-encoded. Los dos
 * caminos acaban aquí.
 *
 * Esto es una RED DE SEGURIDAD del webhook servidor-a-servidor, no su
 * sustituto: cubre el caso de que aquel falle o llegue después que el navegador.
 * Por eso todo el procesado es idempotente y, pase lo que pase, se redirige.
 */

/** Tablas donde puede estar registrada una orden de pago, en orden de búsqueda. */
const TABLAS_CON_ORDEN = ['pedidos', 'mesa_division_pagos', 'mesa_pagos_personalizados'] as const;

/**
 * Empresa a la que pertenece la orden.
 *
 * Hay tres tipos de cobro y cada uno se registra en su tabla: pedido completo,
 * división de cuenta y turno personalizado. Se prueban en ese orden hasta dar
 * con la orden; sin `empresa_id` no se puede verificar la firma y no hay nada
 * que procesar.
 */
async function resolverEmpresaDeLaOrden(dsOrder: string): Promise<string | null> {
  const supabase = getSupabaseClient();

  for (const tabla of TABLAS_CON_ORDEN) {
    const { data } = await supabase
      .from(tabla)
      .select('empresa_id')
      .eq('payment_order_ref', dsOrder)
      .maybeSingle();

    const empresaId = (data as Record<string, unknown> | null)?.['empresa_id'] as string | undefined;
    if (empresaId) return empresaId;
  }

  return null;
}

interface ParametrosRedsys {
  dsParameters: string | null;
  dsSignature: string | null;
  dsSignatureVersion: string | null;
}

/**
 * Aplica el cobro si se puede, y redirige SIEMPRE.
 *
 * Ningún fallo aquí debe bloquear la redirección: Redsys ya ha confirmado el
 * pago al cliente, y dejarle en una pantalla de error le haría creer que no
 * pagó. Si algo no cuadra, el webhook servidor-a-servidor lo recogerá.
 */
async function procesarYRedirigir(
  params: ParametrosRedsys,
  redirectTo: string,
  origin: string,
): Promise<NextResponse> {
  try {
    await aplicarCobroSiProcede(params);
  } catch {
    // Nunca bloquear la redirección.
  }

  return NextResponse.redirect(new URL(redirectTo, origin));
}

async function aplicarCobroSiProcede({ dsParameters, dsSignature, dsSignatureVersion }: ParametrosRedsys): Promise<void> {
  if (!dsParameters || !dsSignature || !dsSignatureVersion) return;

  const decodificado = decodificarParametros(dsParameters);
  if (!decodificado) return;

  const empresaId = await resolverEmpresaDeLaOrden(decodificado.dsOrder);
  if (!empresaId) return;

  // Idempotente: el webhook puede haberlo procesado ya.
  await processRedsysWebhookUseCase({ dsParameters, dsSignature, dsSignatureVersion, empresaId });
}

/** Producción: POST con el cuerpo form-encoded. */
export async function POST(request: NextRequest) {
  const redirectTo = request.nextUrl.searchParams.get('redirect') ?? '/';
  let params: ParametrosRedsys = { dsParameters: null, dsSignature: null, dsSignatureVersion: null };

  try {
    if ((request.headers.get('content-type') ?? '').includes('application/x-www-form-urlencoded')) {
      const cuerpo = new URLSearchParams(await request.text());
      params = {
        dsParameters: cuerpo.get('Ds_MerchantParameters'),
        dsSignature: cuerpo.get('Ds_Signature'),
        dsSignatureVersion: cuerpo.get('Ds_SignatureVersion'),
      };
    }
  } catch {
    // Cuerpo ilegible: se redirige igual y el webhook se encarga.
  }

  return procesarYRedirigir(params, redirectTo, request.nextUrl.origin);
}

/** Simulador de desarrollo: GET con los parámetros en la query. */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;

  return procesarYRedirigir(
    {
      dsParameters: sp.get('Ds_MerchantParameters'),
      dsSignature: sp.get('Ds_Signature'),
      dsSignatureVersion: sp.get('Ds_SignatureVersion'),
    },
    sp.get('redirect') ?? '/',
    request.nextUrl.origin,
  );
}
