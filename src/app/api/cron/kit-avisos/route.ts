// src/app/api/cron/kit-avisos/route.ts
// kit-expiry-m3 (sdd en kitemergenciacanarias, docs/sdd/kit-expiry-reminders/m3/)
// M3h/R-M3.1/DD13: cron diario — autentica con `verifyCronSecret` (igual que
// `rgpd-purge`), compone los puertos de los dos casos de uso ya probados
// (M3e, M3f) y suma recuentos. `titularDe` resuelve el titular legal por
// empresa (`getEmpresaLegalUseCase().getContext`); R-M3.4.1 (el remitente de
// Brevo debe coincidir con el nombre que firma el pie legal del email) ya no
// depende de recrear el puerto de email por empresa (ver W1 de
// `verify-report.md`): el caso de uso (M3e) pasa `remitenteNombre` en cada
// `enviar`, así que esta ruta usa UN SOLO puerto, fijo, para toda la
// ejecución, sin estado mutable ligado al orden del bucle de empresas.
//
// R-M3.1.3: el envío va antes que la purga; un fallo de uno no impide el
// otro, y la respuesta lleva los recuentos de lo que sí terminó bien.
// R-M3.1.4: `?simular=1` no llama a la purga.
// R-M3.7.1: ni la respuesta ni el log llevan email, teléfono, token ni una
// serie completa — solo números; los errores (sin PII, ver M3d2-M3d4) van a
// `logger.logError`, nunca a la respuesta ni a `console.info`.
import { NextRequest, NextResponse } from 'next/server';
import { verifyCronSecret } from '@/lib/cron-auth';
import { hoyEnCanarias } from '@/lib/kit-caducidad/hoy-canarias';
import { getKitAvisosEnvioRepository, getEmpresaLegalUseCase } from '@/core/infrastructure/database';
import { crearEmailKitAvisosBrevo } from '@/lib/kit-caducidad/email-kit-avisos.brevo';
import { logger } from '@/core/infrastructure/logging/logger';
import {
  enviarAvisosCaducidadUseCase,
  type TitularLegal,
} from '@/core/application/use-cases/kits/enviarAvisosCaducidad.use-case';
import { purgarDatosAvisosUseCase } from '@/core/application/use-cases/kits/purgarDatosAvisos.use-case';
import type { ResumenAvisos, ResumenPurga } from '@/core/domain/entities/kit-avisos-envio-types';
import type { AppError } from '@/core/domain/entities/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const METODO = 'GET /api/cron/kit-avisos';

// W1/DD8: `senderName` de construcción no se usa — el caso de uso (M3e)
// pasa `remitenteNombre` en cada `enviar` (`enviarUno`), así que este puerto
// es el mismo para todas las empresas de la ejecución.
function crearTitularDe(): (empresaId: string) => Promise<TitularLegal | null> {
  return async (empresaId: string): Promise<TitularLegal | null> => {
    const contexto = await getEmpresaLegalUseCase().getContext(empresaId);
    if (!contexto.success) return null;
    return contexto.data.titular;
  };
}

function registrarError(error: AppError): void {
  logger.logError({ codigo: error.code, mensaje: error.message, modulo: 'api', metodo: METODO });
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const simular = req.nextUrl.searchParams.get('simular') === '1';
  const hoy = hoyEnCanarias();
  const email = crearEmailKitAvisosBrevo('');

  const avisosResult = await enviarAvisosCaducidadUseCase(
    { repo: getKitAvisosEnvioRepository(), email, titularDe: crearTitularDe() },
    { hoy, simular },
  );
  if (!avisosResult.success) registrarError(avisosResult.error);

  const purgaResult = simular
    ? null
    : await purgarDatosAvisosUseCase(getKitAvisosEnvioRepository(), { ahora: new Date(), hoy });
  if (purgaResult && !purgaResult.success) registrarError(purgaResult.error);

  const cuerpo: { avisos?: ResumenAvisos; purga?: ResumenPurga } = {};
  if (avisosResult.success) cuerpo.avisos = avisosResult.data;
  if (purgaResult?.success) cuerpo.purga = purgaResult.data;

  const ok = avisosResult.success && (purgaResult === null || purgaResult.success);
  console.info('[cron/kit-avisos]', cuerpo);

  return NextResponse.json(cuerpo, { status: ok ? 200 : 500 });
}
