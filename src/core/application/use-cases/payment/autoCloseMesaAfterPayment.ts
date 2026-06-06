import { mesaSesionUseCase, pedidoRepository } from '@/core/infrastructure/database';
import { deleteMessage } from '@/core/infrastructure/services/telegram.service';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';

/**
 * Fire-and-forget: closes the mesa session and reopens it after full payment.
 * Called from both manual payment and Redsys webhook when sesion_pagada = true.
 *
 * Steps mirror the waiter close route:
 *   1. Delete Telegram order notifications for the session
 *   2. Consolidate individual orders into a single ticket
 *   3. Close the session (sets cerrada_at)
 *   4. Reopen the mesa (new session — invalidates all client tokens)
 */
export async function autoCloseMesaAfterPayment(sesionId: string, empresaId: string): Promise<void> {
  try {
    const supabase = getSupabaseClient();

    // Resolve mesa_id (needed to reopen the table)
    const { data: sesionRow } = await supabase
      .from('mesa_sesiones')
      .select('mesa_id')
      .eq('id', sesionId)
      .maybeSingle();

    const mesaId = (sesionRow as { mesa_id: string } | null)?.mesa_id;
    if (!mesaId) return;

    // Delete Telegram notifications for this session (best-effort)
    const telegramMessages = await pedidoRepository.findSesionTelegramMessages(sesionId);
    if (telegramMessages.success) {
      await Promise.all(
        telegramMessages.data.map(({ messageId, chatId }) => deleteMessage(chatId, messageId))
      );
    }

    // Merge individual orders into a single consolidated ticket
    await pedidoRepository.consolidateSesionOrders(sesionId);

    // Close session (sets cerrada_at)
    await mesaSesionUseCase.closeSesion(sesionId);

    // Reopen so the table is immediately available for new customers
    // Old client tokens are automatically invalidated (they reference the closed session)
    await mesaSesionUseCase.openSesion(mesaId, empresaId);
  } catch {
    // Never propagate — payment is already confirmed, this is best-effort cleanup
  }
}
