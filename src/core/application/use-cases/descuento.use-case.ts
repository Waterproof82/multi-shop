import { ICodigoDescuentoRepository } from '@/core/domain/repositories/ICodigoDescuentoRepository';
import { IEmpresaRepository } from '@/core/domain/repositories/IEmpresaRepository';
import { Result } from '@/core/domain/entities/types';
import { logger } from '@/core/infrastructure/logging/logger';
import { sendEmail } from '@/lib/brevo-email';
import { escapeHtml } from '@/lib/html-utils';

function generateCodigo(prefix: string): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  for (let i = 0; i < 6; i++) {
    suffix += chars[Math.floor(Math.random() * chars.length)];
  }
  return `${prefix}-${suffix}`;
}

function getEmailSubject(idioma: string, empresaNombre: string, porcentaje: number): string {
  const subjects: Record<string, string> = {
    es: `🎁 Tu descuento del ${porcentaje}% en ${empresaNombre}`,
    en: `🎁 Your ${porcentaje}% discount at ${empresaNombre}`,
    fr: `🎁 Votre réduction de ${porcentaje}% chez ${empresaNombre}`,
    it: `🎁 Il tuo sconto del ${porcentaje}% da ${empresaNombre}`,
    de: `🎁 Ihr ${porcentaje}%-Rabatt bei ${empresaNombre}`,
  };
  return subjects[idioma] ?? subjects['es'];
}

function buildEmailHtml(
  empresaNombre: string,
  codigo: string,
  porcentaje: number,
  fechaExpiracion: Date,
  idioma: string
): { htmlContent: string; textContent: string } {
  const safeNombre = escapeHtml(empresaNombre);
  const safeCodigo = escapeHtml(codigo);
  const expirationStr = fechaExpiracion.toLocaleDateString(
    idioma === 'es' ? 'es-ES' : idioma === 'fr' ? 'fr-FR' : idioma === 'it' ? 'it-IT' : idioma === 'de' ? 'de-DE' : 'en-GB',
    { day: '2-digit', month: '2-digit', year: 'numeric' }
  );

  const messages: Record<string, { heading: string; intro: string; codeLabel: string; validUntil: string; instructions: string }> = {
    es: {
      heading: `¡Bienvenido/a a ${safeNombre}!`,
      intro: `Aquí tienes tu código de descuento exclusivo del ${porcentaje}%:`,
      codeLabel: 'Tu código de descuento:',
      validUntil: `Válido hasta el ${expirationStr}`,
      instructions: 'Introduce este código en el carrito al realizar tu pedido.',
    },
    en: {
      heading: `Welcome to ${safeNombre}!`,
      intro: `Here is your exclusive ${porcentaje}% discount code:`,
      codeLabel: 'Your discount code:',
      validUntil: `Valid until ${expirationStr}`,
      instructions: 'Enter this code in the cart when placing your order.',
    },
    fr: {
      heading: `Bienvenue chez ${safeNombre}!`,
      intro: `Voici votre code de réduction exclusif de ${porcentaje}%:`,
      codeLabel: 'Votre code de réduction:',
      validUntil: `Valable jusqu'au ${expirationStr}`,
      instructions: 'Entrez ce code dans le panier lors de votre commande.',
    },
    it: {
      heading: `Benvenuto/a da ${safeNombre}!`,
      intro: `Ecco il tuo codice sconto esclusivo del ${porcentaje}%:`,
      codeLabel: 'Il tuo codice sconto:',
      validUntil: `Valido fino al ${expirationStr}`,
      instructions: 'Inserisci questo codice nel carrello durante l\'ordine.',
    },
    de: {
      heading: `Willkommen bei ${safeNombre}!`,
      intro: `Hier ist Ihr exklusiver ${porcentaje}%-Rabattcode:`,
      codeLabel: 'Ihr Rabattcode:',
      validUntil: `Gültig bis ${expirationStr}`,
      instructions: 'Geben Sie diesen Code im Warenkorb bei Ihrer Bestellung ein.',
    },
  };

  const msg = messages[idioma] ?? messages['es'];

  const htmlContent = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#18181b;background:#fafafa">
  <h1 style="color:#18181b;font-size:24px;margin-bottom:8px">${msg.heading}</h1>
  <p style="color:#52525b;font-size:16px">${msg.intro}</p>
  <div style="background:#fff;border:2px dashed #d4d4d8;border-radius:12px;padding:24px;text-align:center;margin:24px 0">
    <p style="color:#71717a;font-size:14px;margin:0 0 8px">${msg.codeLabel}</p>
    <p style="font-size:32px;font-weight:bold;letter-spacing:4px;color:#18181b;margin:0;font-family:monospace">${safeCodigo}</p>
    <p style="color:#71717a;font-size:13px;margin:12px 0 0">${msg.validUntil}</p>
  </div>
  <p style="color:#52525b;font-size:14px">${msg.instructions}</p>
</body>
</html>`;

  const textContent = `${msg.heading}\n\n${msg.intro}\n\n${msg.codeLabel} ${codigo}\n\n${msg.validUntil}\n\n${msg.instructions}`;

  return { htmlContent, textContent };
}

/**
 * Aviso al propietario por cada código emitido desde la tienda (popup de
 * bienvenida). No hay pantalla de admin que liste `codigos_descuento`, así
 * que este correo es la única traza inmediata de la petición — los códigos
 * usados sí se ven luego en el pedido con su descuento aplicado.
 */
function buildOwnerNotificationHtml(
  empresaNombre: string,
  email: string,
  codigo: string,
  porcentaje: number,
  fechaExpiracion: Date
): { htmlContent: string; textContent: string } {
  const safeNombre = escapeHtml(empresaNombre);
  const safeEmail = escapeHtml(email);
  const safeCodigo = escapeHtml(codigo);
  const fechaStr = fechaExpiracion.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });

  const htmlContent = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#18181b;background:#fafafa">
  <h1 style="color:#18181b;font-size:22px;margin-bottom:8px">Nuevo código de descuento solicitado</h1>
  <p style="color:#52525b;font-size:15px;margin:0 0 16px">Un visitante ha solicitado el descuento de bienvenida en ${safeNombre}.</p>
  <table role="presentation" cellpadding="8" style="border-collapse:collapse;background:#fff;border:1px solid #d4d4d8;font-size:14px;color:#18181b">
    <tr><td style="color:#71717a">Correo</td><td style="font-weight:bold">${safeEmail}</td></tr>
    <tr><td style="color:#71717a">Código</td><td style="font-family:monospace;font-weight:bold;letter-spacing:2px">${safeCodigo}</td></tr>
    <tr><td style="color:#71717a">Descuento</td><td>${porcentaje}%</td></tr>
    <tr><td style="color:#71717a">Caduca</td><td>${fechaStr}</td></tr>
  </table>
</body>
</html>`;

  const textContent = `Nuevo código de descuento solicitado en ${empresaNombre}.\n\nCorreo: ${email}\nCódigo: ${codigo} (${porcentaje}%)\nCaduca: ${fechaStr}`;

  return { htmlContent, textContent };
}

export class DescuentoUseCase {
  constructor(
    private readonly descuentoRepo: ICodigoDescuentoRepository,
    private readonly empresaRepo: IEmpresaRepository
  ) {}

  async subscribe(
    empresaId: string,
    email: string,
    empresaNombre: string,
    idioma: string,
    duracionDias: number = 30
  ): Promise<Result<{ codigo: string }>> {
    try {
      // Check for existing code for this email
      const existingResult = await this.descuentoRepo.findByEmail(email, empresaId);
      if (!existingResult.success) return existingResult;

      if (existingResult.data) {
        return {
          success: false,
          error: { code: 'ALREADY_SUBSCRIBED', message: 'Email already has a discount code for this store', module: 'use-case', method: 'DescuentoUseCase.subscribe' },
        };
      }

      // Get empresa to read percentage
      const empresaResult = await this.empresaRepo.getById(empresaId);
      if (!empresaResult.success) return { success: false, error: empresaResult.error };

      const empresa = empresaResult.data;
      const porcentaje = empresa?.descuentoBienvenidaPorcentaje ?? 5;
      const senderEmail = empresa?.emailNotification || undefined;

      const codigo = generateCodigo('BIENVENIDO');
      const fechaExpiracion = new Date();
      fechaExpiracion.setDate(fechaExpiracion.getDate() + duracionDias);

      const createResult = await this.descuentoRepo.create({
        empresaId,
        clienteEmail: email.toLowerCase(),
        codigo,
        porcentajeDescuento: porcentaje,
        fechaExpiracion,
      });

      if (!createResult.success) return createResult;

      // Owner notification (best-effort — the visitor flow never depends on
      // it, and a missing emailNotification just skips the send).
      if (empresa?.emailNotification) {
        try {
          const { htmlContent, textContent } = buildOwnerNotificationHtml(
            empresaNombre,
            email,
            codigo,
            porcentaje,
            fechaExpiracion
          );
          await sendEmail({
            to: empresa.emailNotification,
            subject: `Nuevo código de descuento solicitado — ${empresaNombre}`,
            htmlContent,
            textContent,
            senderName: empresaNombre,
            senderEmail,
          });
        } catch (ownerErr) {
          await logger.logFromCatch(ownerErr, 'use-case', 'DescuentoUseCase.subscribe.notifyOwner', { details: { empresaId } });
          // Continue — code was saved, owner notification failure is non-fatal
        }
      }

      // Send email (best-effort — don't fail the subscription if email fails)
      try {
        const { htmlContent, textContent } = buildEmailHtml(empresaNombre, codigo, porcentaje, fechaExpiracion, idioma);
        await sendEmail({
          to: email,
          subject: getEmailSubject(idioma, empresaNombre, porcentaje),
          htmlContent,
          textContent,
          senderName: empresaNombre,
          senderEmail,
        });
      } catch (emailErr) {
        await logger.logFromCatch(emailErr, 'use-case', 'DescuentoUseCase.subscribe.sendEmail', { details: { empresaId } });
        // Continue — code was saved, email delivery failure is non-fatal
      }

      return { success: true, data: { codigo } };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'use-case', 'DescuentoUseCase.subscribe', { empresaId });
      return { success: false, error: appError };
    }
  }

  /**
   * Código solicitado desde una captación externa (el form «lista PDF» de la
   * web de marketing). Diferencias con `subscribe`:
   * - NO envía el email de bienvenida: la web ya manda el suyo con el PDF y
   *   el código incrustados, y este método solo devuelve los datos.
   * - Reutiliza el código vigente si el email ya tiene uno
   *   (UNIQUE(empresa_id, cliente_email) impide crear una segunda fila).
   * - Si el código existente está usado o caducado NO emite uno nuevo:
   *   devuelve `codigo: null` y el llamador envía su entregable sin código.
   */
  async subscribeExternal(
    empresaId: string,
    email: string,
    duracionDias: number
  ): Promise<Result<{ codigo: string | null; porcentaje: number; fechaExpiracion: Date | null }>> {
    try {
      const existingResult = await this.descuentoRepo.findByEmail(email, empresaId);
      if (!existingResult.success) return existingResult;

      const existing = existingResult.data;
      if (existing) {
        const vigente = !existing.usado && new Date(existing.fechaExpiracion) >= new Date();
        return {
          success: true,
          data: vigente
            ? { codigo: existing.codigo, porcentaje: existing.porcentajeDescuento, fechaExpiracion: new Date(existing.fechaExpiracion) }
            : { codigo: null, porcentaje: 0, fechaExpiracion: null },
        };
      }

      const empresaResult = await this.empresaRepo.getById(empresaId);
      if (!empresaResult.success) return { success: false, error: empresaResult.error };
      const empresa = empresaResult.data;
      const porcentaje = empresa?.descuentoBienvenidaPorcentaje ?? 5;

      const codigo = generateCodigo('LISTA');
      const fechaExpiracion = new Date();
      fechaExpiracion.setDate(fechaExpiracion.getDate() + duracionDias);

      const createResult = await this.descuentoRepo.create({
        empresaId,
        clienteEmail: email.toLowerCase(),
        codigo,
        porcentajeDescuento: porcentaje,
        fechaExpiracion,
      });

      if (!createResult.success) return createResult;

      return { success: true, data: { codigo, porcentaje, fechaExpiracion } };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'use-case', 'DescuentoUseCase.subscribeExternal', { empresaId });
      return { success: false, error: appError };
    }
  }

  async validateCode(
    codigo: string,
    empresaId: string,
    email: string
  ): Promise<Result<{ id: string; porcentajeDescuento: number }>> {
    try {
      const result = await this.descuentoRepo.findByCodigo(codigo.toUpperCase(), empresaId);
      if (!result.success) return result;

      const code = result.data;
      if (!code) {
        return {
          success: false,
          error: { code: 'CODE_NOT_FOUND', message: 'Discount code not found', module: 'use-case', method: 'DescuentoUseCase.validateCode' },
        };
      }

      if (code.usado) {
        return {
          success: false,
          error: { code: 'CODE_ALREADY_USED', message: 'Discount code has already been used', module: 'use-case', method: 'DescuentoUseCase.validateCode' },
        };
      }

      if (new Date(code.fechaExpiracion) < new Date()) {
        return {
          success: false,
          error: { code: 'CODE_EXPIRED', message: 'Discount code has expired', module: 'use-case', method: 'DescuentoUseCase.validateCode' },
        };
      }

      if (code.clienteEmail.toLowerCase() !== email.toLowerCase()) {
        return {
          success: false,
          error: { code: 'EMAIL_MISMATCH', message: 'Email does not match discount code', module: 'use-case', method: 'DescuentoUseCase.validateCode' },
        };
      }

      return { success: true, data: { id: code.id, porcentajeDescuento: code.porcentajeDescuento } };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'use-case', 'DescuentoUseCase.validateCode', { empresaId });
      return { success: false, error: appError };
    }
  }

  async markAsUsed(codigoId: string, pedidoId: string): Promise<Result<void>> {
    try {
      return await this.descuentoRepo.markAsUsed(codigoId, pedidoId);
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'use-case', 'DescuentoUseCase.markAsUsed', { details: { codigoId, pedidoId } });
      return { success: false, error: appError };
    }
  }
}
