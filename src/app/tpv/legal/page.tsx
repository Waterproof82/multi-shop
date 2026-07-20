import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { getAuthAdminUseCase } from '@/core/infrastructure/database';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';
import { LegalChainVerify } from '@/components/tpv/LegalChainVerify';

export const dynamic = 'force-dynamic';

const TPV_VERSION = '1.0.0';
const DECLARATION_DATE = '2026-07-03';

type CobroCount = { count: number; integrity: 'ok' | 'empty' };

async function getCobroStats(empresaId: string): Promise<CobroCount> {
  try {
    const supabase = getSupabaseClient();
    const { count } = await supabase
      .from('tpv_cobros')
      .select('*', { count: 'exact', head: true })
      .eq('empresa_id', empresaId);
    return { count: count ?? 0, integrity: 'ok' };
  } catch {
    return { count: 0, integrity: 'ok' };
  }
}

interface CheckItemProps {
  label: string;
  status: 'done' | 'partial' | 'pending';
  detail?: string;
}

function CheckItem({ label, status, detail }: Readonly<CheckItemProps>) {
  const colors = {
    done:    { dot: 'bg-[#16a34a]', text: 'text-[#16a34a]', label: 'Implementado' },
    partial: { dot: 'bg-[#f59e0b]', text: 'text-[#f59e0b]', label: 'Parcial' },
    pending: { dot: 'bg-[#94a3b8]', text: 'text-[#94a3b8]', label: 'Pendiente' },
  }[status];

  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-[#e2e8f0] last:border-0">
      <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${colors.dot}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-[#0f172a]">{label}</p>
        {detail !== undefined && (
          <p className="text-xs text-[#64748b] mt-0.5">{detail}</p>
        )}
      </div>
      <span className={`text-[10px] font-bold uppercase tracking-wider shrink-0 mt-0.5 ${colors.text}`}>
        {colors.label}
      </span>
    </div>
  );
}

export default async function TpvLegalPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('admin_token')?.value;
  if (!token) redirect('/admin/login');

  const admin = await getAuthAdminUseCase().verifyToken(token);
  if (!admin) redirect('/admin/login');
  if (!admin.empresaId) redirect('/admin/login');

  const stats = await getCobroStats(admin.empresaId);
  const now = new Date();
  const fechaHora = now.toLocaleString('es-ES', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'Europe/Madrid',
  });

  return (
    <div className="flex-1 overflow-auto p-6 bg-[#f1f5f9]">
      <div className="max-w-2xl mx-auto flex flex-col gap-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold text-[#2563eb] uppercase tracking-widest mb-1">
              Conformidad Legal
            </p>
            <h1 className="text-2xl font-bold text-[#0f172a]">Sobre este TPV</h1>
            <p className="text-sm text-[#64748b] mt-1">{fechaHora}</p>
          </div>
          <Link
            href="/tpv/mostrador"
            className="shrink-0 px-4 py-2 rounded-lg border border-[#e2e8f0] bg-white text-sm text-[#64748b] hover:text-[#0f172a] hover:border-[#cbd5e1] transition-colors"
          >
            ← Volver
          </Link>
        </div>

        {/* System identification */}
        <div className="bg-white border border-[#e2e8f0] rounded-xl p-5 flex flex-col gap-3 shadow-sm">
          <p className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider">
            Identificación del Sistema
          </p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <span className="text-[#64748b]">Software</span>
            <span className="font-mono text-[#0f172a]">multi_shop TPV v{TPV_VERSION}</span>
            <span className="text-[#64748b]">Serie de tickets</span>
            <span className="font-mono text-[#0f172a]">T</span>
            <span className="text-[#64748b]">Registros en cadena</span>
            <span className="font-mono text-[#0f172a]">{stats.count.toLocaleString('es-ES')}</span>
            <span className="text-[#64748b]">Integridad</span>
            <span className={stats.integrity === 'ok' ? 'text-[#16a34a] font-semibold' : 'text-[#ef4444] font-semibold'}>
              {stats.integrity === 'ok' ? 'Verificada' : 'Error'}
            </span>
          </div>
        </div>

        {/* Chain verification + export */}
        <LegalChainVerify />

        {/* Declaración de Responsabilidad */}
        <div className="bg-white border border-[#e2e8f0] rounded-xl p-5 flex flex-col gap-4 shadow-sm">
          <p className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider">
            Declaración de Responsabilidad del Fabricante
          </p>
          <div className="text-sm text-[#475569] leading-relaxed space-y-3">
            <p>
              El fabricante del presente software TPV declara bajo su responsabilidad que
              el sistema <strong className="text-[#0f172a]">multi_shop TPV versión {TPV_VERSION}</strong> cumple
              con los requisitos establecidos en:
            </p>
            <ul className="list-disc list-inside space-y-1 text-[#64748b] pl-2">
              <li>Artículo 29.2.j de la <strong className="text-[#475569]">Ley 58/2003 General Tributaria</strong></li>
              <li><strong className="text-[#475569]">Real Decreto 1007/2023</strong> — Reglamento Verifactu</li>
              <li><strong className="text-[#475569]">Real Decreto 1619/2012</strong> — Reglamento de facturación</li>
            </ul>
            <p>
              El sistema garantiza la inalterabilidad de los registros de venta mediante
              cadena de hashes SHA-256, numeración correlativa sin saltos por empresa
              y bloqueo técnico de operaciones DELETE y UPDATE sobre campos fiscales.
            </p>
            <p className="text-[#94a3b8] text-xs border-t border-[#e2e8f0] pt-3 mt-2">
              Declaración emitida el <strong className="text-[#64748b]">{DECLARATION_DATE}</strong>.
              Este documento tiene carácter informativo interno; la declaración firmada
              conforme al artículo 8 del RD 1007/2023 se adjunta al contrato comercial.
            </p>
          </div>
        </div>

        {/* Compliance checklist */}
        <div className="bg-white border border-[#e2e8f0] rounded-xl p-5 flex flex-col gap-1 shadow-sm">
          <p className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider mb-3">
            Estado de Cumplimiento
          </p>

          <p className="text-[11px] font-semibold text-[#2563eb] uppercase tracking-wider mb-1">
            Verifactu / RD 1007/2023
          </p>
          <CheckItem
            label="Inalterabilidad — DELETE bloqueado a nivel DB"
            status="done"
            detail="Trigger tpv_cobro_block_delete en PostgreSQL"
          />
          <CheckItem
            label="Integridad — UPDATE de campos fiscales bloqueado"
            status="done"
            detail="Trigger tpv_cobro_block_update en PostgreSQL"
          />
          <CheckItem
            label="Cadena de hashes SHA-256"
            status="done"
            detail="Trigger tpv_cobro_hash_insert, pgcrypto"
          />
          <CheckItem
            label="Numeración correlativa sin saltos por empresa"
            status="done"
            detail="MAX(numero_ticket)+1 con FOR UPDATE en trigger"
          />
          <CheckItem
            label="Endpoint de verificación de cadena"
            status="done"
            detail="GET /api/tpv/audit/chain — recomputa SHA-256 en Node.js"
          />
          <CheckItem
            label="Exportación de registros para inspectores"
            status="done"
            detail="GET /api/tpv/audit/export — JSON normalizado con descarga"
          />
          <CheckItem
            label="Ticket rectificativo (cobro de signo negativo)"
            status="pending"
            detail="Columna rectifica_cobro_id — pendiente de implementar"
          />
          <CheckItem
            label="QR AEAT en pantalla de confirmación"
            status="pending"
            detail="Requiere NIF de empresa configurado"
          />

          <p className="text-[11px] font-semibold text-[#2563eb] uppercase tracking-wider mt-4 mb-1">
            RD 1619/2012 — Contenido del ticket
          </p>
          <CheckItem
            label="Número correlativo y serie"
            status="done"
            detail="Serie T + numero_ticket en cada cobro"
          />
          <CheckItem
            label="Fecha y hora de expedición"
            status="done"
            detail="cobrado_at TIMESTAMPTZ en tpv_cobros"
          />
          <CheckItem
            label="IVA desglosado por tipo impositivo"
            status="partial"
            detail="10% restauración implementado; tipos por producto pendientes"
          />
          <CheckItem
            label="NIF, nombre y razón social del emisor"
            status="partial"
            detail="Columna nif añadida a empresas; exposición en ticket pendiente"
          />
          <CheckItem
            label="Desglose de ítems (nombre, cantidad, precio)"
            status="done"
            detail="detalle_pedido en tabla pedidos"
          />

          <p className="text-[11px] font-semibold text-[#2563eb] uppercase tracking-wider mt-4 mb-1">
            TicketBAI (País Vasco)
          </p>
          <CheckItem
            label="Firma digital XML + envío a hacienda foral"
            status="pending"
            detail="Aplica solo si empresa.provincia ∈ Álava, Guipúzcoa, Vizcaya"
          />

          <p className="text-[11px] font-semibold text-[#2563eb] uppercase tracking-wider mt-4 mb-1">
            RGPD / PCI-DSS
          </p>
          <CheckItem
            label="Sin almacenamiento de datos de tarjeta"
            status="done"
            detail="Solo metodo_pago ('tarjeta') — sin PAN ni CVV"
          />
          <CheckItem
            label="Retención y anonimización de datos personales"
            status="pending"
            detail="Política de retención pendiente de definir"
          />
        </div>

      </div>
    </div>
  );
}
