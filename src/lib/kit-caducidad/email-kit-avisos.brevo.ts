// src/lib/kit-caducidad/email-kit-avisos.brevo.ts
// kit-expiry-m2b (sdd en kitemergenciacanarias, docs/sdd/kit-expiry-reminders/m2b/),
// M2b6a: adapta `sendEmail` (brevo-email.ts) al puerto `EmailKitAvisos` que
// consumen los casos de uso. R-M2b.5.2: `senderName` es el nombre de la
// empresa (marca), no "Pedidos" — el remitente identificable (art. 20.1).
//
// kit-expiry-m3 (M3a/D-M3-6): `opciones.cabeceras` pasa a `sendEmail` como
// `headers` (RFC 8058 `List-Unsubscribe`, `IdempotencyKey`...). Opcional:
// M2b sigue llamando a `enviar(to, contenido)` sin tercer argumento.
import { sendEmail } from '@/lib/brevo-email';
import type { EmailKitAvisos } from '@/core/domain/entities/kit-avisos-types';

export function crearEmailKitAvisosBrevo(senderName: string): EmailKitAvisos {
  return {
    async enviar(to, contenido, opciones) {
      await sendEmail({
        to,
        subject: contenido.asunto,
        htmlContent: contenido.html,
        textContent: contenido.texto,
        senderName,
        ...(opciones?.cabeceras ? { headers: opciones.cabeceras } : {}),
      });
    },
  };
}
