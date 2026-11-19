// src/app/api/kit-avisos/enlace/route.ts
// kit-expiry-m2b (sdd en kitemergenciacanarias, docs/sdd/kit-expiry-reminders/m2b/),
// M2b6b/R-M2b.4: mismas comprobaciones que el alta (bandera → límite IP →
// JSON/Origin → empresa+módulo → DTO), pero la respuesta SIEMPRE es
// `202 { ok: true }` (R-M2b.4.2) — también si el email no coincide con
// nadie, o si el caso de uso propaga un error — para no poder enumerar
// emails registrados desde fuera.
import { NextResponse, after } from 'next/server';
import { KIT_AVISOS_ALTA_LIVE } from '@/lib/kit-caducidad/publico';
import { kitAvisosDentroDeLimite, ipDeCabeceras } from '@/core/infrastructure/api/rate-limit';
import { esPeticionJsonPublicaValida } from '@/lib/peticion-publica';
import { getDomainFromHeaders } from '@/lib/domain-utils';
import { resolverEmpresaPublica } from '@/lib/server-services';
import { kitsCaducidadHabilitadoParaEmpresa } from '@/lib/kit-caducidad/kits-habilitado';
import { getKitAvisosRepository, getEmpresaLegalUseCase } from '@/core/infrastructure/database';
import { enlaceGestionSchema } from '@/core/application/dtos/kit-avisos.dto';
import { solicitarEnlaceGestionUseCase, type SolicitarEnlaceGestionCommand } from '@/core/application/use-cases/kits/solicitarEnlaceGestion.use-case';
import { crearEmailKitAvisosBrevo } from '@/lib/kit-caducidad/email-kit-avisos.brevo';
import { programarConRegistro } from '@/lib/kit-caducidad/programar-con-registro';
import { logger } from '@/core/infrastructure/logging/logger';

const NO_DISPONIBLE = { error: 'No disponible' };
const TITULAR_SIN_DATOS: SolicitarEnlaceGestionCommand['titular'] = {
  nombre: '',
  nif: null,
  direccion: null,
  email: null,
  telefono: null,
  registroMercantil: null,
};

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
  const parsed = enlaceGestionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  // R-M2b.4.2: la respuesta es siempre 202, tanto si el titular legal no
  // tiene remitente completo (el caso de uso simplemente no programa nada)
  // como si el repositorio falla — nunca se distingue desde fuera.
  const contexto = await getEmpresaLegalUseCase().getContext(empresa.id);
  const titular = contexto.success ? contexto.data.titular : TITULAR_SIN_DATOS;

  await solicitarEnlaceGestionUseCase(
    getKitAvisosRepository(),
    crearEmailKitAvisosBrevo(empresa.nombre),
    programarConRegistro((tarea) => after(tarea), (e) => { void logger.logError(e); }, 'POST /api/kit-avisos/enlace'),
    {
      empresaId: empresa.id,
      serie: parsed.data.serie,
      email: parsed.data.email,
      baseUrl: `https://${domain}`,
      titular,
    },
  );

  return NextResponse.json({ ok: true }, { status: 202 });
}
