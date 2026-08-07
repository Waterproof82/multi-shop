import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';

/**
 * Lectura de los avisos de Redsys.
 *
 * POR QUÉ ESTÁ AQUÍ Y NO EN CADA RUTA
 * Tres endpoints reciben lo mismo —el webhook servidor-a-servidor, la vuelta
 * del navegador y el simulador de desarrollo— y los tres repetían el mismo
 * parseo del cuerpo y la misma búsqueda de la empresa en tres tablas. Con tres
 * copias, arreglar un caso raro en una dejaba las otras dos con el fallo.
 */

export interface ParametrosRedsys {
  dsParameters: string | null;
  dsSignature: string | null;
  dsSignatureVersion: string | null;
}

const VACIOS: ParametrosRedsys = { dsParameters: null, dsSignature: null, dsSignatureVersion: null };

function desdeClaves(leer: (clave: string) => string | null): ParametrosRedsys {
  return {
    dsParameters: leer('Ds_MerchantParameters'),
    dsSignature: leer('Ds_Signature'),
    dsSignatureVersion: leer('Ds_SignatureVersion'),
  };
}

/**
 * Parámetros del aviso, vengan como vengan.
 *
 * Producción manda `application/x-www-form-urlencoded`; hay integraciones y
 * pruebas que mandan JSON. Un cuerpo ilegible devuelve todo a `null` en vez de
 * lanzar: la ruta debe responder 200 igualmente, porque Redsys reintenta ante
 * cualquier otro código y reintentar un cobro ya aplicado es peor que perder
 * un aviso.
 */
export async function leerParametrosRedsys(request: Request): Promise<ParametrosRedsys> {
  const contentType = request.headers.get('content-type') ?? '';

  try {
    if (contentType.includes('application/x-www-form-urlencoded')) {
      const cuerpo = new URLSearchParams(await request.text());
      return desdeClaves(clave => cuerpo.get(clave));
    }

    const json = (await request.json()) as Record<string, unknown>;
    return desdeClaves(clave => (json[clave] as string | null) ?? null);
  } catch {
    return VACIOS;
  }
}

/** ¿Están los tres parámetros que hacen falta para verificar la firma? */
export function sonParametrosCompletos(
  p: ParametrosRedsys,
): p is { dsParameters: string; dsSignature: string; dsSignatureVersion: string } {
  return Boolean(p.dsParameters && p.dsSignature && p.dsSignatureVersion);
}

/** Tablas donde puede estar registrada una orden de pago, en orden de búsqueda. */
const TABLAS_CON_ORDEN = ['pedidos', 'mesa_division_pagos', 'mesa_pagos_personalizados'] as const;

/**
 * Empresa a la que pertenece una orden de pago.
 *
 * Hay tres tipos de cobro y cada uno se registra en su tabla: pedido completo,
 * división de cuenta y turno personalizado. Se prueban en ese orden hasta dar
 * con la orden. Sin `empresa_id` no se puede recuperar la clave secreta, y sin
 * ella no se puede verificar la firma: no hay nada que procesar.
 */
export async function resolverEmpresaDeLaOrden(dsOrder: string): Promise<string | null> {
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
