// src/app/api/kit-avisos/gestion/route.ts
// kit-expiry-m2b (sdd en kitemergenciacanarias, docs/sdd/kit-expiry-reminders/m2b/),
// M2b6b/R-M2b.3.5: la revocación NUNCA depende de una bandera (D-M2b-8) —
// a propósito, esta ruta no comprueba el flag de alta en vivo ni el
// módulo de caducidad del tenant, solo `esPeticionJsonPublicaValida` (DD6)
// y `rateLimitPublic`. Cualquier problema con el token (forma incorrecta,
// desconocido en esta empresa, o un pendiente ya caducado) da el MISMO
// 404 neutro (R-M2b.3.2) — nunca distingue el motivo.
import { NextResponse } from 'next/server';
import { rateLimitPublic } from '@/core/infrastructure/api/rate-limit';
import { esPeticionJsonPublicaValida } from '@/lib/peticion-publica';
import { getDomainFromHeaders } from '@/lib/domain-utils';
import { resolverEmpresaPublica } from '@/lib/server-services';
import { getKitAvisosRepository, getAuditLogRepository } from '@/core/infrastructure/database';
import { gestionSchema } from '@/core/application/dtos/kit-avisos.dto';
import { gestionarAvisosUseCase } from '@/core/application/use-cases/kits/gestionarAvisos.use-case';

const ENLACE_NO_VALIDO = { error: 'Este enlace ya no es válido' };
const PENDIENTE_CADUCA_HORAS = 48;

export async function POST(request: Request): Promise<NextResponse> {
  const peticionValida = esPeticionJsonPublicaValida(request);
  if (!peticionValida.ok) {
    return NextResponse.json({ error: 'Petición no válida' }, { status: peticionValida.status });
  }

  const limitada = await rateLimitPublic(request);
  if (limitada) return limitada;

  const domain = await getDomainFromHeaders();
  const { empresa } = await resolverEmpresaPublica(domain);
  if (!empresa) {
    return NextResponse.json(ENLACE_NO_VALIDO, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(ENLACE_NO_VALIDO, { status: 404 });
  }
  const parsed = gestionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(ENLACE_NO_VALIDO, { status: 404 });
  }

  const pendienteCaducaAntesDe = new Date(Date.now() - PENDIENTE_CADUCA_HORAS * 60 * 60 * 1000).toISOString();
  const resultado = await gestionarAvisosUseCase(
    getKitAvisosRepository(),
    getAuditLogRepository(),
    empresa.id,
    parsed.data.token,
    parsed.data.accion,
    pendienteCaducaAntesDe,
  );

  if (!resultado.success) {
    return NextResponse.json({ error: 'Ahora no podemos completar la solicitud' }, { status: 500 });
  }
  if (!resultado.data) {
    return NextResponse.json(ENLACE_NO_VALIDO, { status: 404 });
  }

  return NextResponse.json({ ok: true, estado: resultado.data.estado }, { status: 200 });
}
