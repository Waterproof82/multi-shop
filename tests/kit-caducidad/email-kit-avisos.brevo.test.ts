// sdd kit-expiry-m3 (docs/sdd/kit-expiry-reminders/m3/), M3a: el adaptador
// `crearEmailKitAvisosBrevo` pasa `opciones.cabeceras` a `sendEmail` como
// `headers` (D-M3-6). M2b no pasa `opciones`, así que debe seguir
// compilando y funcionando sin cambios (parámetro opcional).
import { describe, expect, it, vi } from 'vitest';

const sendEmailMock = vi.fn().mockResolvedValue({ messageId: 'abc' });
vi.mock('@/lib/brevo-email', () => ({ sendEmail: (...args: unknown[]) => sendEmailMock(...args) }));

import { crearEmailKitAvisosBrevo } from '@/lib/kit-caducidad/email-kit-avisos.brevo';

describe('crearEmailKitAvisosBrevo', () => {
  it('con opciones.cabeceras, las pasa a sendEmail como headers', async () => {
    const email = crearEmailKitAvisosBrevo('Kit Emergencia Canarias');

    await email.enviar(
      'titular@example.com',
      { asunto: 'Asunto', html: '<p>Hola</p>', texto: 'Hola' },
      { cabeceras: { 'List-Unsubscribe': '<https://x/baja>' } },
    );

    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ headers: { 'List-Unsubscribe': '<https://x/baja>' } }),
    );
  });

  it('sin opciones, no pasa headers (compatibilidad con M2b)', async () => {
    const email = crearEmailKitAvisosBrevo('Kit Emergencia Canarias');

    await email.enviar('titular@example.com', { asunto: 'Asunto', html: '<p>Hola</p>', texto: 'Hola' });

    expect(sendEmailMock).toHaveBeenCalledWith(expect.not.objectContaining({ headers: expect.anything() }));
  });

  // W1 (verify-report m3): el cron envía a varias empresas con un solo
  // puerto; `opciones.remitenteNombre` permite fijar el remitente de Brevo
  // en cada llamada a `enviar` sin reconstruir el puerto por empresa.
  it('con opciones.remitenteNombre, lo usa como senderName en vez del de construcción', async () => {
    const email = crearEmailKitAvisosBrevo('Nombre de construcción (sin uso)');

    await email.enviar(
      'titular@example.com',
      { asunto: 'Asunto', html: '<p>Hola</p>', texto: 'Hola' },
      { remitenteNombre: 'Empresa B SL' },
    );

    expect(sendEmailMock).toHaveBeenCalledWith(expect.objectContaining({ senderName: 'Empresa B SL' }));
  });

  it('sin opciones.remitenteNombre, usa el nombre de construcción (compatibilidad con M2b)', async () => {
    const email = crearEmailKitAvisosBrevo('Kit Emergencia Canarias');

    await email.enviar('titular@example.com', { asunto: 'Asunto', html: '<p>Hola</p>', texto: 'Hola' });

    expect(sendEmailMock).toHaveBeenCalledWith(expect.objectContaining({ senderName: 'Kit Emergencia Canarias' }));
  });
});
