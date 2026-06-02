import { Result, AppError } from '@/core/domain/entities/types';
import { DELIVERY_ERRORS } from '@/core/domain/constants/api-errors';
import {
  buildRedsysFormData,
  generatePaymentOrderRef,
  RedsysFormData,
} from '@/core/infrastructure/services/redsys.service';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';
import { logger } from '@/core/infrastructure/logging/logger';

export interface InitiateRedsysMesaPaymentInput {
  mesaId: string;
  empresaId: string;
  /** true = pay only this person's share */
  esDivision: boolean;
  urlOk: string;
  urlKo: string;
  webhookUrl: string;
}

export async function initiateRedsysMesaPaymentUseCase(
  input: InitiateRedsysMesaPaymentInput
): Promise<Result<RedsysFormData, AppError>> {
  try {
    const supabase = getSupabaseClient();

    // Fetch empresa credentials + payment flag
    const { data: empresa, error: empresaError } = await supabase
      .from('empresas')
      .select('nombre, redsys_merchant_code, redsys_terminal, redsys_secret_key, pagos_mesa_habilitados')
      .eq('id', input.empresaId)
      .single();

    if (empresaError || !empresa) {
      return {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Empresa not found',
          module: 'use-case',
          method: 'initiateRedsysMesaPaymentUseCase',
        },
      };
    }

    const e = empresa as Record<string, unknown>;

    if (!e['pagos_mesa_habilitados']) {
      return {
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Pagos en mesa no habilitados para esta empresa',
          module: 'use-case',
          method: 'initiateRedsysMesaPaymentUseCase',
        },
      };
    }

    const merchantCode = e['redsys_merchant_code'] as string | null;
    const terminal = e['redsys_terminal'] as string | null;
    const secretKey = e['redsys_secret_key'] as string | null;
    const merchantName = (e['nombre'] as string | null) ?? 'Tienda';

    const isDev = process.env.NODE_ENV !== 'production';
    const effectiveMerchantCode = merchantCode ?? (isDev ? '999008881' : null);
    const effectiveSecretKey    = secretKey    ?? (isDev ? 'sq7HjrUOBfKmC576ILgskD5srU870gJ7' : null);
    const effectiveTerminal     = terminal     ?? '001';

    if (!effectiveMerchantCode || !effectiveSecretKey) {
      return {
        success: false,
        error: {
          ...DELIVERY_ERRORS.PAYMENT_NOT_CONFIGURED,
          module: 'use-case',
          method: 'initiateRedsysMesaPaymentUseCase',
        },
      };
    }

    // Find active sesion for the mesa (including division state + payment lock)
    const { data: sesion, error: sesionError } = await supabase
      .from('mesa_sesiones')
      .select('id, empresa_id, division_personas, division_pagos_realizados, pago_en_curso, pago_iniciado_en')
      .eq('mesa_id', input.mesaId)
      .is('cerrada_at', null)
      .maybeSingle();

    if (sesionError || !sesion) {
      return {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'No hay sesión activa para esta mesa',
          module: 'use-case',
          method: 'initiateRedsysMesaPaymentUseCase',
        },
      };
    }

    const s = sesion as Record<string, unknown>;
    const sesionId = s['id'] as string;
    const divisionPersonas = (s['division_personas'] as number | null) ?? null;
    const divisionPagosRealizados = (s['division_pagos_realizados'] as number) ?? 0;

    // Reject if another payment is already in progress (lock not expired).
    // Allow if the lock is within GRACE_PERIOD_MS — the UI pre-locks via
    // POST /api/mesas/[mesaId]/lock before total verification, and then this
    // use case is called immediately after. A fresh lock means it's the same client.
    const pagoEnCurso = s['pago_en_curso'] as boolean;
    const pagoIniciadoEn = s['pago_iniciado_en'] as string | null;
    const LOCK_EXPIRY_MS = 15 * 60 * 1000;
    // Grace period: the UI pre-locks when the user clicks "Pagar" / "Dividir cuenta",
    // then calls this use case after total verification + optional division modal.
    // A fresh lock (< 5 min) means it's the same client — let them through.
    const GRACE_PERIOD_MS = 5 * 60 * 1000;
    const lockAge = pagoIniciadoEn
      ? Date.now() - new Date(pagoIniciadoEn).getTime()
      : Infinity;
    const lockFresh = lockAge < LOCK_EXPIRY_MS;
    const lockInGrace = lockAge < GRACE_PERIOD_MS;
    if (pagoEnCurso && lockFresh && !lockInGrace) {
      return {
        success: false,
        error: {
          code: 'PAYMENT_IN_PROGRESS',
          message: 'Ya hay un pago en curso para esta mesa',
          module: 'use-case',
          method: 'initiateRedsysMesaPaymentUseCase',
        },
      };
    }

    // Fetch all pedidos in the session
    const { data: pedidos, error: pedidosError } = await supabase
      .from('pedidos')
      .select('id, total, numero_pedido')
      .eq('sesion_id', sesionId)
      .eq('empresa_id', input.empresaId);

    if (pedidosError || !pedidos || pedidos.length === 0) {
      return {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'No hay pedidos en la sesión activa',
          module: 'use-case',
          method: 'initiateRedsysMesaPaymentUseCase',
        },
      };
    }

    const rows = pedidos as { id: string; total: unknown; numero_pedido: unknown }[];
    const sessionTotal = rows.reduce((sum, p) => sum + Number(p.total), 0);

    // Determine the charge amount: full total or one person's share
    let amountCents: number;
    if (input.esDivision && divisionPersonas && divisionPersonas > 1) {
      const perPersonaCents = Math.round((sessionTotal / divisionPersonas) * 100);
      const sharesRemaining = divisionPersonas - divisionPagosRealizados;
      const isLastShare = sharesRemaining === 1;
      if (isLastShare) {
        // Last person pays the remainder to avoid rounding gaps
        const alreadyPaidCents = perPersonaCents * divisionPagosRealizados;
        amountCents = Math.round(sessionTotal * 100) - alreadyPaidCents;
      } else {
        amountCents = perPersonaCents;
      }
    } else {
      amountCents = Math.round(sessionTotal * 100);
    }

    // Use the highest numero_pedido as anchor for the payment ref
    const maxNumeroPedido = rows.reduce(
      (max, p) => Math.max(max, Number(p.numero_pedido) || 0),
      0
    );
    const anchorPedido = rows.find(p => Number(p.numero_pedido) === maxNumeroPedido) ?? rows[0];
    const paymentOrderRef = generatePaymentOrderRef(maxNumeroPedido || undefined);

    if (input.esDivision && divisionPersonas && divisionPersonas > 1) {
      // Division payment: each person's share gets its own row in mesa_division_pagos.
      // This prevents the race condition where concurrent initiations overwrite the same
      // anchor pedido's payment_order_ref, causing one payment to be silently lost.
      const { error: divInsertError } = await supabase
        .from('mesa_division_pagos')
        .insert({
          sesion_id: sesionId,
          empresa_id: input.empresaId,
          payment_order_ref: paymentOrderRef,
          payment_amount_cents: amountCents,
          status: 'pending',
        });

      if (divInsertError) {
        await logger.logAndReturnError(
          'DB_INSERT_ERROR',
          divInsertError.message,
          'use-case',
          'initiateRedsysMesaPaymentUseCase',
          { details: { code: divInsertError.code, sesionId } }
        );
        return {
          success: false,
          error: {
            code: 'DB_ERROR',
            message: 'Error al iniciar pago de división',
            module: 'use-case',
            method: 'initiateRedsysMesaPaymentUseCase',
          },
        };
      }
    } else {
      // Full (non-division) payment: mark all pedidos as pending and set payment_order_ref
      // on the anchor so the webhook can reconcile against pedidos as before.
      const pedidoIds = rows.map(p => p.id);

      const { error: updatePendingError } = await supabase
        .from('pedidos')
        .update({ payment_status: 'pending' })
        .in('id', pedidoIds)
        .eq('empresa_id', input.empresaId);

      if (updatePendingError) {
        await logger.logAndReturnError(
          'DB_UPDATE_ERROR',
          updatePendingError.message,
          'use-case',
          'initiateRedsysMesaPaymentUseCase',
          { details: { code: updatePendingError.code, sesionId } }
        );
        return {
          success: false,
          error: {
            code: 'DB_ERROR',
            message: 'Error al iniciar pago de mesa',
            module: 'use-case',
            method: 'initiateRedsysMesaPaymentUseCase',
          },
        };
      }

      const { error: updateAnchorError } = await supabase
        .from('pedidos')
        .update({
          payment_order_ref: paymentOrderRef,
          payment_amount_cents: amountCents,
        })
        .eq('id', anchorPedido.id)
        .eq('empresa_id', input.empresaId);

      if (updateAnchorError) {
        await logger.logAndReturnError(
          'DB_UPDATE_ERROR',
          updateAnchorError.message,
          'use-case',
          'initiateRedsysMesaPaymentUseCase',
          { details: { code: updateAnchorError.code, pedidoId: anchorPedido.id } }
        );
        return {
          success: false,
          error: {
            code: 'DB_ERROR',
            message: 'Error al iniciar pago de mesa',
            module: 'use-case',
            method: 'initiateRedsysMesaPaymentUseCase',
          },
        };
      }
    }

    const formData = buildRedsysFormData(
      {
        merchantCode: effectiveMerchantCode,
        terminal: effectiveTerminal,
        secretKey: effectiveSecretKey,
      },
      {
        order: paymentOrderRef,
        amountCents,
        currency: '978',
        transactionType: '0',
        urlOk: input.urlOk,
        urlKo: input.urlKo,
        merchantName,
        webhookUrl: input.webhookUrl,
      }
    );

    // Lock the session so concurrent initiations and new orders are blocked
    await supabase
      .from('mesa_sesiones')
      .update({ pago_en_curso: true, pago_iniciado_en: new Date().toISOString() })
      .eq('id', sesionId);

    return { success: true, data: formData };
  } catch (e) {
    const appError = await logger.logFromCatch(
      e,
      'use-case',
      'initiateRedsysMesaPaymentUseCase',
      { empresaId: input.empresaId, details: { mesaId: input.mesaId } }
    );
    return { success: false, error: appError };
  }
}
