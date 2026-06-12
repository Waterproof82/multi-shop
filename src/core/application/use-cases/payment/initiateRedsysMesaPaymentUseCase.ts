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
  /** Client's expected total in cents. If provided and it differs from DB total, the use case
   *  returns TOTAL_MISMATCH so the client can show an updated total before retrying. */
  expectedTotalCents?: number;
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
      .select('id, empresa_id, division_personas, division_pagos_realizados, sesion_pagada, pago_en_curso, pago_iniciado_en, division_base_cents')
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
    const divisionBaseCents = (s['division_base_cents'] as number | null) ?? null;
    const sesionPagada = (s['sesion_pagada'] as boolean) ?? false;

    // Reject if the session is already fully paid (covers both full and division payments,
    // including manual payments registered by the waiter).
    if (sesionPagada) {
      return {
        success: false,
        error: {
          code: 'ALREADY_PAID',
          message: 'Esta sesión ya está pagada',
          module: 'use-case',
          method: 'initiateRedsysMesaPaymentUseCase',
        },
      };
    }

    // For division payments: also guard against the counter being already complete,
    // which can happen if sesion_pagada hasn't propagated yet.
    if (input.esDivision && divisionPersonas && divisionPagosRealizados >= divisionPersonas) {
      return {
        success: false,
        error: {
          code: 'ALREADY_PAID',
          message: 'Todos los pagos de la división ya han sido realizados',
          module: 'use-case',
          method: 'initiateRedsysMesaPaymentUseCase',
        },
      };
    }

    // For full payments: reject if another payment is already in progress (lock not expired).
    // Division payments skip this check — each share is independent and concurrent payers
    // are allowed. The DB-level mesa_division_pagos table handles concurrency safely.
    if (!input.esDivision) {
      const pagoEnCurso = s['pago_en_curso'] as boolean;
      const pagoIniciadoEn = s['pago_iniciado_en'] as string | null;
      const LOCK_EXPIRY_MS = 15 * 60 * 1000;
      // Grace period: the UI pre-locks when the user clicks "Pagar", then calls this
      // use case after total verification. A fresh lock (< 5 min) = same client, let through.
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

    // Guard against in-flight orders that committed after the client's last fetch.
    // If the caller provided expectedTotalCents and it differs by more than 1 cent,
    // abort and return a typed error so the client can show the updated total.
    if (
      input.expectedTotalCents !== undefined &&
      Math.abs(Math.round(sessionTotal * 100) - input.expectedTotalCents) > 1
    ) {
      return {
        success: false,
        error: {
          code: 'TOTAL_MISMATCH',
          message: JSON.stringify({ newTotalCents: Math.round(sessionTotal * 100) }),
          module: 'use-case',
          method: 'initiateRedsysMesaPaymentUseCase',
        },
      };
    }

    const sessionTotalCents = Math.round(sessionTotal * 100);

    // Use the highest numero_pedido as anchor for the payment ref
    const maxNumeroPedido = rows.reduce(
      (max, p) => Math.max(max, Number(p.numero_pedido) || 0),
      0
    );
    const anchorPedido = rows.find(p => Number(p.numero_pedido) === maxNumeroPedido) ?? rows[0];
    const paymentOrderRef = generatePaymentOrderRef(maxNumeroPedido || undefined);

    let amountCents: number;

    if (input.esDivision && divisionPersonas && divisionPersonas > 1) {
      // Atomically claim a slot and insert the mesa_division_pagos row.
      // The RPC uses FOR UPDATE on mesa_sesiones to serialize concurrent payers:
      // - checks active (non-failed) claims against division_personas
      // - calculates this payer's share (last payer absorbs rounding gap)
      // - inserts the row — all in one transaction, no race condition.
      const { data: claimData, error: claimError } = await supabase
        .rpc('claim_and_create_division_pago', {
          p_sesion_id:           sesionId,
          p_empresa_id:          input.empresaId,
          p_payment_order_ref:   paymentOrderRef,
          p_session_total_cents: divisionBaseCents ?? sessionTotalCents,
        });

      if (claimError) {
        await logger.logAndReturnError(
          'DB_INSERT_ERROR',
          claimError.message,
          'use-case',
          'initiateRedsysMesaPaymentUseCase',
          { details: { code: claimError.code, sesionId } }
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

      const claimRow = (claimData as { claimed: boolean; amount_cents: number }[] | null)?.[0];
      if (!claimRow?.claimed) {
        return {
          success: false,
          error: {
            code: 'ALREADY_PAID',
            message: 'Todos los pagos de la división ya han sido realizados',
            module: 'use-case',
            method: 'initiateRedsysMesaPaymentUseCase',
          },
        };
      }

      amountCents = claimRow.amount_cents;
    } else {
      // Full (non-division) payment: mark all pedidos as pending and set payment_order_ref
      // on the anchor so the webhook can reconcile against pedidos as before.
      amountCents = sessionTotalCents;
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

    // Lock the session for full payments only — blocks new orders and concurrent initiations.
    // Division payments don't set this flag: each share is independent, concurrent payers
    // are allowed, and the waiter grid already shows "pagando" via divisionActiva.
    if (!input.esDivision) {
      await supabase
        .from('mesa_sesiones')
        .update({ pago_en_curso: true, pago_iniciado_en: new Date().toISOString() })
        .eq('id', sesionId);
    }

    // For division payments, return the paymentOrderRef so the client can store it
    // and release the pending slot if the user cancels or abandons the Redsys flow.
    const responseData = input.esDivision
      ? { ...formData, paymentOrderRef }
      : formData;

    return { success: true, data: responseData };
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
