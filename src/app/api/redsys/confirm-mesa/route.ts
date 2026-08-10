import { NextRequest, NextResponse } from 'next/server';
import {
  decodificarParametros,
  processRedsysWebhookUseCase,
} from '@/core/application/use-cases/payment/processRedsysWebhookUseCase';
import {
  leerParametrosRedsys,
  resolverEmpresaDeLaOrden,
  sonParametrosCompletos,
  type ParametrosRedsys,
} from '@/core/infrastructure/api/redsys-request';

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

async function aplicarCobroSiProcede(params: ParametrosRedsys): Promise<void> {
  if (!sonParametrosCompletos(params)) return;

  const decodificado = decodificarParametros(params.dsParameters);
  if (!decodificado) return;

  const empresaId = await resolverEmpresaDeLaOrden(decodificado.dsOrder);
  if (!empresaId) return;

  // Idempotente: el webhook puede haberlo procesado ya.
  await processRedsysWebhookUseCase({ ...params, empresaId });
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

/** Producción: POST con el cuerpo form-encoded. */
export async function POST(request: NextRequest) {
  return procesarYRedirigir(
    await leerParametrosRedsys(request),
    request.nextUrl.searchParams.get('redirect') ?? '/',
    request.nextUrl.origin,
  );
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
