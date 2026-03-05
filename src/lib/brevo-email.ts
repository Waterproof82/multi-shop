const BREVO_API_KEY = process.env.BREVO_API_KEY;

export interface SendEmailParams {
  to: string | string[];
  subject: string;
  htmlContent: string;
  senderName?: string;
  senderEmail?: string;
}

export async function sendEmail({ to, subject, htmlContent, senderName = 'Pedidos', senderEmail = 'a369cb001@smtp-brevo.com' }: SendEmailParams) {
  if (!BREVO_API_KEY) {
    console.error('BREVO_API_KEY not configured');
    throw new Error('BREVO_API_KEY not configured');
  }

  const recipients = Array.isArray(to) 
    ? to.map(email => ({ email }))
    : [{ email: to }];

  const payload = {
    subject,
    htmlContent,
    sender: { name: senderName, email: senderEmail },
    to: recipients,
  };

  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'api-key': BREVO_API_KEY,
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    
    if (!response.ok) {
      console.error('Brevo API error:', response.status, result);
      throw new Error(`Brevo API error: ${response.status}`);
    }

    return result;
  } catch (error) {
    console.error('Error sending Brevo email:', error);
    throw error;
  }
}
