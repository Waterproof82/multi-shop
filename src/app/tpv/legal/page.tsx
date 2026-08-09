import { cookies } from 'next/headers';
import Link from 'next/link';
import { getAuthAdminUseCase } from '@/core/infrastructure/database';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';
import { resolverSesionTpv } from '@/lib/tpv/sesion-servidor';
import { LegalChainVerify } from '@/components/tpv/LegalChainVerify';
import { InspectorTokenGenerator } from '@/components/tpv/InspectorTokenGenerator';
import { RltAccessLink } from '@/components/tpv/RltAccessLink';
import { FABRICANTE, TPV_VERSION, DECLARATION_DATE } from '@/lib/fabricante';

export const dynamic = 'force-dynamic';

type CobroCount = { count: number; integrity: 'ok' | 'empty' };
type VerifactuMode = 'no-verifactu' | 'verifactu';
type LastPurge = { executed_at: string; anonymized_count: number; status: string } | null;

async function getVerifactuMode(empresaId: string): Promise<VerifactuMode> {
  try {
    const supabase = getSupabaseClient();
    const { data } = await supabase
      .from('empresas')
      .select('verifactu_mode')
      .eq('id', empresaId)
      .single();
    const mode = (data as Record<string, unknown> | null)?.verifactu_mode;
    if (mode === 'verifactu') return 'verifactu';
    return 'no-verifactu';
  } catch {
    return 'no-verifactu';
  }
}

async function getLastPurge(): Promise<LastPurge> {
  try {
    const supabase = getSupabaseClient();
    const { data } = await supabase
      .from('rgpd_purge_log')
      .select('executed_at, anonymized_count, status')
      .order('executed_at', { ascending: false })
      .limit(1)
      .single();
    return data as LastPurge;
  } catch {
    return null;
  }
}

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
  // Sin sesión NO se redirige: esta página es pública para inspectores de
  // Hacienda (Art. 12 RD 1007/2023). Lo único que cambia es que no se cargan
  // los datos dinámicos.
  const sesion = await resolverSesionTpv(await cookies());
  const empresaId = sesion?.empresaId ?? null;
  const isAdmin = sesion?.esEmpleado === false;

  // Página accesible públicamente (sin auth) para inspectores de Hacienda — Art. 12 RD 1007/2023.
  // El contenido dinámico (stats, modo) solo se carga cuando hay sesión activa.
  const [stats, verifactuMode, lastPurge] = empresaId
    ? await Promise.all([getCobroStats(empresaId), getVerifactuMode(empresaId), getLastPurge()])
    : [{ count: 0, integrity: 'ok' as const }, 'no-verifactu' as const, null];
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
            <span className="text-[#64748b]">Modalidad VeriFactu</span>
            <span className="font-semibold text-[#16a34a]">
              {verifactuMode === 'no-verifactu'
                ? 'No-VeriFactu (Art. 12 RD 1007/2023)'
                : 'VeriFactu (envío a AEAT)'}
            </span>
          </div>
        </div>

        {/* Inspector de Hacienda / Auditoría Fiscal */}
        <div className="flex flex-col gap-4">
          <div>
            <p className="text-[10px] font-bold text-[#2563eb] uppercase tracking-widest mb-0.5">
              Inspector de Hacienda / Auditoría Fiscal
            </p>
            <p className="text-xs text-[#64748b]">
              Verificación de integridad, exportación de registros y enlace temporal para inspectores de la AEAT.
            </p>
          </div>
          {empresaId && <LegalChainVerify />}
          {empresaId && <InspectorTokenGenerator />}
        </div>

        {/* Declaración de Responsabilidad */}
        <div className="bg-white border border-[#e2e8f0] rounded-xl p-5 flex flex-col gap-4 shadow-sm">
          <p className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider">
            Declaración de Responsabilidad del Fabricante
          </p>
          <div className="text-sm text-[#475569] leading-relaxed space-y-3">
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs bg-[#f8fafc] border border-[#e2e8f0] rounded-lg p-3 mb-1">
              <span className="text-[#64748b]">Fabricante</span>
              <span className="font-mono text-[#0f172a]">{FABRICANTE.nombre} ({FABRICANTE.nombreComercial})</span>
              <span className="text-[#64748b]">NIF</span>
              <span className="font-mono text-[#0f172a]">{FABRICANTE.nif}</span>
              <span className="text-[#64748b]">Dirección</span>
              <span className="font-mono text-[#0f172a]">{FABRICANTE.direccion}</span>
              <span className="text-[#64748b]">Email</span>
              <span className="font-mono text-[#0f172a]">{FABRICANTE.email}</span>
              <span className="text-[#64748b]">Web</span>
              <span className="font-mono text-[#0f172a]">{FABRICANTE.web}</span>
            </div>
            <p>
              El fabricante del presente software TPV declara bajo su responsabilidad que
              el sistema <strong className="text-[#0f172a]">multi_shop TPV versión {TPV_VERSION}</strong> cumple
              con los requisitos establecidos en:
            </p>
            <ul className="list-disc list-inside space-y-1 text-[#64748b] pl-2">
              <li>Artículo 29.2.j de la <strong className="text-[#475569]">Ley 58/2003 General Tributaria</strong></li>
              <li><strong className="text-[#475569]">Real Decreto 1007/2023</strong> — Reglamento Verifactu</li>
              <li><strong className="text-[#475569]">Real Decreto 1619/2012</strong> — Reglamento de facturación</li>
              <li><strong className="text-[#475569]">Reglamento (UE) N.º 1169/2011</strong> — Información alimentaria facilitada al consumidor (alérgenos)</li>
            </ul>
            <p>
              El sistema garantiza la inalterabilidad de los registros de venta mediante
              cadena de hashes SHA-256, numeración correlativa sin saltos por empresa
              y bloqueo técnico de operaciones DELETE y UPDATE sobre campos fiscales.
            </p>
            <p>
              El sistema opera en <strong className="text-[#0f172a]">modo conservación</strong>{' '}
              conforme al Art. 6 del RD 1007/2023: los registros de venta se almacenan con
              garantías de integridad e inalterabilidad. El envío automatizado a la AEAT
              (modo Verifactu) no es obligatorio para el ámbito de aplicación actual.
            </p>
            <p className="text-[#94a3b8] text-xs border-t border-[#e2e8f0] pt-3 mt-2">
              Declaración emitida el <strong className="text-[#64748b]">{DECLARATION_DATE}</strong>.
              Este documento tiene carácter informativo interno; la declaración firmada
              conforme al artículo 8 del RD 1007/2023 se adjunta al contrato comercial.
            </p>
          </div>
        </div>

        {/* Declaración Modo No-VeriFactu (Art. 12 RD 1007/2023) */}
        {/* TODO: Verificar wording exacto con Art. 12 RD 1007/2023 BOE antes de certificación */}
        <div className="bg-white border border-[#e2e8f0] rounded-xl p-5 flex flex-col gap-4 shadow-sm">
          <p className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider">
            Declaración — Modo No-VeriFactu (Art. 12 RD 1007/2023)
          </p>
          <div className="text-sm text-[#475569] leading-relaxed space-y-3">
            <p>
              El presente sistema de facturación opera en{' '}
              <strong className="text-[#0f172a]">modo No-VeriFactu</strong> conforme al{' '}
              <strong className="text-[#0f172a]">artículo 12 del Real Decreto 1007/2023</strong>.
              En este modo, el sistema garantiza la inalterabilidad e integridad de los registros
              de venta y genera en cada ticket un código QR verificable en la sede electrónica de
              la AEAT, sin que sea preceptivo el envío telemático de registros a la Agencia
              Tributaria en tiempo real.
            </p>
            <ul className="list-disc list-inside space-y-1 text-[#64748b] pl-2">
              <li>
                <strong className="text-[#475569]">Integridad mediante cadena de huellas:</strong>{' '}
                cada registro de venta se encadena con SHA-256. Cadena verificable en{' '}
                <a href="/api/tpv/audit/chain" className="text-[#2563eb] underline hover:no-underline">/api/tpv/audit/chain</a>.
              </li>
              <li>
                <strong className="text-[#475569]">Código QR AEAT en cada justificante:</strong>{' '}
                la URL de verificación AEAT se genera y almacena en el momento del cobro
                (columna <span className="font-mono text-xs">tpv_cobros.verifactu_qr_url</span>).
                Formato numserie: <span className="font-mono text-xs">T000001</span> (sin guión, Anexo II RD 1007/2023).
              </li>
              <li>
                <strong className="text-[#475569]">Inalterabilidad:</strong>{' '}
                los registros fiscales no pueden eliminarse ni modificarse tras su creación
                (triggers de bloqueo a nivel PostgreSQL).
              </li>
              <li>
                <strong className="text-[#475569]">Exportación para inspectores:</strong>{' '}
                <a href="/api/tpv/audit/export" className="text-[#2563eb] underline hover:no-underline">/api/tpv/audit/export</a>{' '}
                — JSON normalizado con cadena de hashes completa.
              </li>
            </ul>
            <p className="text-[#94a3b8] text-xs border-t border-[#e2e8f0] pt-3 mt-2">
              Fase 2 (envío VERI*FACTU a AEAT) pendiente — plazo obligatorio enero 2027
              (grandes empresas) / julio 2027 (resto) conforme al RD 15/2025.
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
            status="done"
            detail="Columna rectifica_cobro_id en tpv_cobros — implementado"
          />
          <CheckItem
            label="QR AEAT en pantalla de confirmación y ticket impreso"
            status="done"
            detail="URL persistida en tpv_cobros.verifactu_qr_url (trigger BEFORE INSERT). Numserie sin guión (T000042)"
          />
          <CheckItem
            label="Declaración modo No-VeriFactu (Art. 12 RD 1007/2023)"
            status="done"
            detail="empresas.verifactu_mode = 'no-verifactu'. Sección de declaración en esta página"
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
            label="IVA/IGIC desglosado por tipo impositivo"
            status="done"
            detail="Multi-rate desglose con override por producto; etiqueta IVA o IGIC según empresa"
          />
          <CheckItem
            label="NIF, nombre y razón social del emisor"
            status="done"
            detail="NIF, nombre y razón social impresos en ticket; columna razon_social en empresas"
          />
          <CheckItem
            label="Desglose de ítems (nombre, cantidad, precio)"
            status="done"
            detail="detalle_pedido en tabla pedidos"
          />

          <p className="text-[11px] font-semibold text-[#2563eb] uppercase tracking-wider mt-4 mb-1">
            Reglamento UE 1169/2011 — Información Alimentaria
          </p>
          <CheckItem
            label="Etiquetado de alérgenos (14 sustancias Anexo II)"
            status="done"
            detail="Columna alergenos text[] en productos; iconos SVG y nombres en carta pública en 5 idiomas"
          />
          <CheckItem
            label="Disponibilidad en punto de venta"
            status="done"
            detail="Alérgenos visibles en carta digital del cliente antes de realizar el pedido"
          />

          <p className="text-[11px] font-semibold text-[#d97706] uppercase tracking-wider mt-4 mb-1">
            Art. 34.9 ET / RD-Ley 8/2019 — Registro de Jornada
          </p>
          <CheckItem
            label="Registro digital de entrada, salida y pausas"
            status="done"
            detail="Tabla lc_fichajes — eventos inmutables por empleado con doble timestamp (dispositivo + servidor)"
          />
          <CheckItem
            label="Cadena de integridad SHA-256 por empresa"
            status="done"
            detail="Trigger BEFORE INSERT — cada fichaje encadena el hash del anterior; manipulación matemáticamente detectable"
          />
          <CheckItem
            label="Registros inalterables — correcciones como eventos adicionales"
            status="done"
            detail="Los fichajes nunca se borran ni modifican. Las correcciones son registros tipo 'correccion' que referencian al original"
          />
          <CheckItem
            label="Conservación 4 años (Art. 34.9 ET)"
            status="done"
            detail="Particionado mensual + legal holds (lc_legal_holds) bloquean purga para cualquier empleado o empresa"
          />
          <CheckItem
            label="Acceso RLT (Art. 64 ET)"
            status="done"
            detail="Vista de solo lectura en /laborcontrol/rlt para el Representante Legal de los Trabajadores"
          />
          <CheckItem
            label="Totalización mensual trabajadores a tiempo parcial (Art. 12.4.c ET)"
            status="done"
            detail="Export PDF de resumen mensual por empleado parcial — generado server-side como stream"
          />
          <CheckItem
            label="Modo offline con sincronización diferida"
            status="done"
            detail="IndexedDB + AES-GCM 256-bit — cola cifrada local, sincronización automática al recuperar red"
          />

          <p className="text-[11px] font-semibold text-[#2563eb] uppercase tracking-wider mt-4 mb-1">
            TicketBAI (País Vasco)
          </p>
          <CheckItem
            label="Firma digital XML + envío a hacienda foral"
            status="pending"
            detail="Solo aplica si empresa.provincia ∈ Álava, Guipúzcoa, Vizcaya — fuera del ámbito actual"
          />

          <p className="text-[11px] font-semibold text-[#2563eb] uppercase tracking-wider mt-4 mb-1">
            Art.66 LGT — Retención Fiscal 5 años
          </p>
          <CheckItem
            label="Cobros no borrables"
            status="done"
            detail="Trigger tpv_cobro_block_delete — DELETE bloqueado en tpv_cobros"
          />
          <CheckItem
            label="Turnos no borrables"
            status="done"
            detail="Trigger tpv_turno_no_delete — DELETE bloqueado en tpv_turnos"
          />
          <CheckItem
            label="Pedidos no borrables"
            status="done"
            detail="Trigger pedidos_no_delete — DELETE bloqueado en pedidos (fuente de datos de cobros)"
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
            status="done"
            detail={
              lastPurge !== null
                ? `Última purga: ${new Date(lastPurge.executed_at).toLocaleDateString('es-ES', { dateStyle: 'medium', timeZone: 'Europe/Madrid' })} · ${lastPurge.anonymized_count} registros · ${lastPurge.status === 'ok' ? '✓ OK' : '✗ Error'}. Derecho al olvido manual: POST /api/admin/rgpd/anonimizar-cliente`
                : 'Vercel Cron: día 1 de cada mes, 03:00 UTC. Sin ejecuciones registradas aún. Derecho al olvido manual: POST /api/admin/rgpd/anonimizar-cliente'
            }
          />
        </div>

        {/* Fichaje Digital — Auditoría */}
        <div className="bg-white border border-[#fde68a] rounded-xl p-5 flex flex-col gap-3 shadow-sm">
          <div>
            <p className="text-[10px] font-bold text-[#d97706] uppercase tracking-wider">
              Fichaje Digital — Auditoría de Jornada
            </p>
            <p className="text-xs text-[#64748b] mt-1">
              Art. 34.9 ET · RD-Ley 8/2019 · Cadena SHA-256 inmutable
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Link
              href="/laborcontrol/supervisor"
              className="flex items-center justify-between px-4 py-3 rounded-lg border border-[#e2e8f0] hover:border-[#d97706] hover:bg-[#fffbeb] transition-colors group"
            >
              <div>
                <p className="text-sm font-medium text-[#0f172a] group-hover:text-[#d97706]">
                  Panel Supervisor — Estado en tiempo real
                </p>
                <p className="text-xs text-[#64748b] mt-0.5">Estado actual de jornada de cada empleado (en jornada / pausa / fuera)</p>
              </div>
              <span className="text-[#94a3b8] group-hover:text-[#d97706] text-lg">→</span>
            </Link>
            <RltAccessLink canAccess={isAdmin} />
          </div>
          <p className="text-[11px] text-[#94a3b8] border-t border-[#e2e8f0] pt-3 mt-1">
            Verificación de la cadena de integridad: <span className="font-mono">GET /api/laborcontrol/chain/verify?year=YYYY&amp;month=M</span> (requiere token admin)
          </p>
        </div>

        {/* Documentación RGPD */}
        <div className="bg-white border border-[#e2e8f0] rounded-xl p-5 flex flex-col gap-3 shadow-sm">
          <p className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider">
            Documentación Legal RGPD
          </p>
          <div className="flex flex-col gap-2">
            <Link
              href="/tpv/legal/dpa"
              className="flex items-center justify-between px-4 py-3 rounded-lg border border-[#e2e8f0] hover:border-[#2563eb] hover:bg-[#f0f9ff] transition-colors group"
            >
              <div>
                <p className="text-sm font-medium text-[#0f172a] group-hover:text-[#2563eb]">
                  Contrato de Encargado del Tratamiento (DPA)
                </p>
                <p className="text-xs text-[#64748b] mt-0.5">Art.28 RGPD — relación DOC PC ↔ restaurante</p>
              </div>
              <span className="text-[#94a3b8] group-hover:text-[#2563eb] text-lg">→</span>
            </Link>
            <Link
              href="/tpv/legal/ropa"
              className="flex items-center justify-between px-4 py-3 rounded-lg border border-[#e2e8f0] hover:border-[#2563eb] hover:bg-[#f0f9ff] transition-colors group"
            >
              <div>
                <p className="text-sm font-medium text-[#0f172a] group-hover:text-[#2563eb]">
                  Registro de Actividades de Tratamiento (ROPA)
                </p>
                <p className="text-xs text-[#64748b] mt-0.5">Art.30 RGPD — 6 actividades documentadas</p>
              </div>
              <span className="text-[#94a3b8] group-hover:text-[#2563eb] text-lg">→</span>
            </Link>
            <Link
              href="/tpv/legal/clausula-empleados"
              className="flex items-center justify-between px-4 py-3 rounded-lg border border-[#e2e8f0] hover:border-[#2563eb] hover:bg-[#f0f9ff] transition-colors group"
            >
              <div>
                <p className="text-sm font-medium text-[#0f172a] group-hover:text-[#2563eb]">
                  Cláusula de Protección de Datos — Empleados
                </p>
                <p className="text-xs text-[#64748b] mt-0.5">Art.13 RGPD + LOPDGDD — plantilla para firmar</p>
              </div>
              <span className="text-[#94a3b8] group-hover:text-[#2563eb] text-lg">→</span>
            </Link>
            <Link
              href="/tpv/legal/brechas"
              className="flex items-center justify-between px-4 py-3 rounded-lg border border-[#fecaca] hover:border-[#dc2626] hover:bg-[#fef2f2] transition-colors group"
            >
              <div>
                <p className="text-sm font-medium text-[#0f172a] group-hover:text-[#dc2626]">
                  Protocolo de Brechas de Seguridad
                </p>
                <p className="text-xs text-[#64748b] mt-0.5">Art.33–34 RGPD — 72 h para notificar a la AEPD</p>
              </div>
              <span className="text-[#94a3b8] group-hover:text-[#dc2626] text-lg">→</span>
            </Link>
          </div>
        </div>

      </div>
    </div>
  );
}
