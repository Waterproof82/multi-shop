// src/lib/pet-id/cargar-perfil-publico.ts
// sdd pet-id-qr-profile (docs/sdd/pet-id-qr-profile/, kitemergenciacanarias)
// Cargador de /m/[codigo] (Fase 9, design.md "Flujo de datos"): empresa por
// dominio → límite → bandera del tenant → PET_PERFIL_PUBLICO_LIVE → caso de
// uso. Las CINCO salidas de R-QR.3.2 que colapsan en 'no-encontrado'
// (desconocido, libre, pendiente, flag apagado, límite superado) viven
// aquí; la página solo traduce ese resultado en un notFound() real (ver
// tests/core/mascota-publica-page-guard.test.ts). Calco de
// `cargar-estado-publico.ts` (kit-expiry-m2a).
import 'server-only';
import { cache } from 'react';
import { headers } from 'next/headers';
import { getDomainFromHeaders } from '@/lib/domain-utils';
import { resolverEmpresaPublica } from '@/lib/server-services';
import { ipDeCabeceras, mascotaPublicoDentroDeLimite } from '@/core/infrastructure/api/rate-limit';
import { flagModuloHabilitado } from '@/lib/empresa/flag-modulo';
import { PET_PERFIL_PUBLICO_LIVE } from '@/lib/pet-id/publico';
import { getPetChapaPerfilRepository } from '@/core/infrastructure/database';
import { consultarPerfilPublicoUseCase } from '@/core/application/use-cases/mascotas/consultarPerfilPublico.use-case';
import type { EmpresaPublic } from '@/core/domain/entities/types';
import type { PerfilPublico } from '@/core/domain/entities/pet-chapa-types';

export type ResultadoPerfilPublico =
  | { tipo: 'ok'; empresa: EmpresaPublic; perfil: PerfilPublico }
  | { tipo: 'no-encontrado' };

const NO_ENCONTRADO: ResultadoPerfilPublico = { tipo: 'no-encontrado' };

async function cargarPerfilPublicoInterno(codigoCrudo: string): Promise<ResultadoPerfilPublico> {
  const fullDomain = await getDomainFromHeaders();
  const { empresa } = await resolverEmpresaPublica(fullDomain);
  if (!empresa) return NO_ENCONTRADO;

  // R7 de tasks.md / R-QR.3.2: el límite cuenta ANTES de la bandera del
  // tenant y de leer `pet_chapas` — una IP que se pasa de peticiones nunca
  // llega más lejos, y el resultado es el MISMO 'no-encontrado' que
  // cualquier otra rama (notFound(), nunca un 429: una RSC no puede
  // devolver uno).
  const headersList = await headers();
  const ip = ipDeCabeceras(headersList);
  const dentroDeLimite = await mascotaPublicoDentroDeLimite(ip);
  if (!dentroDeLimite) return NO_ENCONTRADO;

  // Un fallo de BD aquí SE LANZA: nunca se disfraza de "no existe".
  const habilitado = await flagModuloHabilitado(empresa.id, 'pet_id_qr_habilitado');
  if (!habilitado) return NO_ENCONTRADO;

  // R-QR.13.2: el perfil público entero va detrás de esta bandera, ANTES de
  // tocar `pet_chapas` — mientras esté en `false`, este PR es inerte en
  // producción aunque despliegue.
  if (!PET_PERFIL_PUBLICO_LIVE) return NO_ENCONTRADO;

  const resultado = await consultarPerfilPublicoUseCase(getPetChapaPerfilRepository(), empresa.id, codigoCrudo);
  if (!resultado.success) throw new Error(resultado.error.message);
  if (!resultado.data) return NO_ENCONTRADO;

  return { tipo: 'ok', empresa, perfil: resultado.data };
}

/**
 * Memoizado por código dentro de la misma petición (React `cache`, no
 * `unstable_cache` — ningún dato de una chapa se cachea entre peticiones).
 */
export const cargarPerfilPublico = cache(cargarPerfilPublicoInterno);
