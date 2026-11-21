// kit-expiry (prueba en producción del 2026-11-19): los emails de avisos se
// envían en `after()`, después de responder. Un fallo ahí (p. ej. sin
// remitente configurado) se perdía sin llegar a Brevo ni a log_errors.
// Este envoltorio registra cualquier error de la tarea, sin datos personales
// (solo el mensaje del error y el método), y nunca lo propaga.
import type { Programar } from '@/core/domain/entities/kit-avisos-types';

interface RegistroErrorTarea {
  codigo: string;
  mensaje: string;
  modulo: 'api';
  metodo: string;
}

type Tarea = () => Promise<void>;

/**
 * `codigoError` (sdd pet-id-qr-profile, Fase 10): opcional, por defecto
 * `KIT_AVISOS_EMAIL_ERROR` — así las dos llamadas de `kit-avisos` no
 * cambian, y `pet-id` (u otro módulo futuro) puede registrar su propio
 * código sin necesitar un envoltorio propio.
 */
export function programarConRegistro(
  programar: (tarea: Tarea) => void,
  registrar: (error: RegistroErrorTarea) => void,
  metodo: string,
  codigoError: string = 'KIT_AVISOS_EMAIL_ERROR',
): Programar {
  return (tarea) => {
    programar(async () => {
      try {
        await tarea();
      } catch (e) {
        registrar({
          codigo: codigoError,
          mensaje: e instanceof Error ? e.message : 'Error desconocido al enviar el email',
          modulo: 'api',
          metodo,
        });
      }
    });
  };
}
