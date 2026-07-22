import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { getAuthAdminUseCase, getEmpresaPublicRepository } from '@/core/infrastructure/database';
import { verifyTpvEmployeeToken } from '@/lib/tpv-employee-auth';
import { getDomainFromHeaders } from '@/lib/domain-utils';
import { FABRICANTE, TPV_VERSION, DECLARATION_DATE } from '@/lib/fabricante';

export const dynamic = 'force-dynamic';

export default async function DpaPage() {
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

  const domain = await getDomainFromHeaders();
  const empresaResult = domain ? await getEmpresaPublicRepository().findByDomainPublic(domain) : null;
  const empresa = empresaResult?.success ? empresaResult.data : null;

  const now = new Date();
  const fechaHora = now.toLocaleString('es-ES', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'Europe/Madrid',
  });

  const empresaNombre = empresa?.nombre ?? 'La empresa';
  const empresaNif = empresa?.nif ?? '[NIF del Responsable]';
  const empresaDireccion = empresa?.direccion ?? '[Dirección del Responsable]';
  const empresaEmail = empresa?.emailNotification ?? '[Email del Responsable]';

  return (
    <div className="flex-1 overflow-auto p-6 bg-[#f1f5f9]">
      <div className="max-w-2xl mx-auto flex flex-col gap-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold text-[#2563eb] uppercase tracking-widest mb-1">
              RGPD Art.28
            </p>
            <h1 className="text-2xl font-bold text-[#0f172a]">Contrato de Encargado del Tratamiento (DPA)</h1>
            <p className="text-sm text-[#64748b] mt-1">{fechaHora}</p>
          </div>
          <Link
            href="/tpv/legal"
            className="shrink-0 px-4 py-2 rounded-lg border border-[#e2e8f0] bg-white text-sm text-[#64748b] hover:text-[#0f172a] hover:border-[#cbd5e1] transition-colors"
          >
            ← Volver
          </Link>
        </div>

        {/* Partes */}
        <div className="bg-white border border-[#e2e8f0] rounded-xl p-5 flex flex-col gap-3 shadow-sm">
          <p className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider">Partes del contrato</p>
          <div className="grid grid-cols-[120px_1fr] gap-x-4 gap-y-2 text-sm">
            <span className="text-[#64748b] font-medium">Responsable</span>
            <span className="text-[#0f172a]">{empresaNombre} — NIF: {empresaNif}</span>
            <span className="text-[#64748b]">Domicilio</span>
            <span className="text-[#0f172a]">{empresaDireccion}</span>
            <span className="text-[#64748b]">Email</span>
            <span className="text-[#0f172a]">{empresaEmail}</span>
            <span className="text-[#64748b] pt-3 border-t border-[#e2e8f0] mt-1 font-medium">Encargado</span>
            <span className="text-[#0f172a] pt-3 border-t border-[#e2e8f0] mt-1">{FABRICANTE.nombre} ({FABRICANTE.nombreComercial}) — NIF: {FABRICANTE.nif}</span>
            <span className="text-[#64748b]">Domicilio</span>
            <span className="text-[#0f172a]">{FABRICANTE.direccion}</span>
            <span className="text-[#64748b]">Email</span>
            <span className="text-[#0f172a]">{FABRICANTE.email}</span>
          </div>
        </div>

        {/* Cuerpo */}
        <div className="bg-white border border-[#e2e8f0] rounded-xl p-5 flex flex-col gap-5 shadow-sm text-sm text-[#475569] leading-relaxed">

          <section className="flex flex-col gap-1.5">
            <p className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider">1. Objeto y duración</p>
            <p>
              El presente Contrato de Encargado del Tratamiento (en adelante, <strong className="text-[#0f172a]">DPA</strong>) regula el
              tratamiento de datos personales que el Encargado realiza por cuenta del Responsable en el marco de la
              prestación del servicio de software TPV <strong className="text-[#0f172a]">multi_shop v{TPV_VERSION}</strong>.
            </p>
            <p>
              El contrato tendrá la misma vigencia que el contrato de servicios principal y se extinguirá de forma
              simultánea a éste.
            </p>
          </section>

          <section className="flex flex-col gap-1.5">
            <p className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider">2. Naturaleza y finalidad del tratamiento</p>
            <p>El Encargado tratará los datos personales exclusivamente para las siguientes finalidades:</p>
            <ul className="list-disc list-inside space-y-1 pl-2 text-[#64748b]">
              <li>Gestión de pedidos y cobros en el punto de venta (restaurante / tienda).</li>
              <li>Historial de compras del cliente vinculado al negocio del Responsable.</li>
              <li>Envío de comunicaciones comerciales cuando el cliente haya dado su consentimiento explícito.</li>
              <li>Cumplimiento de obligaciones fiscales y contables del Responsable.</li>
            </ul>
          </section>

          <section className="flex flex-col gap-1.5">
            <p className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider">3. Categorías de datos y personas</p>
            <p><strong className="text-[#0f172a]">Categorías de datos:</strong> nombre, email, teléfono, dirección de entrega, historial de pedidos y preferencias de idioma. No se tratan categorías especiales (Art.9 RGPD).</p>
            <p><strong className="text-[#0f172a]">Personas afectadas:</strong> clientes y usuarios finales del Responsable.</p>
          </section>

          <section className="flex flex-col gap-1.5">
            <p className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider">4. Obligaciones del Encargado (Art.28.3 RGPD)</p>
            <ul className="list-disc list-inside space-y-1 pl-2 text-[#64748b]">
              <li>Tratar los datos únicamente siguiendo instrucciones documentadas del Responsable.</li>
              <li>Garantizar la confidencialidad de las personas autorizadas para tratar los datos.</li>
              <li>Aplicar las medidas técnicas y organizativas del Art.32 RGPD (cifrado, pseudonimización, acceso mínimo).</li>
              <li>No subcontratar sin autorización previa del Responsable.</li>
              <li>Asistir al Responsable en el cumplimiento de derechos ARSUPO (Arts.15-22 RGPD).</li>
              <li>Suprimir o devolver todos los datos al término del contrato.</li>
              <li>Facilitar auditorías al Responsable o su delegado.</li>
              <li>Notificar brechas de seguridad sin dilación indebida (Art.33 RGPD).</li>
            </ul>
          </section>

          <section className="flex flex-col gap-1.5">
            <p className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider">5. Subencargados autorizados</p>
            <div className="overflow-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-[#f8fafc]">
                    <th className="text-left px-3 py-2 border border-[#e2e8f0] text-[#0f172a]">Subencargado</th>
                    <th className="text-left px-3 py-2 border border-[#e2e8f0] text-[#0f172a]">País</th>
                    <th className="text-left px-3 py-2 border border-[#e2e8f0] text-[#0f172a]">Finalidad</th>
                    <th className="text-left px-3 py-2 border border-[#e2e8f0] text-[#0f172a]">Base</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="px-3 py-2 border border-[#e2e8f0]">Supabase (PostgreSQL)</td>
                    <td className="px-3 py-2 border border-[#e2e8f0]">IE (UE)</td>
                    <td className="px-3 py-2 border border-[#e2e8f0]">Almacenamiento de datos</td>
                    <td className="px-3 py-2 border border-[#e2e8f0]">UE — sin transferencia</td>
                  </tr>
                  <tr className="bg-[#f8fafc]">
                    <td className="px-3 py-2 border border-[#e2e8f0]">Vercel Inc.</td>
                    <td className="px-3 py-2 border border-[#e2e8f0]">US</td>
                    <td className="px-3 py-2 border border-[#e2e8f0]">Hosting / CDN</td>
                    <td className="px-3 py-2 border border-[#e2e8f0]">SCCs (Dec.2021)</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 border border-[#e2e8f0]">Brevo SAS</td>
                    <td className="px-3 py-2 border border-[#e2e8f0]">FR (UE)</td>
                    <td className="px-3 py-2 border border-[#e2e8f0]">Email marketing</td>
                    <td className="px-3 py-2 border border-[#e2e8f0]">UE — sin transferencia</td>
                  </tr>
                  <tr className="bg-[#f8fafc]">
                    <td className="px-3 py-2 border border-[#e2e8f0]">Sentry Inc.</td>
                    <td className="px-3 py-2 border border-[#e2e8f0]">US</td>
                    <td className="px-3 py-2 border border-[#e2e8f0]">Monitorización de errores</td>
                    <td className="px-3 py-2 border border-[#e2e8f0]">SCCs (Dec.2021)</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 border border-[#e2e8f0]">Redsys (Banco Santander)</td>
                    <td className="px-3 py-2 border border-[#e2e8f0]">ES (UE)</td>
                    <td className="px-3 py-2 border border-[#e2e8f0]">Pasarela de pago</td>
                    <td className="px-3 py-2 border border-[#e2e8f0]">UE — sin transferencia</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="flex flex-col gap-1.5">
            <p className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider">6. Medidas de seguridad (Art.32 RGPD)</p>
            <ul className="list-disc list-inside space-y-1 pl-2 text-[#64748b]">
              <li>Cifrado en tránsito (TLS 1.2+) y en reposo (AES-256 — Supabase).</li>
              <li>Autenticación con JWT en cookies HttpOnly; acceso por roles (RBAC).</li>
              <li>Aislamiento multi-tenant por Row Level Security (RLS) en PostgreSQL.</li>
              <li>Anonimización automática de datos personales tras 5 años de inactividad.</li>
              <li>Registros de auditoría inmutables en <code className="bg-[#f1f5f9] px-1 rounded">tpv_cobros</code> (triggers anti-DELETE/UPDATE).</li>
              <li>Sin almacenamiento de datos de tarjeta (PCI-DSS Scope mínimo).</li>
            </ul>
          </section>

          <section className="flex flex-col gap-1.5">
            <p className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider">7. Retención y supresión</p>
            <p>
              Los datos de clientes se conservan durante el período de la relación comercial y hasta 5 años
              adicionales para cumplir con la obligación fiscal del Art.66 LGT. Transcurrido ese plazo, los datos
              personales son anonimizados automáticamente.
            </p>
            <p>
              El Responsable puede ejercer el derecho al olvido en cualquier momento mediante el endpoint
              <code className="bg-[#f1f5f9] px-1 rounded mx-1">POST /api/admin/rgpd/anonimizar-cliente</code>disponible en el panel de administración.
            </p>
          </section>

          <p className="text-[#94a3b8] text-xs border-t border-[#e2e8f0] pt-3 mt-2">
            Documento generado el <strong className="text-[#64748b]">{DECLARATION_DATE}</strong> conforme al
            Art.28 del Reglamento (UE) 2016/679 (RGPD) y al Art.28 de la Ley Orgánica 3/2018 (LOPDGDD).
            Este documento tiene carácter informativo; el DPA firmado se adjunta al contrato comercial.
          </p>
        </div>

      </div>
    </div>
  );
}
