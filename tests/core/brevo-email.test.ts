// sdd kit-expiry-m3 (docs/sdd/kit-expiry-reminders/m3/), M3a: `sendEmail`
// acepta cabeceras personalizadas opcionales. Confirmado en la doc oficial
// de Brevo (https://developers.brevo.com/reference/sendtransacemail,
// campo `headers`): "Custom email headers (non-standard headers) to
// include in the email. [...] Standard email headers are not supported.
// Example: {"sender.ip":"1.2.3.4", "X-Mailin-custom":"some_custom_value",
// "IdempotencyKey":"abc-123"}" — por eso `IdempotencyKey` se envía como
// clave dentro de `headers`, no como parámetro propio (D-M3-6).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sendEmail } from '@/lib/brevo-email';

function fetchOkMock() {
  return vi.fn().mockResolvedValue(new Response(JSON.stringify({ messageId: 'abc' }), { status: 201 }));
}

function payloadDe(fetchMock: ReturnType<typeof vi.fn>): Record<string, unknown> {
  return JSON.parse(fetchMock.mock.calls[0][1].body as string);
}

describe('sendEmail — cabeceras personalizadas (M3a)', () => {
  beforeEach(() => {
    vi.stubEnv('BREVO_API_KEY', 'test-api-key');
    vi.stubEnv('BREVO_DEFAULT_SENDER_EMAIL', 'avisos@kitemergenciacanarias.es');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('con headers, el payload los incluye tal cual', async () => {
    const fetchMock = fetchOkMock();
    vi.stubGlobal('fetch', fetchMock);

    await sendEmail({
      to: 'titular@example.com',
      subject: 'Asunto',
      htmlContent: '<p>Hola</p>',
      headers: { 'List-Unsubscribe': '<https://x/baja>', IdempotencyKey: 'deadbeef' },
    });

    expect(payloadDe(fetchMock).headers).toEqual({
      'List-Unsubscribe': '<https://x/baja>',
      IdempotencyKey: 'deadbeef',
    });
  });

  it('sin headers, el payload no lleva la clave headers', async () => {
    const fetchMock = fetchOkMock();
    vi.stubGlobal('fetch', fetchMock);

    await sendEmail({ to: 'titular@example.com', subject: 'Asunto', htmlContent: '<p>Hola</p>' });

    expect(payloadDe(fetchMock)).not.toHaveProperty('headers');
  });

  it('una respuesta no ok lanza "Brevo API error: <status>"', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 400 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      sendEmail({ to: 'titular@example.com', subject: 'Asunto', htmlContent: '<p>Hola</p>' }),
    ).rejects.toThrow('Brevo API error: 400');
  });
});
