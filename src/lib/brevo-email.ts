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
}

export async function sendEmail({ to, subject, htmlContent, textContent, senderName = 'Pedidos', senderEmail }: SendEmailParams) {
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

  try {
    console.log('[Brevo] Sending email with payload:', JSON.stringify(payload, null, 2).slice(0, 500));
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
    console.log('[Brevo] Response status:', response.status, 'result:', JSON.stringify(result).slice(0, 500));

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
