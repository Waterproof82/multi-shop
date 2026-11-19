// src/app/api/kit-avisos/baja/[token]/route.ts
// kit-expiry-m3 (sdd en kitemergenciacanarias, docs/sdd/kit-expiry-reminders/m3/)
// M3g/DD6/R-M3.6: baja de un clic (RFC 8058). El POST lo hace el SERVIDOR DE
// CORREO, no un navegador: nunca manda `Content-Type: application/json` ni
// `Origin`, así que esta ruta lee el cuerpo con `request.formData()` (acepta
// tanto urlencoded como multipart) en vez de `esPeticionJsonPublicaValida`
// (que exige JSON) — y usa `rateLimitPublic`, no el límite de
// `kit-avisos/alta`.
//
// R-M3.6.4/D-M2b-8: la revocación NUNCA depende de una bandera de alta en
// vivo ni del módulo de caducidad del tenant — igual que
// `/api/kit-avisos/gestion` (M2b6b), este código no comprueba ninguna de
// las dos cosas. Reutiliza `gestionarAvisosUseCase` (M2b) con `accion:
// 'baja'`: un token
// con forma incorrecta, desconocido en la empresa del dominio o ya dado de
// baja dan el MISMO 404 neutro (R-M3.6.2) — nunca se distingue el motivo.
import { NextResponse } from 'next/server';
import { rateLimitPublic } from '@/core/infrastructure/api/rate-limit';
import { getDomainFromHeaders } from '@/lib/domain-utils';
import { resolverEmpresaPublica } from '@/lib/server-services';
import { getKitAvisosRepository, getAuditLogRepository } from '@/core/infrastructure/database';
import { gestionarAvisosUseCase } from '@/core/application/use-cases/kits/gestionarAvisos.use-case';

const ENLACE_NO_VALIDO = { error: 'Este enlace ya no es válido' };
const PETICION_NO_VALIDA = { error: 'Petición no válida' };
const ERROR_GENERICO = { error: 'Ahora no podemos completar la solicitud' };
/** `gestionarAvisosUseCase` exige este argumento para 'consultar'/'confirmar'; 'baja' no lo usa. */
const PENDIENTE_CADUCA_HORAS = 48;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(PETICION_NO_VALIDA, { status: 400 });
  }
  if (formData.get('List-Unsubscribe') !== 'One-Click') {
    return NextResponse.json(PETICION_NO_VALIDA, { status: 400 });
  }

  const limitada = await rateLimitPublic(request);
  if (limitada) return limitada;

  const domain = await getDomainFromHeaders();
  const { empresa } = await resolverEmpresaPublica(domain);
  if (!empresa) {
    return NextResponse.json(ENLACE_NO_VALIDO, { status: 404 });
  }

  const { token } = await params;
  const pendienteCaducaAntesDe = new Date(Date.now() - PENDIENTE_CADUCA_HORAS * 60 * 60 * 1000).toISOString();
  const resultado = await gestionarAvisosUseCase(
    getKitAvisosRepository(),
    getAuditLogRepository(),
    empresa.id,
    token,
    'baja',
    pendienteCaducaAntesDe,
  );

  if (!resultado.success) {
    return NextResponse.json(ERROR_GENERICO, { status: 500 });
  }
  if (!resultado.data) {
    return NextResponse.json(ENLACE_NO_VALIDO, { status: 404 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
