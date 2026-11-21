import { describe, expect, it, vi } from 'vitest';
import { programarConRegistro } from '@/lib/kit-caducidad/programar-con-registro';

// Prueba en producción del 2026-11-19: el email de confirmación lanzó dentro de
// `after()` y el error se perdió (ni Brevo ni log_errors). Toda tarea
// programada de avisos debe registrar su fallo, sin datos personales.
describe('programarConRegistro', () => {
  it('ejecuta la tarea a través de la función de programación recibida', async () => {
    const tareas: Array<() => Promise<void>> = [];
    const programar = programarConRegistro((t) => tareas.push(t), vi.fn(), 'POST /api/kit-avisos/alta');
    const tarea = vi.fn().mockResolvedValue(undefined);

    programar(tarea);
    await tareas[0]();

    expect(tarea).toHaveBeenCalledTimes(1);
  });

  it('si la tarea lanza, registra el error con su mensaje y no lo propaga', async () => {
    const tareas: Array<() => Promise<void>> = [];
    const registrar = vi.fn();
    const programar = programarConRegistro((t) => tareas.push(t), registrar, 'POST /api/kit-avisos/alta');

    programar(async () => {
      throw new Error('Sender email not configured');
    });

    await expect(tareas[0]()).resolves.toBeUndefined();
    expect(registrar).toHaveBeenCalledWith({
      codigo: 'KIT_AVISOS_EMAIL_ERROR',
      mensaje: 'Sender email not configured',
      modulo: 'api',
      metodo: 'POST /api/kit-avisos/alta',
    });
  });

  it('un valor lanzado que no es Error se registra con un mensaje genérico', async () => {
    const tareas: Array<() => Promise<void>> = [];
    const registrar = vi.fn();
    const programar = programarConRegistro((t) => tareas.push(t), registrar, 'POST /api/kit-avisos/enlace');

    programar(async () => {
      throw 'x';
    });
    await tareas[0]();

    expect(registrar).toHaveBeenCalledWith(expect.objectContaining({ mensaje: 'Error desconocido al enviar el email' }));
  });

  // sdd pet-id-qr-profile (Fase 10): el 4º parámetro opcional permite a otro
  // módulo (p. ej. `pet-id`) registrar su propio código de error en vez del
  // `KIT_AVISOS_EMAIL_ERROR` fijo — sin romper las dos llamadas existentes,
  // que no lo pasan y siguen viendo el código de kit-avisos de siempre.
  it('con un 4º parámetro, usa ESE código de error en vez de KIT_AVISOS_EMAIL_ERROR', async () => {
    const tareas: Array<() => Promise<void>> = [];
    const registrar = vi.fn();
    const programar = programarConRegistro(
      (t) => tareas.push(t),
      registrar,
      'POST /api/mascota/alta',
      'PET_ALTA_EMAIL_ERROR',
    );

    programar(async () => {
      throw new Error('Sender email not configured');
    });
    await tareas[0]();

    expect(registrar).toHaveBeenCalledWith({
      codigo: 'PET_ALTA_EMAIL_ERROR',
      mensaje: 'Sender email not configured',
      modulo: 'api',
      metodo: 'POST /api/mascota/alta',
    });
  });

  it('sin 4º parámetro, sigue usando KIT_AVISOS_EMAIL_ERROR (compatibilidad)', async () => {
    const tareas: Array<() => Promise<void>> = [];
    const registrar = vi.fn();
    const programar = programarConRegistro((t) => tareas.push(t), registrar, 'POST /api/kit-avisos/alta');

    programar(async () => {
      throw new Error('boom');
    });
    await tareas[0]();

    expect(registrar.mock.calls[0][0].codigo).toBe('KIT_AVISOS_EMAIL_ERROR');
  });
});
