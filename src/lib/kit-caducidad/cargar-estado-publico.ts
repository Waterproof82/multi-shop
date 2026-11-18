// src/lib/kit-caducidad/cargar-estado-publico.ts
// kit-expiry-m2a (sdd en kitemergenciacanarias, docs/sdd/kit-expiry-reminders/m2a/)
// Cargador de /kit/[serie] (DD3 de design.md): empresa por dominio → límite
// → bandera del tenant → caso de uso. Las CUATRO salidas de R-M2a.1.3 que
// colapsan en 'no-encontrado' viven aquí; la página solo traduce ese
// resultado en un notFound() real (ver tests/core/kit-publico-page-guard.test.ts).
import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { getDomainFromHeaders } from "@/lib/domain-utils";
import { resolverEmpresaPublica } from "@/lib/server-services";
import { ipDeCabeceras, kitPublicoDentroDeLimite } from "@/core/infrastructure/api/rate-limit";
import { kitsCaducidadHabilitadoParaEmpresa } from "@/lib/kit-caducidad/kits-habilitado";
import { hoyEnCanarias } from "@/lib/kit-caducidad/hoy-canarias";
import { getKitCaducidadRepository } from "@/core/infrastructure/database";
import { consultarEstadoKitPublicoUseCase } from "@/core/application/use-cases/kits/consultarEstadoKitPublico.use-case";
import type { EmpresaPublic } from "@/core/domain/entities/types";
import type { EstadoKitPublico } from "@/core/domain/entities/kit-caducidad-types";

export type ResultadoEstadoKitPublico =
  | { tipo: 'ok'; empresa: EmpresaPublic; estado: EstadoKitPublico }
  | { tipo: 'no-encontrado' };

const NO_ENCONTRADO: ResultadoEstadoKitPublico = { tipo: 'no-encontrado' };

async function cargarEstadoKitPublicoInterno(serieCruda: string): Promise<ResultadoEstadoKitPublico> {
  const fullDomain = await getDomainFromHeaders();
  const { empresa } = await resolverEmpresaPublica(fullDomain);
  if (!empresa) return NO_ENCONTRADO;

  // R-M2a.1.5/DD1: el límite cuenta ANTES de cualquier lectura de BD, exista
  // o no la serie — así una IP que se pasa de peticiones no llega ni a la
  // bandera del tenant.
  const headersList = await headers();
  const ip = ipDeCabeceras(headersList);
  const dentroDeLimite = await kitPublicoDentroDeLimite(ip);
  if (!dentroDeLimite) return NO_ENCONTRADO;

  // Un fallo de BD aquí SE LANZA (R-M2a.1.6): nunca se disfraza de "no existe".
  const habilitado = await kitsCaducidadHabilitadoParaEmpresa(empresa.id);
  if (!habilitado) return NO_ENCONTRADO;

  const resultado = await consultarEstadoKitPublicoUseCase(
    getKitCaducidadRepository(),
    empresa.id,
    serieCruda,
    hoyEnCanarias(),
  );
  if (!resultado.success) throw new Error(resultado.error.message);
  if (!resultado.data) return NO_ENCONTRADO;

  return { tipo: 'ok', empresa, estado: resultado.data };
}

/**
 * Memoizado por serie dentro de la misma petición (React `cache`, no
 * `unstable_cache` — R-M2a.3.2: nada de caché compartida por serie).
 */
export const cargarEstadoKitPublico = cache(cargarEstadoKitPublicoInterno);
