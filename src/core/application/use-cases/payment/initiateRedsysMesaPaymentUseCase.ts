import { Result, AppError } from '@/core/domain/entities/types';
import { DELIVERY_ERRORS } from '@/core/domain/constants/api-errors';
import { PAYMENT_LOCK_EXPIRY_MS } from '@/core/domain/constants/pedido';
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

interface EmpresaCredentials {
  effectiveMerchantCode: string;
  effectiveSecretKey: string;
  effectiveTerminal: string;
  merchantName: string;
}

async function fetchEmpresaCredentials(
  empresaId: string
): Promise<Result<EmpresaCredentials, AppError>> {
  const supabase = getSupabaseClient();
  const { data: empresa, error } = await supabase
    .from('empresas')
    .select('nombre, redsys_merchant_code, redsys_terminal, redsys_secret_key, pagos_mesa_habilitados')
    .eq('id', empresaId)
    .single();

  if (error || !empresa) {
    return { success: false, error: { code: 'NOT_FOUND', message: 'Empresa not found', module: 'use-case', method: 'initiateRedsysMesaPaymentUseCase' } };
  }

  const e = empresa as Record<string, unknown>;
  if (!e['pagos_mesa_habilitados']) {
    return { success: false, error: { code: 'FORBIDDEN', message: 'Pagos en mesa no habilitados para esta empresa', module: 'use-case', method: 'initiateRedsysMesaPaymentUseCase' } };
  }

  const isDev = process.env.NODE_ENV !== 'production';
  const effectiveMerchantCode = isDev ? '999008881' : ((e['redsys_merchant_code'] as string | null) ?? null);
  const effectiveSecretKey    = isDev ? 'sq7HjrUOBfKmC576ILgskD5srU870gJ7' : ((e['redsys_secret_key'] as string | null) ?? null);
  const effectiveTerminal     = isDev ? '001' : ((e['redsys_terminal'] as string | null) ?? '001');

  if (!effectiveMerchantCode || !effectiveSecretKey) {
    return { success: false, error: { ...DELIVERY_ERRORS.PAYMENT_NOT_CONFIGURED, module: 'use-case', method: 'initiateRedsysMesaPaymentUseCase' } };
  }

  return {
    success: true,
    data: {
      effectiveMerchantCode,
      effectiveSecretKey,
      effectiveTerminal,
      merchantName: (e['nombre'] as string | null) ?? 'Tienda',
    },
  };
}

interface SesionPaymentState {
  sesionId: string;
  divisionPersonas: number | null;
  divisionPagosRealizados: number;
  divisionBaseCents: number | null;
  divisionTipo: string | null;
  propinaCents: number;
  pagoEnCurso: boolean;
  pagoIniciadoEn: string | null;
}

async function fetchSesionState(
  mesaId: string
): Promise<Result<SesionPaymentState, AppError>> {
  const supabase = getSupabaseClient();
  const { data: sesion, error } = await supabase
    .from('mesa_sesiones')
    .select('id, empresa_id, division_personas, division_pagos_realizados, sesion_pagada, pago_en_curso, pago_iniciado_en, division_base_cents, division_tipo, propina_cents')
    .eq('mesa_id', mesaId)
    .is('cerrada_at', null)
    .maybeSingle();

  if (error || !sesion) {
    return { success: false, error: { code: 'NOT_FOUND', message: 'No hay sesión activa para esta mesa', module: 'use-case', method: 'initiateRedsysMesaPaymentUseCase' } };
  }

  const s = sesion as Record<string, unknown>;
  if ((s['sesion_pagada'] as boolean) ?? false) {
    return { success: false, error: { code: 'ALREADY_PAID', message: 'Esta sesión ya está pagada', module: 'use-case', method: 'initiateRedsysMesaPaymentUseCase' } };
  }

  return {
    success: true,
    data: {
      sesionId: s['id'] as string,
      divisionPersonas: (s['division_personas'] as number | null) ?? null,
      divisionPagosRealizados: (s['division_pagos_realizados'] as number) ?? 0,
      divisionBaseCents: (s['division_base_cents'] as number | null) ?? null,
      divisionTipo: (s['division_tipo'] as string | null) ?? null,
      propinaCents: (s['propina_cents'] as number | null) ?? 0,
      pagoEnCurso: (s['pago_en_curso'] as boolean) ?? false,
      pagoIniciadoEn: (s['pago_iniciado_en'] as string | null) ?? null,
    },
  };
}

function checkPaymentLock(
  esDivision: boolean,
  state: SesionPaymentState
): AppError | null {
  // For division: guard against counter already complete.
  const { divisionPersonas, divisionPagosRealizados, pagoEnCurso, pagoIniciadoEn } = state;
  if (esDivision && divisionPersonas && divisionPagosRealizados >= divisionPersonas) {
    return { code: 'ALREADY_PAID', message: 'Todos los pagos de la división ya han sido realizados', module: 'use-case', method: 'initiateRedsysMesaPaymentUseCase' };
  }
  // For full payment: reject if another payment is in progress (lock not expired, not in grace).
  if (!esDivision) {
    const GRACE_PERIOD_MS = 5 * 60 * 1000;
    const lockAge = pagoIniciadoEn ? Date.now() - new Date(pagoIniciadoEn).getTime() : Infinity;
    if (pagoEnCurso && lockAge < PAYMENT_LOCK_EXPIRY_MS && !(lockAge < GRACE_PERIOD_MS)) {
      return { code: 'PAYMENT_IN_PROGRESS', message: 'Ya hay un pago en curso para esta mesa', module: 'use-case', method: 'initiateRedsysMesaPaymentUseCase' };
    }
  }
  return null;
}

export async function initiateRedsysMesaPaymentUseCase(
  input: InitiateRedsysMesaPaymentInput
): Promise<Result<RedsysFormData, AppError>> {
  try {
    const credResult = await fetchEmpresaCredentials(input.empresaId);
    if (!credResult.success) return credResult;
    const { effectiveMerchantCode, effectiveSecretKey, effectiveTerminal, merchantName } = credResult.data;

    const sesionResult = await fetchSesionState(input.mesaId);
    if (!sesionResult.success) return sesionResult;
    const { sesionId, divisionPersonas, divisionBaseCents, divisionTipo, propinaCents } = sesionResult.data;

    const lockError = checkPaymentLock(input.esDivision, sesionResult.data);
    if (lockError) return { success: false, error: lockError };

    // For personalizado mode: compute confirmed custom payments so the RPC can calculate remaining.
    const supabase = getSupabaseClient();
    let serverPagadoCents = 0;
    if (divisionTipo === 'personalizado') {
      const { data: pagadoTurnos } = await supabase
        .from('mesa_pagos_personalizados')
        .select('importe_cents')
        .eq('sesion_id', sesionId)
        .eq('status', 'pagado');
      serverPagadoCents = ((pagadoTurnos ?? []) as { importe_cents: number | null }[])
        .reduce((acc, t) => acc + (t.importe_cents ?? 0), 0);
    }

    // For division: we still need pedidos to compute sessionTotalCents for the RPC call.
    // For full payment: the RPC computes the total internally (atomic). We only need it for division.
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
    const sessionTotalCents = Math.round(sessionTotal * 100);

    // Use the highest numero_pedido as anchor for the payment ref (division path only; full payment uses RPC).
    const maxNumeroPedido = rows.reduce(
      (max, p) => Math.max(max, Number(p.numero_pedido) || 0),
      0
    );
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
          p_session_total_cents: (divisionBaseCents ?? sessionTotalCents) + propinaCents,
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
      // Full (non-division) payment: single atomic RPC that:
      //   1. FOR UPDATE on mesa_sesiones → serializes concurrent INSERTs in pedidos
      //   2. Reads total safely (no in-flight order can slip in)
      //   3. Validates expectedTotalCents mismatch
      //   4. Marks all pedidos as pending + sets payment_order_ref on anchor
      //   5. Sets pago_en_curso=true INSIDE the same transaction
      // This closes the sub-ms race window between acquire_mesa_lock and the old 3-op sequence.
      const { data: rpcData, error: rpcError } = await supabase.rpc(
        'initiate_mesa_payment_atomic',
        {
          p_sesion_id:            sesionId,
          p_empresa_id:           input.empresaId,
          p_payment_order_ref:    paymentOrderRef,
          p_expected_total_cents: input.expectedTotalCents ?? 0,
          p_already_paid_cents:   serverPagadoCents,
        }
      );

      if (rpcError) {
        await logger.logAndReturnError(
          'DB_INSERT_ERROR',
          rpcError.message,
          'use-case',
          'initiateRedsysMesaPaymentUseCase',
          { details: { code: rpcError.code, sesionId } }
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

      const rpcRow = (rpcData as { status: string; remaining_cents: number; anchor_pedido_id: string | null }[] | null)?.[0];

      if (!rpcRow || rpcRow.status === 'no_orders') {
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

      if (rpcRow.status === 'tenant_mismatch') {
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

      if (rpcRow.status === 'total_mismatch') {
        return {
          success: false,
          error: {
            code: 'TOTAL_MISMATCH',
            message: JSON.stringify({ newTotalCents: rpcRow.remaining_cents }),
            module: 'use-case',
            method: 'initiateRedsysMesaPaymentUseCase',
          },
        };
      }

      amountCents = rpcRow.remaining_cents + propinaCents;
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

    // Note: pago_en_curso is set INSIDE the initiate_mesa_payment_atomic RPC for full payments,
    // ensuring it's committed atomically with the pedidos updates.
    // Division payments don't set this flag: each share is independent, concurrent payers
    // are allowed, and the waiter grid already shows "pagando" via divisionActiva.

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
