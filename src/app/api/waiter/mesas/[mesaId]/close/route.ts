import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { mesaSesionUseCase, mesaSesionRepository, pedidoRepository } from '@/core/infrastructure/database';
import { deleteMessage } from '@/core/infrastructure/services/telegram.service';

const mesaIdSchema = z.string().uuid('El mesaId debe ser un UUID válido');

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ mesaId: string }> }
) {
  const empresaId = request.headers.get('x-empresa-id');
  if (!empresaId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const { mesaId } = await params;
  const parsed = mesaIdSchema.safeParse(mesaId);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }

  const sesionResult = await mesaSesionRepository.findActiveSesionByMesa(parsed.data);
  if (!sesionResult.success) {
    return NextResponse.json({ error: 'Error al buscar la sesión activa' }, { status: 500 });
  }
  if (!sesionResult.data) {
    return NextResponse.json({ error: 'No hay sesión activa para esta mesa' }, { status: 404 });
  }

  const sesionId = sesionResult.data.id;

  // Delete all Telegram notifications for this session (best-effort, fire-and-forget)
  const telegramMessages = await pedidoRepository.findSesionTelegramMessages(sesionId);
  if (telegramMessages.success) {
    await Promise.all(
      telegramMessages.data.map(({ messageId, chatId }) => deleteMessage(chatId, messageId))
    );
  }

  // Merge all individual orders into a single ticket
  await pedidoRepository.consolidateSesionOrders(sesionId);

  const result = await mesaSesionUseCase.closeSesion(sesionId);
  if (!result.success) {
    return NextResponse.json({ error: 'Error al cerrar la sesión de mesa' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
