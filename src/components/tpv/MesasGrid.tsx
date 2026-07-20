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
    bg: '#f5f3ff',
    border: '1px solid #a78bfa',
    shadow: '0 1px 3px rgba(109,40,217,0.10)',
    icon: '#7c3aed',
    num: '#3b0764',
    name: '#6d28d9',
    dot: '#8b5cf6',
  };
  if (isPaymentInProgress) return {
    bg: '#fffbeb',
    border: '1px solid #fbbf24',
    shadow: '0 1px 3px rgba(217,119,6,0.10)',
    icon: '#d97706',
    num: '#451a03',
    name: '#92400e',
    dot: '#f59e0b',
  };
  if (isOpen) return {
    bg: '#fefce8',
    border: '1px solid #bef264',
    shadow: '0 1px 3px rgba(101,163,13,0.10)',
    icon: '#65a30d',
    num: '#1a2e05',
    name: '#3f6212',
    dot: '#84cc16',
  };
  if (isActive) return {
    bg: '#f0fdf4',
    border: '1px solid #86efac',
    shadow: '0 1px 3px rgba(21,128,61,0.10)',
    icon: '#15803d',
    num: '#052e16',
    name: '#166534',
    dot: '#22c55e',
  };
  return {
    bg: '#ffffff',
    border: '1px solid #e2e8f0',
    shadow: '0 1px 2px rgba(0,0,0,0.04)',
    icon: '#94a3b8',
    num: '#1e293b',
    name: '#64748b',
    dot: '#cbd5e1',
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
      <span className="text-[11px] font-bold tracking-wide uppercase px-2 py-0.5 rounded-full" style={{ background: '#ede9fe', color: '#7c3aed' }}>Pagada</span>
      <span className="text-[10px] font-medium" style={{ color: '#6d28d9' }}>{formatPrice(sessionTotal)}</span>
    </>
  );
  if (isPaymentInProgress) return (
    <>
      <span className="text-[11px] font-bold tracking-wide uppercase px-2 py-0.5 rounded-full" style={{ background: '#fef3c7', color: '#d97706' }}>Pagando</span>
      <span className="text-[10px] font-medium" style={{ color: '#92400e' }}>{formatPrice(sessionTotal)}</span>
    </>
  );
  if (isOpen) {
    const suffix = activeOrderCount === 1 ? '' : 's';
    const totalLabel = sessionTotal > 0 ? ` · ${formatPrice(sessionTotal)}` : '';
    return (
      <>
        <span className="text-[11px] font-bold tracking-wide uppercase px-2 py-0.5 rounded-full" style={{ background: '#ecfccb', color: '#65a30d' }}>Con pedidos</span>
        <span className="text-[10px] font-medium" style={{ color: '#3f6212' }}>{activeOrderCount} pedido{suffix}{totalLabel}</span>
      </>
    );
  }
  if (isActive) return (
    <span className="text-[11px] font-bold tracking-wide uppercase px-2 py-0.5 rounded-full" style={{ background: '#dcfce7', color: '#15803d' }}>Activa</span>
  );
  return (
    <span className="text-[11px] font-bold tracking-wide uppercase px-2 py-0.5 rounded-full" style={{ background: '#f1f5f9', color: '#64748b' }}>Libre</span>
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
          <span className="text-[11px] font-semibold text-center leading-tight" style={{ color: '#7c3aed' }}>
            ¿Cerrar mesa {mesa.numero}?
          </span>
          <button
            type="button"
            onClick={handleConfirmClose}
            disabled={closing}
            className="w-full text-[11px] font-bold py-1 rounded-lg transition-colors disabled:opacity-50"
            style={{ background: '#7c3aed', color: '#ffffff' }}
          >
            {closing ? 'Cerrando…' : 'Confirmar'}
          </button>
          <button
            type="button"
            onClick={handleCancelClose}
            className="w-full text-[11px] font-medium py-1 rounded-lg transition-colors"
            style={{ background: '#f1f5f9', color: '#64748b' }}
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
      <h2 className="text-lg font-bold mb-5 text-[#0f172a]">Mesas</h2>
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
