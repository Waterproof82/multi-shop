'use client';

import { useRouter } from 'next/navigation';

interface Props {
  readonly sesionId: string | null;
  readonly turnoId: string;
  readonly onRefresh: () => Promise<void>;
  readonly refreshing: boolean;
}

interface ActionButtonProps {
  readonly label: string;
  readonly onClick: () => void;
  readonly disabled?: boolean;
}

function ActionButton({ label, onClick, disabled = false }: ActionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full text-left px-3 py-2.5 rounded-lg text-sm text-[#e8eaf0] hover:bg-[#22263a] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
    >
      {label}
    </button>
  );
}

interface ActionGroupProps {
  readonly title: string;
  readonly children: React.ReactNode;
}

function ActionGroup({ title, children }: ActionGroupProps) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-bold text-[#6b7280] uppercase tracking-wider px-3 pb-1">
        {title}
      </span>
      {children}
    </div>
  );
}

export function AccionesPanel({ sesionId, turnoId, onRefresh, refreshing }: Props) {
  const router = useRouter();
  const hasMesa = sesionId !== null;

  return (
    <aside className="w-[200px] shrink-0 bg-[#1a1d27] border-l border-[#2e3347] flex flex-col">
      <div className="px-4 py-3.5 border-b border-[#2e3347]">
        <span className="text-xs font-bold text-[#6b7280] uppercase tracking-wider">Acciones</span>
      </div>

      <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-5 pt-4">
        <ActionGroup title="Mesa">
          <ActionButton label="Seleccionar mesa" onClick={() => router.push('/tpv/mesas?seleccionar=1')} />
          <ActionButton label={refreshing ? 'Actualizando…' : 'Actualizar estado'} onClick={() => { void onRefresh(); }} disabled={!hasMesa || refreshing} />
          <ActionButton label="Ver ticket completo" onClick={() => { if (sesionId) router.push(`/tpv/cobro/${sesionId}?turnoId=${turnoId}`); }} disabled={!hasMesa} />
        </ActionGroup>

        <ActionGroup title="Historial">
          <ActionButton label="Ver historial" onClick={() => router.push('/tpv/historial')} />
        </ActionGroup>

        <ActionGroup title="Operaciones">
          <ActionButton label="Cierre de turno" onClick={() => router.push('/tpv/turno/cerrar')} />
        </ActionGroup>

        <ActionGroup title="Sistema">
          <ActionButton label="Analítica" onClick={() => router.push('/tpv/analytics')} />
          <ActionButton label="Conformidad legal" onClick={() => router.push('/tpv/legal')} />
        </ActionGroup>
      </div>
    </aside>
  );
}
