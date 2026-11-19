// src/app/api/kit-avisos/alta/route.ts
// kit-expiry-m2b (sdd en kitemergenciacanarias, docs/sdd/kit-expiry-reminders/m2b/),
// M2b6a/R-M2b.2.1: orden fijo de comprobaciones — bandera → límite por IP →
// JSON/Origin → empresa+módulo → DTO → caso de uso. SIEMPRE
// `202 { ok: true }` (D-M2b-6) salvo que el titular legal no tenga email o
// NIF (R-M2b.2.8, 503 genérico): la respuesta NUNCA distingue qué pasó
// realmente con la serie, y nunca lleva el email (R-M2b.6.1). Los emails
// se envían en `after()` (DD5), después de responder.
import { NextResponse, after } from 'next/server';
import { KIT_AVISOS_ALTA_LIVE } from '@/lib/kit-caducidad/publico';
import { kitAvisosDentroDeLimite, ipDeCabeceras } from '@/core/infrastructure/api/rate-limit';
import { esPeticionJsonPublicaValida } from '@/lib/peticion-publica';
import { getDomainFromHeaders } from '@/lib/domain-utils';
import { resolverEmpresaPublica } from '@/lib/server-services';
import { kitsCaducidadHabilitadoParaEmpresa } from '@/lib/kit-caducidad/kits-habilitado';
import { getKitAvisosRepository, getEmpresaLegalUseCase } from '@/core/infrastructure/database';
import { altaAvisosSchema } from '@/core/application/dtos/kit-avisos.dto';
import { solicitarAltaAvisosUseCase } from '@/core/application/use-cases/kits/solicitarAltaAvisos.use-case';
import { crearEmailKitAvisosBrevo } from '@/lib/kit-caducidad/email-kit-avisos.brevo';
import { programarConRegistro } from '@/lib/kit-caducidad/programar-con-registro';
import { logger } from '@/core/infrastructure/logging/logger';

const NO_DISPONIBLE = { error: 'No disponible' };
const ERROR_GENERICO = { error: 'Ahora no podemos completar el alta' };

export async function POST(request: Request): Promise<NextResponse> {
  if (!KIT_AVISOS_ALTA_LIVE) {
    return NextResponse.json(NO_DISPONIBLE, { status: 404 });
  }

  const ip = ipDeCabeceras(request.headers);
  if (!(await kitAvisosDentroDeLimite(ip))) {
    return NextResponse.json({ error: 'Demasiadas peticiones' }, { status: 429 });
  }

  const peticionValida = esPeticionJsonPublicaValida(request);
  if (!peticionValida.ok) {
    return NextResponse.json({ error: 'Petición no válida' }, { status: peticionValida.status });
  }

  const domain = await getDomainFromHeaders();
  const { empresa } = await resolverEmpresaPublica(domain);
  if (!empresa) {
    return NextResponse.json(NO_DISPONIBLE, { status: 404 });
  }

  const habilitado = await kitsCaducidadHabilitadoParaEmpresa(empresa.id);
  if (!habilitado) {
    return NextResponse.json(NO_DISPONIBLE, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Cuerpo no válido' }, { status: 400 });
  }
  const parsed = altaAvisosSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const contexto = await getEmpresaLegalUseCase().getContext(empresa.id);
  if (!contexto.success) {
    return NextResponse.json(ERROR_GENERICO, { status: 503 });
  }

  const { serie, email, telefono, avisosWhatsapp } = parsed.data;
  const resultado = await solicitarAltaAvisosUseCase(
    getKitAvisosRepository(),
    crearEmailKitAvisosBrevo(empresa.nombre),
    programarConRegistro((tarea) => after(tarea), (e) => { void logger.logError(e); }, 'POST /api/kit-avisos/alta'),
    {
      empresaId: empresa.id,
      serie,
      email,
      telefono: telefono ?? null,
      whatsapp: avisosWhatsapp,
      baseUrl: `https://${domain}`,
      titular: contexto.data.titular,
    },
  );

  if (!resultado.success) {
    return NextResponse.json(ERROR_GENERICO, { status: 503 });
  }

  return NextResponse.json({ ok: true }, { status: 202 });
}
