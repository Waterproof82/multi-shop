import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sendEmail } from '@/lib/brevo-email';
import { empresaUseCase } from '@/core/infrastructure/database';
import { requireAuth, requireRole } from '@/core/infrastructure/api/helpers';
import { rateLimitAdmin } from '@/core/infrastructure/api/rate-limit';
import { logApiError } from '@/core/infrastructure/api/api-logger';
import { escapeHtml } from '@/lib/html-utils';

const enviarEmailSchema = z.object({
  items: z.array(z.object({
    item: z.object({
      id: z.string().uuid(),
      name: z.string().max(200),
      price: z.number().min(0).max(100_000),
    }),
    quantity: z.number().int().min(1).max(99),
    selectedComplements: z.array(z.object({
      name: z.string().max(200),
      price: z.number().min(0).max(100_000),
    })).max(20).optional(),
  })).min(1).max(50),
  total: z.number().min(0).max(100_000),
  numeroOrden: z.number().int().optional(),
  nombre: z.string().max(100).optional(),
  telefono: z.string().max(20).optional(),
  email: z.string().email().optional().or(z.literal('')),
});

type OrderItem = z.infer<typeof enviarEmailSchema>['items'][number];

function generateOrderEmail(items: OrderItem[], total: number, empresaNombre: string, numeroOrden: number, nombre: string, telefono: string, email: string | null): string {
  const itemsHtml = items.map(ci => {
    const complementPrice = ci.selectedComplements?.reduce((sum, c) => sum + c.price, 0) || 0;
    const itemTotal = (ci.item.price + complementPrice) * ci.quantity;

    const complementsHtml = ci.selectedComplements?.map(c =>
      `<li style="margin-left: 20px; color: #666;">+ ${escapeHtml(c.name)} (${c.price.toFixed(2)}€)</li>`
    ).join('') || '';

    return `
      <tr style="border-bottom: 1px solid #eee;">
        <td style="padding: 12px 8px;">
          <strong>${escapeHtml(ci.item.name)}</strong>
          ${complementsHtml ? `<ul style="margin: 4px 0 0 0; padding: 0;">${complementsHtml}</ul>` : ''}
        </td>
        <td style="padding: 12px 8px; text-align: center;">${ci.quantity}</td>
        <td style="padding: 12px 8px; text-align: right;">${itemTotal.toFixed(2)}€</td>
      </tr>
    `;
  }).join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f5f5f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <tr style="background-color: #1a1a1a;">
            <td style="padding: 24px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">${escapeHtml(empresaNombre)}</h1>
              <p style="margin: 8px 0 0 0; color: #888; font-size: 14px;">Nuevo Pedido #${numeroOrden}</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 24px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f9f9f9; border-radius: 8px; margin-bottom: 20px;">
                <tr>
                  <td style="padding: 16px;">
                    <p style="margin: 0; color: #333; font-size: 14px;"><strong>Cliente:</strong> ${escapeHtml(nombre)}</p>
                    <p style="margin: 8px 0 0 0; color: #333; font-size: 14px;"><strong>Teléfono:</strong> ${escapeHtml(telefono)}</p>
                    ${email ? `<p style="margin: 8px 0 0 0; color: #333; font-size: 14px;"><strong>Email:</strong> ${escapeHtml(email)}</p>` : ''}
                  </td>
                </tr>
              </table>
              <p style="margin: 0 0 16px 0; color: #333; font-size: 16px;">
                Detalles del pedido:
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                <thead>
                  <tr style="background-color: #f9f9f9;">
                    <th style="padding: 12px 8px; text-align: left; font-size: 12px; text-transform: uppercase; color: #666; border-bottom: 2px solid #1a1a1a;">Producto</th>
                    <th style="padding: 12px 8px; text-align: center; font-size: 12px; text-transform: uppercase; color: #666; border-bottom: 2px solid #1a1a1a;">Cant.</th>
                    <th style="padding: 12px 8px; text-align: right; font-size: 12px; text-transform: uppercase; color: #666; border-bottom: 2px solid #1a1a1a;">Total</th>
                  </tr>
                </thead>
                <tbody>
                  ${itemsHtml}
                </tbody>
              </table>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding: 16px 0; border-top: 2px solid #1a1a1a;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="font-size: 18px; font-weight: 600; color: #333;">TOTAL</td>
                        <td style="text-align: right; font-size: 24px; font-weight: 700; color: #1a1a1a;">${total.toFixed(2)}€</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr style="background-color: #f9f9f9;">
            <td style="padding: 20px; text-align: center;">
              <p style="margin: 0; color: #888; font-size: 12px;">
                Pedido generado automáticamente desde ${escapeHtml(empresaNombre)}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

export async function POST(request: NextRequest) {
  try {
    const rateLimited = await rateLimitAdmin(request);
    if (rateLimited) return rateLimited;

    const { empresaId, error: authError } = await requireAuth(request);
    if (authError) return authError;
    const roleError = requireRole(request, ['admin', 'superadmin']);
    if (roleError) return roleError;

    const empresaResult = await empresaUseCase.getById(empresaId!);

    if (!empresaResult.success) {
      return NextResponse.json({ error: empresaResult.error.message }, { status: 500 });
    }

    const empresa = empresaResult.data;

    if (!empresa) {
      return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 });
    }

    if (!empresa.emailNotification) {
      return NextResponse.json({ error: 'Email de notificación no configurado' }, { status: 400 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }
    const parsed = enviarEmailSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
    }
    const { items, total, numeroOrden, nombre, telefono, email } = parsed.data;

    const html = generateOrderEmail(
      items,
      total,
      empresa.nombre || 'Empresa',
      numeroOrden || 1,
      nombre || 'Cliente',
      telefono || 'No proporcionado',
      email || null
    );

    await sendEmail({
      to: empresa.emailNotification,
      subject: `Nuevo pedido de ${empresa.nombre} - ${total.toFixed(2)}€`,
      htmlContent: html,
      senderName: empresa.nombre || 'Empresa',
      senderEmail: empresa.emailNotification,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    await logApiError('Send order email', error, 'POST');
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
