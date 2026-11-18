// src/lib/kit-caducidad/cargar-gestion-avisos.ts
// kit-expiry-m2b (sdd en kitemergenciacanarias, docs/sdd/kit-expiry-reminders/m2b/)
// Cargador de /kit/avisos/[token] (M2b8b, design.md "una página como el
// cargador de M2a"): empresa por dominio → límite → caso de uso 'consultar'.
// R-M2b.3.1/D-M2b-8: la revocación NUNCA depende de `kits_caducidad_habilitado`
// ni de `KIT_AVISOS_ALTA_LIVE` — mismo criterio que `POST /api/kit-avisos/gestion`
// (M2b6ba). El GET no muta nada: siempre llama con `accion: 'consultar'`.
import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { getDomainFromHeaders } from "@/lib/domain-utils";
import { resolverEmpresaPublica } from "@/lib/server-services";
import { ipDeCabeceras, kitPublicoDentroDeLimite } from "@/core/infrastructure/api/rate-limit";
import { getKitAvisosRepository, getAuditLogRepository } from "@/core/infrastructure/database";
import { gestionarAvisosUseCase } from "@/core/application/use-cases/kits/gestionarAvisos.use-case";
import type { EstadoAvisos } from "@/core/domain/entities/kit-avisos-types";

export type ResultadoGestionAvisos =
  | { tipo: 'ok'; serie: string; estado: EstadoAvisos }
  | { tipo: 'no-encontrado' };

const NO_ENCONTRADO: ResultadoGestionAvisos = { tipo: 'no-encontrado' };
const PENDIENTE_CADUCA_HORAS = 48;

async function cargarGestionAvisosInterno(token: string): Promise<ResultadoGestionAvisos> {
  const fullDomain = await getDomainFromHeaders();
  const { empresa } = await resolverEmpresaPublica(fullDomain);
  if (!empresa) return NO_ENCONTRADO;

  // Mismo criterio que cargarEstadoKitPublico (R-M2a.1.5/DD1): el límite
  // cuenta antes de cualquier lectura de BD.
  const headersList = await headers();
  const ip = ipDeCabeceras(headersList);
  const dentroDeLimite = await kitPublicoDentroDeLimite(ip);
  if (!dentroDeLimite) return NO_ENCONTRADO;

  const pendienteCaducaAntesDe = new Date(Date.now() - PENDIENTE_CADUCA_HORAS * 60 * 60 * 1000).toISOString();
  const resultado = await gestionarAvisosUseCase(
    getKitAvisosRepository(),
    getAuditLogRepository(),
    empresa.id,
    token,
    'consultar',
    pendienteCaducaAntesDe,
  );
  // Un fallo de BD aquí SE LANZA, nunca se disfraza del 404 neutro.
  if (!resultado.success) throw new Error(resultado.error.message);
  if (!resultado.data) return NO_ENCONTRADO;

  return { tipo: 'ok', serie: resultado.data.serie, estado: resultado.data.estado as EstadoAvisos };
}

/** Memoizado por token dentro de la misma petición (React `cache`, como M2a). */
export const cargarGestionAvisos = cache(cargarGestionAvisosInterno);
