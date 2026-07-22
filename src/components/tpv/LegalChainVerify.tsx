'use client';

import { useState } from 'react';

type VerifyResult =
  | { ok: true; total: number; checked: number; message?: string }
  | { ok: false; total: number; checked: number; error: string };

function ManifestRow({ label, note }: Readonly<{ label: string; note?: string }>) {
  return (
    <div className="flex items-start gap-1.5">
      <span className="text-[#16a34a] text-xs mt-0.5 shrink-0">✓</span>
      <span className="text-xs text-[#475569]">
        {label}
        {note !== undefined && <span className="text-[#94a3b8] ml-1">({note})</span>}
      </span>
    </div>
  );
}

function buildYearOptions(): { label: string; desde: string; hasta: string }[] {
  const currentYear = new Date().getFullYear();
  const options = [];
  for (let y = currentYear; y >= currentYear - 4; y--) {
    options.push({
      label: String(y),
      desde: `${y}-01-01`,
      hasta: `${y}-12-31`,
    });
  }
  return options;
}

export function LegalChainVerify() {
  const [state, setState] = useState<'idle' | 'loading' | 'done'>('idle');
  const [result, setResult] = useState<VerifyResult | null>(null);

  const currentYear = new Date().getFullYear();
  const [desde, setDesde] = useState(`${currentYear}-01-01`);
  const [hasta, setHasta] = useState(`${currentYear}-12-31`);

  const yearOptions = buildYearOptions();

  function applyYear(desde: string, hasta: string) {
    setDesde(desde);
    setHasta(hasta);
  }

  async function verify() {
    setState('loading');
    try {
      const res = await fetch('/api/tpv/audit/chain');
      const json = (await res.json()) as VerifyResult;
      setResult(json);
      setState('done');
    } catch {
      setResult({ ok: false, total: 0, checked: 0, error: 'Error de conexión al verificar la cadena' });
      setState('done');
    }
  }

  const exportUrl = `/api/tpv/audit/export?desde=${desde}&hasta=${hasta}`;
  const exportAllUrl = '/api/tpv/audit/export';

  return (
    <div className="bg-white border border-[#e2e8f0] rounded-xl p-5 flex flex-col gap-4 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider mb-1">
            Verificación de Integridad
          </p>
          <p className="text-sm text-[#475569]">
            Recorre toda la cadena de cobros y recomputa los hashes SHA-256 para detectar
            cualquier alteración de registros.
          </p>
        </div>
        <button
          type="button"
          onClick={verify}
          disabled={state === 'loading'}
          className="shrink-0 px-4 py-2 rounded-lg bg-[#2563eb] text-white text-sm font-bold hover:bg-[#1d4ed8] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {state === 'loading' ? 'Verificando...' : 'Verificar cadena'}
        </button>
      </div>

      {result !== null && (
        <div
          className="rounded-lg p-4 text-sm flex flex-col gap-1 border"
          style={{
            background: result.ok ? '#f0fdf4' : '#fef2f2',
            borderColor: result.ok ? '#86efac' : '#fca5a5',
          }}
        >
          <p className="font-bold" style={{ color: result.ok ? '#16a34a' : '#ef4444' }}>
            {result.ok ? '✓ Cadena íntegra' : '✗ Integridad comprometida'}
          </p>
          <p className="text-[#64748b]">
            {result.ok
              ? (result.message ?? `${result.checked.toLocaleString('es-ES')} cobros verificados correctamente.`)
              : result.error}
          </p>
          {!result.ok && result.checked > 0 && (
            <p className="text-[#94a3b8] text-xs">
              Verificados {result.checked} de {result.total} registros antes del error.
            </p>
          )}
        </div>
      )}

      {/* Exportación por período — acceso para auditores */}
      <div className="border-t border-[#e2e8f0] pt-4 flex flex-col gap-3">
        <p className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider">
          Exportación de registros
        </p>

        {/* Accesos rápidos por año */}
        <div className="flex flex-wrap gap-2">
          {yearOptions.map(opt => (
            <button
              key={opt.label}
              type="button"
              onClick={() => applyYear(opt.desde, opt.hasta)}
              className={`px-3 py-1 rounded-md text-xs font-semibold border transition-colors ${
                desde === opt.desde && hasta === opt.hasta
                  ? 'bg-[#2563eb] text-white border-[#2563eb]'
                  : 'bg-white text-[#475569] border-[#e2e8f0] hover:border-[#2563eb] hover:text-[#2563eb]'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Rango personalizado */}
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="date"
            value={desde}
            onChange={e => setDesde(e.target.value)}
            className="px-2 py-1 text-xs border border-[#e2e8f0] rounded-md bg-[#f8fafc] text-[#0f172a] focus:outline-none focus:border-[#2563eb]"
          />
          <span className="text-xs text-[#64748b]">hasta</span>
          <input
            type="date"
            value={hasta}
            onChange={e => setHasta(e.target.value)}
            className="px-2 py-1 text-xs border border-[#e2e8f0] rounded-md bg-[#f8fafc] text-[#0f172a] focus:outline-none focus:border-[#2563eb]"
          />
          <a
            href={exportUrl}
            download
            className="px-3 py-1 rounded-md bg-[#2563eb] text-white text-xs font-bold hover:bg-[#1d4ed8] transition-colors"
          >
            Exportar período →
          </a>
        </div>

        <a
          href={exportAllUrl}
          download
          className="text-xs text-[#64748b] hover:text-[#2563eb] hover:underline w-fit"
        >
          Exportar todos los registros (historial completo) →
        </a>

        {/* Manifiesto — contenido del export */}
        <div className="mt-1 rounded-lg border border-[#e2e8f0] bg-[#f8fafc] p-4 flex flex-col gap-3">
          <p className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider">
            Contenido del archivo exportado
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">

            <div className="flex flex-col gap-1.5">
              <p className="text-[10px] font-bold text-[#2563eb] uppercase tracking-wider">Identificación</p>
              <ManifestRow label="Número y serie de ticket" />
              <ManifestRow label="Fecha y hora de cobro" />
              <ManifestRow label="Método de pago (efectivo / tarjeta)" />
              <ManifestRow label="Referencia a ticket rectificado" note="si aplica" />
              <ManifestRow label="NIF y nombre del emisor" />
            </div>

            <div className="flex flex-col gap-1.5">
              <p className="text-[10px] font-bold text-[#2563eb] uppercase tracking-wider">Importes</p>
              <ManifestRow label="Importe total cobrado" />
              <ManifestRow label="Propina" note="si aplica" />
              <ManifestRow label="Descuento aplicado" note="si aplica" />
              <ManifestRow label="Base imponible total" />
              <ManifestRow label="Cuota IVA / IGIC total" />
            </div>

            <div className="flex flex-col gap-1.5">
              <p className="text-[10px] font-bold text-[#2563eb] uppercase tracking-wider">Fiscalidad (RD 1619/2012)</p>
              <ManifestRow label="Desglose por tipo impositivo" note="10%, 21%, etc." />
              <ManifestRow label="Base imponible por bracket" />
              <ManifestRow label="Cuota IVA/IGIC por bracket" />
            </div>

            <div className="flex flex-col gap-1.5">
              <p className="text-[10px] font-bold text-[#2563eb] uppercase tracking-wider">Líneas de venta</p>
              <ManifestRow label="Nombre del producto" />
              <ManifestRow label="Cantidad y precio unitario" />
              <ManifestRow label="Tipo impositivo por línea" />
            </div>

            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <p className="text-[10px] font-bold text-[#2563eb] uppercase tracking-wider">Integridad (Verifactu / RD 1007/2023)</p>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                <ManifestRow label="Hash SHA-256 del registro" />
                <ManifestRow label="Hash del registro anterior (encadenamiento)" />
              </div>
            </div>

          </div>
          <p className="text-[10px] text-[#94a3b8] border-t border-[#e2e8f0] pt-2 mt-1">
            Formato JSON · Normativa: RD 1619/2012 · Ley 11/2021 · RD 1007/2023
          </p>
        </div>
      </div>
    </div>
  );
}
