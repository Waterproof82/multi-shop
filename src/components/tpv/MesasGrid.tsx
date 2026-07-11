'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { UtensilsCrossed } from 'lucide-react';
import { formatPrice } from '@/lib/format-price';
import { fetchWithCsrf } from '@/lib/csrf-client';
import { useTpvCatalog } from '@/lib/tpv-catalog-ctx';
import type { MesaWithSession } from '@/core/domain/repositories/IMesaRepository';

interface Props {
  modo?: 'cobrar' | 'seleccionar';
}

interface MesaColors {
  bg: string;
  border: string;
  shadow: string;
  icon: string;
  num: string;
  name: string;
  dot: string;
}

function getMesaColors(isPaid: boolean, isPaymentInProgress: boolean, isOpen: boolean, isActive: boolean): MesaColors {
  if (isPaid) return {
    bg: 'oklch(20% 0.06 290 / 0.7)',
    border: '1px solid oklch(55% 0.18 290 / 0.5)',
    shadow: '0 0 18px oklch(55% 0.18 290 / 0.15), inset 0 1px 0 oklch(70% 0.15 290 / 0.1)',
    icon: 'oklch(65% 0.16 290)',
    num: 'oklch(92% 0.04 290)',
    name: 'oklch(60% 0.10 290)',
    dot: 'oklch(70% 0.19 290)',
  };
  if (isPaymentInProgress) return {
    bg: 'oklch(20% 0.06 62 / 0.7)',
    border: '1px solid oklch(55% 0.18 62 / 0.5)',
    shadow: '0 0 18px oklch(55% 0.18 62 / 0.15), inset 0 1px 0 oklch(70% 0.15 62 / 0.1)',
    icon: 'oklch(65% 0.16 62)',
    num: 'oklch(92% 0.04 62)',
    name: 'oklch(60% 0.10 62)',
    dot: 'oklch(70% 0.19 62)',
  };
  if (isOpen) return {
    bg: 'oklch(20% 0.06 95 / 0.7)',
    border: '1px solid oklch(55% 0.18 95 / 0.5)',
    shadow: '0 0 18px oklch(55% 0.18 95 / 0.15), inset 0 1px 0 oklch(70% 0.15 95 / 0.1)',
    icon: 'oklch(65% 0.16 95)',
    num: 'oklch(92% 0.04 95)',
    name: 'oklch(60% 0.10 95)',
    dot: 'oklch(70% 0.19 95)',
  };
  if (isActive) return {
    bg: 'oklch(20% 0.06 148 / 0.7)',
    border: '1px solid oklch(55% 0.18 148 / 0.5)',
    shadow: '0 0 18px oklch(55% 0.18 148 / 0.15), inset 0 1px 0 oklch(70% 0.15 148 / 0.1)',
    icon: 'oklch(65% 0.16 148)',
    num: 'oklch(92% 0.04 148)',
    name: 'oklch(60% 0.10 148)',
    dot: 'oklch(70% 0.19 148)',
  };
  return {
    bg: 'oklch(20% 0.025 252 / 0.7)',
    border: '1px solid oklch(35% 0.04 252 / 0.6)',
    shadow: 'inset 0 1px 0 oklch(100% 0 0 / 0.04)',
    icon: 'oklch(42% 0.06 252)',
    num: 'oklch(80% 0.03 252)',
    name: 'oklch(48% 0.05 252)',
    dot: 'oklch(38% 0.04 252)',
  };
}

function MesaDot({ pulsing, dotColor }: Readonly<{ pulsing: boolean; dotColor: string }>) {
  if (pulsing) {
    return (
      <span className="relative flex h-2.5 w-2.5">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60" style={{ backgroundColor: dotColor }} />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full" style={{ backgroundColor: dotColor }} />
      </span>
    );
  }
  return <span className="block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: dotColor }} />;
}

interface FooterProps {
  isPaid: boolean;
  isPaymentInProgress: boolean;
  isOpen: boolean;
  isActive: boolean;
  sessionTotal: number;
  activeOrderCount: number;
}

function MesaFooter({ isPaid, isPaymentInProgress, isOpen, isActive, sessionTotal, activeOrderCount }: Readonly<FooterProps>) {
  if (isPaid) return (
    <>
      <span className="text-[11px] font-bold tracking-wide uppercase px-2 py-0.5 rounded-full" style={{ background: 'oklch(28% 0.10 290 / 0.6)', color: 'oklch(82% 0.18 290)' }}>Pagada</span>
      <span className="text-[10px] font-medium" style={{ color: 'oklch(58% 0.10 290)' }}>{formatPrice(sessionTotal)}</span>
    </>
  );
  if (isPaymentInProgress) return (
    <>
      <span className="text-[11px] font-bold tracking-wide uppercase px-2 py-0.5 rounded-full" style={{ background: 'oklch(30% 0.10 62 / 0.6)', color: 'oklch(82% 0.18 62)' }}>Pagando</span>
      <span className="text-[10px] font-medium" style={{ color: 'oklch(58% 0.10 62)' }}>{formatPrice(sessionTotal)}</span>
    </>
  );
  if (isOpen) {
    const suffix = activeOrderCount === 1 ? '' : 's';
    const totalLabel = sessionTotal > 0 ? ` · ${formatPrice(sessionTotal)}` : '';
    return (
      <>
        <span className="text-[11px] font-bold tracking-wide uppercase px-2 py-0.5 rounded-full" style={{ background: 'oklch(30% 0.10 95 / 0.6)', color: 'oklch(82% 0.18 95)' }}>Con pedidos</span>
        <span className="text-[10px] font-medium" style={{ color: 'oklch(58% 0.10 95)' }}>{activeOrderCount} pedido{suffix}{totalLabel}</span>
      </>
    );
  }
  if (isActive) return (
    <span className="text-[11px] font-bold tracking-wide uppercase px-2 py-0.5 rounded-full" style={{ background: 'oklch(28% 0.10 148 / 0.6)', color: 'oklch(82% 0.18 148)' }}>Activa</span>
  );
  return (
    <span className="text-[11px] font-bold tracking-wide uppercase px-2 py-0.5 rounded-full" style={{ background: 'oklch(24% 0.03 252 / 0.7)', color: 'oklch(62% 0.05 252)' }}>Libre</span>
  );
}

async function cerrarMesaPagada(mesaId: string): Promise<boolean> {
  const res = await fetchWithCsrf(`/api/tpv/mesas/${mesaId}/cerrar`, { method: 'POST' });
  return res.ok;
}

function TpvMesaCard({ mesa, turnoId, modo }: Readonly<{ mesa: MesaWithSession; turnoId: string | null; modo: 'cobrar' | 'seleccionar' }>) {
  const router = useRouter();
  const [confirmingClose, setConfirmingClose] = useState(false);
  const [closing, setClosing] = useState(false);

  const isPaid = mesa.sesionPagada;
  const isPaymentInProgress = (mesa.pagoEnCurso || mesa.divisionActiva) && !mesa.sesionPagada;
  const isOpen = !!mesa.sesionId && mesa.activeOrderCount > 0 && !isPaid && !isPaymentInProgress;
  const isActive = !!mesa.sesionId && mesa.clienteActivo && mesa.activeOrderCount === 0 && !isPaid && !isPaymentInProgress;
  const colors = getMesaColors(isPaid, isPaymentInProgress, isOpen, isActive);
  const pulsing = !isPaid && (isPaymentInProgress || isOpen || isActive);

  const canInteract = isPaid || modo === 'seleccionar' || !!turnoId;

  function handleClick() {
    if (!canInteract) return;
    if (isPaid) {
      setConfirmingClose(true);
      return;
    }
    if (modo === 'seleccionar') {
      const params = new URLSearchParams({ mesaId: mesa.id, mesaNumero: String(mesa.numero) });
      if (mesa.sesionId) params.set('sesionId', mesa.sesionId);
      router.push(`/tpv/mostrador?${params.toString()}`);
    } else if (mesa.sesionId && turnoId) {
      router.push(`/tpv/cobro/${mesa.sesionId}?turnoId=${turnoId}`);
    } else if (turnoId) {
      // Mesa sin sesión activa: abrir mostrador para crear una nueva sesión
      const params = new URLSearchParams({ mesaId: mesa.id, mesaNumero: String(mesa.numero) });
      router.push(`/tpv/mostrador?${params.toString()}`);
    }
  }

  async function handleConfirmClose() {
    setClosing(true);
    const ok = await cerrarMesaPagada(mesa.id);
    setClosing(false);
    setConfirmingClose(false);
    if (ok) router.refresh();
  }

  function handleCancelClose() {
    setConfirmingClose(false);
  }

  if (confirmingClose) {
    return (
      <div
        className="relative flex flex-col items-center justify-between rounded-2xl p-4 w-full"
        style={{ minHeight: '128px', background: colors.bg, border: colors.border, boxShadow: colors.shadow }}
      >
        <div className="absolute top-3 right-3">
          <MesaDot pulsing={false} dotColor={colors.dot} />
        </div>
        <div className="flex flex-col items-center justify-center gap-2 flex-1 w-full">
          <span className="text-[11px] font-semibold text-center leading-tight" style={{ color: 'oklch(82% 0.18 290)' }}>
            ¿Cerrar mesa {mesa.numero}?
          </span>
          <button
            type="button"
            onClick={handleConfirmClose}
            disabled={closing}
            className="w-full text-[11px] font-bold py-1 rounded-lg transition-colors disabled:opacity-50"
            style={{ background: 'oklch(35% 0.16 290 / 0.8)', color: 'oklch(90% 0.12 290)' }}
          >
            {closing ? 'Cerrando…' : 'Confirmar'}
          </button>
          <button
            type="button"
            onClick={handleCancelClose}
            className="w-full text-[11px] font-medium py-1 rounded-lg transition-colors"
            style={{ background: 'oklch(25% 0.04 252 / 0.6)', color: 'oklch(60% 0.05 252)' }}
          >
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={!canInteract}
      aria-label={mesa.nombre ? `Mesa ${mesa.numero} — ${mesa.nombre}` : `Mesa ${mesa.numero}`}
      className="relative flex flex-col items-center justify-between rounded-2xl p-4 transition-all duration-200 hover:scale-[1.04] active:scale-[0.97] focus-visible:outline-none disabled:opacity-50 disabled:cursor-default w-full"
      style={{ minHeight: '128px', background: colors.bg, border: colors.border, boxShadow: colors.shadow }}
    >
      <div className="absolute top-3 right-3">
        <MesaDot pulsing={pulsing} dotColor={colors.dot} />
      </div>

      <div className="flex flex-col items-center gap-1 flex-1 justify-center">
        <UtensilsCrossed className="w-5 h-5 mb-1" style={{ color: colors.icon }} />
        <span className="text-3xl font-black leading-none tracking-tight" style={{ color: colors.num }}>
          {mesa.numero}
        </span>
        {mesa.nombre && (
          <span className="text-[10px] font-medium truncate max-w-full mt-0.5" style={{ color: colors.name }}>
            {mesa.nombre}
          </span>
        )}
      </div>

      <div className="w-full mt-2 min-h-[24px] flex flex-col items-center gap-0.5">
        <MesaFooter
          isPaid={isPaid}
          isPaymentInProgress={isPaymentInProgress}
          isOpen={isOpen}
          isActive={isActive}
          sessionTotal={mesa.sessionTotal}
          activeOrderCount={mesa.activeOrderCount}
        />
      </div>
    </button>
  );
}

export function MesasGrid({ modo }: Readonly<Props>) {
  const { mesas, turno } = useTpvCatalog();
  const turnoId = turno?.id ?? null;
  return (
    <div className="flex-1 overflow-auto p-6">
      <h2 className="text-lg font-bold mb-5 text-[#e8eaf0]">Mesas</h2>
      {mesas.length === 0 && (
        <p className="text-[#6b7280] text-sm">No hay mesas configuradas.</p>
      )}
      <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {mesas.map((mesa) => (
          <TpvMesaCard key={mesa.id} mesa={mesa} turnoId={turnoId} modo={modo ?? 'cobrar'} />
        ))}
      </div>
    </div>
  );
}
