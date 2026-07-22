import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { getAuthAdminUseCase } from '@/core/infrastructure/database';
import { verifyTpvEmployeeToken } from '@/lib/tpv-employee-auth';
import { DECLARATION_DATE } from '@/lib/fabricante';

export const dynamic = 'force-dynamic';

interface RopaRow {
  id: string;
  actividad: string;
  finalidad: string;
  baseJuridica: string;
  categorias: string;
  destinatarios: string;
  plazo: string;
  transferencias: string;
}

const ROPA_ROWS: RopaRow[] = [
  {
    id: 'R1',
    actividad: 'Gestión de pedidos',
    finalidad: 'Procesar y registrar los pedidos del cliente en el punto de venta (delivery, recogida, mesa).',
    baseJuridica: 'Art.6.1.b RGPD — ejecución de contrato',
    categorias: 'Nombre, teléfono, email, dirección de entrega, historial de pedidos.',
    destinatarios: 'Responsable del tratamiento (restaurante/tienda). Supabase (base de datos, IE).',
    plazo: '5 años desde la última actividad (Art.66 LGT). Anonimización automática al vencer.',
    transferencias: 'Supabase: West EU (Irlanda) — sin transferencia internacional.',
  },
  {
    id: 'R2',
    actividad: 'Cobros y facturación',
    finalidad: 'Registrar el cobro, generar ticket y cumplir con la normativa VeriFactu (RD 1007/2023).',
    baseJuridica: 'Art.6.1.c RGPD — obligación legal',
    categorias: 'Importe, método de pago, desglose IVA/IGIC. Sin PAN ni CVV.',
    destinatarios: 'Responsable. Redsys (pasarela de pago, ES). AEAT (si procede inspección).',
    plazo: '10 años — Ley 58/2003 LGT. Inmutable (triggers anti-DELETE).',
    transferencias: 'Redsys: España (UE) — sin transferencia internacional.',
  },
  {
    id: 'R3',
    actividad: 'Marketing y comunicaciones comerciales',
    finalidad: 'Enviar ofertas y promociones cuando el cliente ha dado su consentimiento explícito.',
    baseJuridica: 'Art.6.1.a RGPD — consentimiento. LSSI-CE Art.21.',
    categorias: 'Email, nombre, preferencia de idioma, consentimiento y fecha.',
    destinatarios: 'Responsable. Brevo SAS (plataforma de email marketing, FR).',
    plazo: 'Hasta retirada del consentimiento o 5 años de inactividad.',
    transferencias: 'Brevo: Francia (UE) — sin transferencia internacional.',
  },
  {
    id: 'R4',
    actividad: 'Atención al cliente',
    finalidad: 'Gestionar reclamaciones, devoluciones y derechos ARSUPO.',
    baseJuridica: 'Art.6.1.b/c RGPD — contrato y obligación legal.',
    categorias: 'Nombre, email, teléfono, contenido de la comunicación.',
    destinatarios: 'Responsable. DOC PC (soporte técnico, encargado).',
    plazo: '5 años desde la resolución del caso.',
    transferencias: 'Ninguna.',
  },
  {
    id: 'R5',
    actividad: 'Monitorización y seguridad del sistema',
    finalidad: 'Detectar errores técnicos, anomalías de seguridad y rendimiento.',
    baseJuridica: 'Art.6.1.f RGPD — interés legítimo del responsable.',
    categorias: 'Logs de sistema, trazas de error (pseudonimizadas). Sin PII directa.',
    destinatarios: 'DOC PC. Sentry Inc. (monitorización, US — SCCs).',
    plazo: '90 días.',
    transferencias: 'Sentry: EEUU — SCCs Decisión CE 4/6/2021.',
  },
  {
    id: 'R6',
    actividad: 'Hosting y disponibilidad del servicio',
    finalidad: 'Servir la aplicación y la carta digital a usuarios finales.',
    baseJuridica: 'Art.6.1.b RGPD — ejecución del contrato de servicios.',
    categorias: 'IP del usuario, cookies de sesión (HttpOnly, sin tracking externo).',
    destinatarios: 'Vercel Inc. (hosting, US — SCCs).',
    plazo: 'Logs de acceso: 30 días.',
    transferencias: 'Vercel: EEUU — SCCs Decisión CE 4/6/2021.',
  },
];

export default async function RopaPage() {
  const cookieStore = await cookies();
  let empresaId: string | null = null;

  const adminToken = cookieStore.get('admin_token')?.value;
  if (adminToken) {
    const admin = await getAuthAdminUseCase().verifyToken(adminToken);
    if (admin?.empresaId) empresaId = admin.empresaId;
  }

  if (!empresaId) {
    const employeeToken = cookieStore.get('tpv_employee_token')?.value;
    if (employeeToken) {
      const payload = await verifyTpvEmployeeToken(employeeToken);
      if (payload) empresaId = payload.empresaId;
    }
  }

  if (!empresaId) redirect('/tpv/login');

  const now = new Date();
  const fechaHora = now.toLocaleString('es-ES', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'Europe/Madrid',
  });

  return (
    <div className="flex-1 overflow-auto p-6 bg-[#f1f5f9]">
      <div className="max-w-4xl mx-auto flex flex-col gap-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold text-[#2563eb] uppercase tracking-widest mb-1">
              RGPD Art.30
            </p>
            <h1 className="text-2xl font-bold text-[#0f172a]">Registro de Actividades de Tratamiento (ROPA)</h1>
            <p className="text-sm text-[#64748b] mt-1">{fechaHora}</p>
          </div>
          <Link
            href="/tpv/legal"
            className="shrink-0 px-4 py-2 rounded-lg border border-[#e2e8f0] bg-white text-sm text-[#64748b] hover:text-[#0f172a] hover:border-[#cbd5e1] transition-colors"
          >
            ← Volver
          </Link>
        </div>

        <div className="bg-white border border-[#e2e8f0] rounded-xl p-5 shadow-sm">
          <p className="text-xs text-[#64748b] leading-relaxed">
            Registro requerido por el <strong className="text-[#475569]">Art.30 RGPD</strong> para responsables
            del tratamiento que procesen datos de forma sistemática. Aplica a cada empresa (restaurante/tienda)
            que use multi_shop como Responsable del Tratamiento.
            Última revisión: <strong className="text-[#475569]">{DECLARATION_DATE}</strong>.
          </p>
        </div>

        {/* Tabla */}
        <div className="flex flex-col gap-4">
          {ROPA_ROWS.map((row) => (
            <div key={row.id} className="bg-white border border-[#e2e8f0] rounded-xl p-5 shadow-sm flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-bold text-white bg-[#2563eb] px-2 py-0.5 rounded">{row.id}</span>
                <h2 className="text-sm font-semibold text-[#0f172a]">{row.actividad}</h2>
              </div>
              <div className="grid grid-cols-[140px_1fr] gap-x-4 gap-y-1.5 text-xs">
                <span className="text-[#64748b] font-medium">Finalidad</span>
                <span className="text-[#475569]">{row.finalidad}</span>
                <span className="text-[#64748b] font-medium">Base jurídica</span>
                <span className="text-[#475569]">{row.baseJuridica}</span>
                <span className="text-[#64748b] font-medium">Categorías</span>
                <span className="text-[#475569]">{row.categorias}</span>
                <span className="text-[#64748b] font-medium">Destinatarios</span>
                <span className="text-[#475569]">{row.destinatarios}</span>
                <span className="text-[#64748b] font-medium">Plazo retención</span>
                <span className="text-[#475569]">{row.plazo}</span>
                <span className="text-[#64748b] font-medium">Transferencias</span>
                <span className="text-[#475569]">{row.transferencias}</span>
              </div>
            </div>
          ))}
        </div>

        <p className="text-[#94a3b8] text-xs text-center pb-4">
          Este registro debe ser actualizado cuando cambien las actividades de tratamiento.
          Conservar durante toda la vigencia del contrato de servicios.
        </p>

      </div>
    </div>
  );
}
