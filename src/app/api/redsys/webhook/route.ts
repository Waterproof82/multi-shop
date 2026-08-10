import { NextRequest, NextResponse } from 'next/server';
import {
  decodificarParametros,
  processRedsysWebhookUseCase,
} from '@/core/application/use-cases/payment/processRedsysWebhookUseCase';
import {
  leerParametrosRedsys,
  resolverEmpresaDeLaOrden,
  sonParametrosCompletos,
} from '@/core/infrastructure/api/redsys-request';

/**
 * Aviso de pago servidor-a-servidor de Redsys.
 *
 * SIEMPRE responde 200. Redsys reintenta ante cualquier otro código, y
 * reintentar un cobro ya aplicado es peor que perder un aviso — para eso está
 * además la vuelta del navegador (`confirm-mesa`) como red de seguridad.
 * Por eso todos los caminos de fallo salen por el mismo `OK()`.
 */
const OK = () => NextResponse.json({ ok: true }, { status: 200 });

export async function POST(request: NextRequest) {
  try {
    const params = await leerParametrosRedsys(request);
    if (!sonParametrosCompletos(params)) return OK();

    const decodificado = decodificarParametros(params.dsParameters);
    if (!decodificado) return OK();

    const empresaId = await resolverEmpresaDeLaOrden(decodificado.dsOrder);
    if (!empresaId) return OK();

    await processRedsysWebhookUseCase({ ...params, empresaId });

    return OK();
  } catch {
    // Ninguna excepción puede acabar en un código distinto de 200: Redsys
    // reintentaría indefinidamente.
    return OK();
  }
}
