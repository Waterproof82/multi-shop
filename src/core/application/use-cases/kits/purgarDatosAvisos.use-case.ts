// src/core/application/use-cases/kits/purgarDatosAvisos.use-case.ts
// kit-expiry-m3 (sdd en kitemergenciacanarias, docs/sdd/kit-expiry-reminders/m3/)
// M3f/DD9: orquesta la purga diaria. Toda la decisión de qué lote está
// inactivo vive en `lotesInactivos` (purga.ts, ya probada en M3b); este caso
// de uso solo lee del repositorio y suma recuentos (R-M3.5/R-M3.7.1).
//
// R-M3.5.4/DD10: un fallo al purgar pendientes NO impide la purga de
// inactivos (son independientes) — pero si CUALQUIERA de los dos pasos (o
// una lectura intermedia) falla, el resultado final es error, sin recuentos
// parciales (mismo contrato `Result<T, AppError>` que el resto del módulo).
import type { IKitAvisosEnvioRepository } from '@/core/domain/repositories/IKitAvisosEnvioRepository';
import type { ResumenPurga } from '@/core/domain/entities/kit-avisos-envio-types';
import type { Result, AppError } from '@/core/domain/entities/types';
import { lotesInactivos } from '@/lib/kit-caducidad/purga';

/** R-M3.5.1: un pendiente sin confirmar pasado este plazo pierde su contacto. */
const PENDIENTE_CADUCA_HORAS = 48;

export interface OpcionesPurgarAvisos {
  /** Instante de ejecución del cron; `purgarPendientes` recibe `ahora − 48h` en ISO. */
  ahora: Date;
  /** `hoyEnCanarias()`, 'YYYY-MM-DD' — límite de inactividad para `lotesInactivos`. */
  hoy: string;
}

function nuevoResumen(): ResumenPurga {
  return { pendientesPurgados: 0, inactivosPurgados: 0, lotesSinFechas: 0 };
}

function antesDeIso(ahora: Date): string {
  return new Date(ahora.getTime() - PENDIENTE_CADUCA_HORAS * 60 * 60 * 1000).toISOString();
}

/** R-M3.5/R-M3.7.1: purga pendientes caducados y lotes inactivos; recuentos, nunca filas. */
export async function purgarDatosAvisosUseCase(
  repo: IKitAvisosEnvioRepository,
  opciones: OpcionesPurgarAvisos,
): Promise<Result<ResumenPurga>> {
  const resumen = nuevoResumen();
  let error: AppError | undefined;

  const pendientesResult = await repo.purgarPendientes(antesDeIso(opciones.ahora));
  if (pendientesResult.success) {
    resumen.pendientesPurgados = pendientesResult.data;
  } else {
    error = pendientesResult.error;
  }

  const lotesResult = await repo.findLotesConContacto();
  if (!lotesResult.success) return lotesResult;

  const caducidadesResult = await repo.findUltimasCaducidades(lotesResult.data);
  if (!caducidadesResult.success) return caducidadesResult;

  const { inactivos, sinFechas } = lotesInactivos(opciones.hoy, lotesResult.data, caducidadesResult.data);
  resumen.lotesSinFechas = sinFechas;

  const purgaResult = await repo.purgarContactoDeLotes(inactivos);
  if (purgaResult.success) {
    resumen.inactivosPurgados = purgaResult.data;
  } else {
    error = purgaResult.error;
  }

  if (error) return { success: false, error };
  return { success: true, data: resumen };
}
