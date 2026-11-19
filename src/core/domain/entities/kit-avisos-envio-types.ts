// src/core/domain/entities/kit-avisos-envio-types.ts
// kit-expiry-m3 (sdd en kitemergenciacanarias, docs/sdd/kit-expiry-reminders/m3/)
// M3d1: contratos del cron diario (design.md, "Contratos"). `FilaEnviado` y
// `EnviadoAviso` NO se redefinen aquí — ya los define `avisos.ts` (M3b),
// que es la única fuente de verdad sobre la clave de idempotencia; este
// módulo los reexporta para que el repositorio y el caso de uso los
// importen desde la capa de dominio, como el resto de tipos de este fichero.
import type { Caducidad } from '@/lib/kit-caducidad/estado';

export type { FilaEnviado, EnviadoAviso } from '@/lib/kit-caducidad/avisos';

/** R-M3.2.1: `pausada` sale de `kit_avisos_config.avisos_pausados`; sin fila = `false`. */
export interface EmpresaConAvisos {
  id: string;
  nombre: string;
  pausada: boolean;
}

/** R-M3.2.2: un kit con contacto (email, `registrado_at` y `consiente_email_at` no nulos). */
export interface KitConContacto {
  serie: string;
  loteId: string;
  email: string;
  token: string;
  registradoAt: string;
}

/** R-M3.2.3: nombre y slug del kit del lote (`kit_lotes → productos`). */
export interface LoteKit {
  loteId: string;
  kitNombre: string;
  kitSlug: string | null;
}

/** R-M3.7.1: recuentos del envío — nunca email, teléfono ni token, solo números. */
export interface ResumenAvisos {
  empresas: number;
  pausadas: number;
  sinRemitente: number;
  kits: number;
  enviados: number;
  fallidos: number;
  sinMarcar: number;
  aplazados: number;
  /**
   * kit-expiry-m3 (W2 de verify-report.md): un fallo de lectura (p. ej.
   * `findKitsConAvisos`, `findLotesKit`, `findCaducidades` o `findEnviados`)
   * para ESTA empresa ya no aborta el resto del cron — se cuenta aquí y se
   * sigue con la siguiente empresa.
   */
  empresasConError: number;
}

/** R-M3.7.1: recuentos de la purga. */
export interface ResumenPurga {
  pendientesPurgados: number;
  inactivosPurgados: number;
  lotesSinFechas: number;
}

/** R-M3.2.3: fila de `kit_lote_caducidades_efectivas` con su lote de origen. */
export type CaducidadDeLote = Caducidad & { loteId: string };

/** M3d4/DD9: fila `(loteId, caducaEl)` para `lotesInactivos` (`purga.ts`). */
export interface CaducidadDeLoteMinima {
  loteId: string;
  caducaEl: string;
}
