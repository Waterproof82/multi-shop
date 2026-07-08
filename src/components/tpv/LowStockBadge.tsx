'use client';

import { useEffect, useState } from 'react';
import type { Ingrediente } from '@/core/domain/entities/stock-types';

interface Props {
  readonly className?: string;
}

interface AlertsResponse {
  alerts: Ingrediente[];
}

function buildLabel(count: number): string {
  if (count === 1) return '⚠ 1 ingrediente bajo mínimo';
  return `⚠ ${count} ingredientes bajo mínimo`;
}

async function fetchAlerts(): Promise<Ingrediente[]> {
  const res = await fetch('/api/tpv/stock/alerts');
  if (!res.ok) return [];
  const json = (await res.json()) as AlertsResponse;
  return json.alerts ?? [];
}

function AlertModal({
  alerts,
  onClose,
}: Readonly<{ alerts: Ingrediente[]; onClose: () => void }>) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <button
        type="button"
        className="absolute inset-0 bg-black/60"
        aria-label="Cerrar"
        onClick={onClose}
      />
      <div className="relative bg-[#1a1d27] border border-[#2e3347] rounded-2xl p-6 w-[380px] max-h-[480px] flex flex-col gap-4 z-10">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-base text-[#f59e0b]">Stock bajo mínimo</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-[#6b7280] hover:text-[#e8eaf0] transition-colors text-lg leading-none"
            aria-label="Cerrar modal"
          >
            ✕
          </button>
        </div>
        <div className="overflow-y-auto flex flex-col gap-2">
          {alerts.map((a) => (
            <div
              key={a.id}
              className="flex items-center justify-between bg-[#22263a] border border-[#2e3347] rounded-xl px-4 py-3"
            >
              <span className="text-sm font-medium text-[#e8eaf0]">{a.nombre}</span>
              <span className="text-xs text-[#f59e0b] font-semibold tabular-nums">
                {a.cantidadActual.toFixed(2)} {a.unidad} / mín {a.umbralAlerta.toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function LowStockBadge({ className }: Props) {
  const [alerts, setAlerts] = useState<Ingrediente[]>([]);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    fetchAlerts()
      .then(setAlerts)
      .catch(() => { /* silent fail — no badge shown */ });

    const id = setInterval(() => {
      fetchAlerts()
        .then(setAlerts)
        .catch(() => { /* silent */ });
    }, 3 * 60 * 1000); // recheck every 3 minutes

    return () => clearInterval(id);
  }, []);

  if (alerts.length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#f59e0b18] border border-[#f59e0b40] text-[#f59e0b] text-xs font-semibold hover:bg-[#f59e0b30] transition-colors ${className ?? ''}`}
      >
        {buildLabel(alerts.length)}
      </button>
      {modalOpen && (
        <AlertModal alerts={alerts} onClose={() => setModalOpen(false)} />
      )}
    </>
  );
}
