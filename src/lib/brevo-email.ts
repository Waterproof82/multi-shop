import { logger } from '@/core/infrastructure/logging/logger';

function getBrevoApiKey(): string {
  const key = process.env.BREVO_API_KEY;
  if (!key) {
    throw new Error('BREVO_API_KEY is not configured');
  }
  return key;
}

export interface SendEmailParams {
  to: string | string[];
  subject: string;
  htmlContent: string;
  textContent?: string;
  senderName?: string;
  senderEmail?: string;
  /**
   * kit-expiry-m3 (M3a/D-M3-6): cabeceras personalizadas (`payload.headers`
   * de Brevo). Confirmado en su doc oficial
   * (https://developers.brevo.com/reference/sendtransacemail): admite un
   * mapa `string -> string` de cabeceras no estándar (`List-Unsubscribe`,
   * `List-Unsubscribe-Post`, `IdempotencyKey`...); Brevo advierte que las
   * cabeceras SMTP estándar no se soportan por esta vía — se verifica en la
   * prueba de *preview* (tasks.md, prerrequisito 4).
   */
  headers?: Record<string, string>;
}

export async function sendEmail({ to, subject, htmlContent, textContent, senderName = 'Pedidos', senderEmail, headers }: SendEmailParams) {
  const apiKey = getBrevoApiKey();

  const resolvedSenderEmail = senderEmail || process.env.BREVO_DEFAULT_SENDER_EMAIL;
  if (!resolvedSenderEmail) {
    throw new Error('Sender email not configured');
  }

  const recipients = Array.isArray(to)
    ? to.map(email => ({ email }))
    : [{ email: to }];

  const payload: Record<string, unknown> = {
    subject,
    htmlContent,
    sender: { name: senderName, email: resolvedSenderEmail },
    to: recipients,
  };

  if (textContent) {
    payload.textContent = textContent;
  }

  if (headers) {
    payload.headers = headers;
  }

  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'api-key': apiKey,
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();

    if (!response.ok) {
      await logger.logAndReturnError(
        'BREVO_API_ERROR',
        `Brevo API error: ${response.status}`,
        'api',
        'sendEmail',
        { details: { status: response.status, recipientCount: recipients.length, result } }
      );
      throw new Error(`Brevo API error: ${response.status}`);
    }

    return result;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Brevo API error:')) {
      throw error;
    }
    await logger.logFromCatch(error, 'api', 'sendEmail');
    throw error;
  }
}
