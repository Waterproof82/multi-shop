import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { getAuthAdminUseCase } from '@/core/infrastructure/database';
import { verifyTpvEmployeeToken } from '@/lib/tpv-employee-auth';
import { FABRICANTE } from '@/lib/fabricante';

export const dynamic = 'force-dynamic';

export default async function BrechasPage() {
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
      <div className="max-w-2xl mx-auto flex flex-col gap-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold text-[#2563eb] uppercase tracking-widest mb-1">
              RGPD Art.33 + Art.34
            </p>
            <h1 className="text-2xl font-bold text-[#0f172a]">Protocolo de Brechas de Seguridad</h1>
            <p className="text-sm text-[#64748b] mt-1">{fechaHora}</p>
          </div>
          <Link
            href="/tpv/legal"
            className="shrink-0 px-4 py-2 rounded-lg border border-[#e2e8f0] bg-white text-sm text-[#64748b] hover:text-[#0f172a] hover:border-[#cbd5e1] transition-colors"
          >
            ← Volver
          </Link>
        </div>

        {/* Alerta */}
        <div className="bg-[#fef2f2] border border-[#fecaca] rounded-xl p-4 flex flex-col gap-1.5">
          <p className="text-[10px] font-bold text-[#dc2626] uppercase tracking-wider">Plazo legal: 72 horas</p>
          <p className="text-xs text-[#7f1d1d] leading-relaxed">
            El Art.33 RGPD exige notificar a la AEPD <strong>en un máximo de 72 horas</strong> desde que el
            Responsable tenga conocimiento de la brecha. El Art.34 puede exigir notificar también a los afectados
            si existe riesgo elevado para sus derechos.
          </p>
        </div>

        {/* Flujo de respuesta */}
        <div className="bg-white border border-[#e2e8f0] rounded-xl p-5 flex flex-col gap-4 shadow-sm">
          <p className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider">Protocolo de respuesta</p>

          {[
            {
              paso: '1',
              titulo: 'Detección y contención inmediata',
              plazo: '0–2 h',
              acciones: [
                'Identificar el sistema afectado y desconectarlo si es necesario.',
                'Preservar logs y evidencias sin modificarlas.',
                'Notificar inmediatamente al Encargado del Tratamiento: ' + FABRICANTE.email + ' / ' + FABRICANTE.telefono,
                'Abrir un registro interno del incidente (fecha, hora, descripción inicial).',
              ],
            },
            {
              paso: '2',
              titulo: 'Evaluación del riesgo',
              plazo: '2–24 h',
              acciones: [
                'Determinar qué datos se han visto comprometidos (categorías, volumen, afectados).',
                'Evaluar la probabilidad e impacto sobre los derechos de los interesados.',
                'Clasificar: brecha de confidencialidad, integridad o disponibilidad.',
                'Documentar: causa probable, origen, alcance estimado.',
              ],
            },
            {
              paso: '3',
              titulo: 'Notificación a la AEPD (si procede)',
              plazo: '< 72 h desde conocimiento',
              acciones: [
                'Acceder al portal de la AEPD: https://sedeagpd.gob.es',
                'Usar el formulario de notificación de brechas (Art.33 RGPD).',
                'Incluir: naturaleza de la brecha, categorías y número aproximado de afectados, consecuencias probables, medidas adoptadas.',
                'Si no se puede completar en 72 h, notificar lo disponible y completar posteriormente.',
              ],
            },
            {
              paso: '4',
              titulo: 'Notificación a afectados (si riesgo alto)',
              plazo: 'Sin dilación indebida',
              acciones: [
                'Si el riesgo para los derechos de los interesados es alto: notificar por email/teléfono a cada afectado.',
                'Describir claramente qué ocurrió, qué datos se vieron comprometidos y qué medidas tomar.',
                'Excepciones: no notificar si los datos estaban cifrados o si supondría esfuerzo desproporcionado (→ comunicación pública).',
              ],
            },
            {
              paso: '5',
              titulo: 'Revisión y cierre',
              plazo: 'Tras resolución',
              acciones: [
                'Documentar el incidente completo en el Registro de Brechas interno (obligatorio Art.33.5).',
                'Aplicar medidas correctoras para evitar recurrencia.',
                'Actualizar el ROPA y las medidas de seguridad si procede.',
                'Archivar toda la documentación durante mínimo 5 años.',
              ],
            },
          ].map(({ paso, titulo, plazo, acciones }) => (
            <div key={paso} className="flex gap-4 pb-4 border-b border-[#e2e8f0] last:border-0 last:pb-0">
              <div className="shrink-0 w-7 h-7 rounded-full bg-[#2563eb] text-white text-xs font-bold flex items-center justify-center mt-0.5">
                {paso}
              </div>
              <div className="flex flex-col gap-1.5 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-[#0f172a]">{titulo}</p>
                  <span className="text-[10px] font-bold text-[#2563eb] bg-[#eff6ff] px-2 py-0.5 rounded-full">{plazo}</span>
                </div>
                <ul className="text-xs text-[#64748b] space-y-1 list-disc list-inside pl-1">
                  {acciones.map(a => <li key={a}>{a}</li>)}
                </ul>
              </div>
            </div>
          ))}
        </div>

        {/* Contacto encargado */}
        <div className="bg-white border border-[#e2e8f0] rounded-xl p-5 shadow-sm flex flex-col gap-2">
          <p className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider">Contacto del Encargado del Tratamiento</p>
          <div className="grid grid-cols-[100px_1fr] gap-x-4 gap-y-1.5 text-xs">
            <span className="text-[#64748b]">Empresa</span>
            <span className="text-[#0f172a]">{FABRICANTE.nombreComercial} — {FABRICANTE.nombre}</span>
            <span className="text-[#64748b]">Email</span>
            <a href={`mailto:${FABRICANTE.email}`} className="text-[#2563eb] underline">{FABRICANTE.email}</a>
            <span className="text-[#64748b]">Teléfono</span>
            <a href={`tel:${FABRICANTE.telefono}`} className="text-[#2563eb] underline">{FABRICANTE.telefono}</a>
          </div>
        </div>

        {/* AEPD */}
        <div className="bg-white border border-[#e2e8f0] rounded-xl p-5 shadow-sm flex flex-col gap-2">
          <p className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider">Autoridad de Control</p>
          <div className="grid grid-cols-[100px_1fr] gap-x-4 gap-y-1.5 text-xs">
            <span className="text-[#64748b]">Organismo</span>
            <span className="text-[#0f172a]">Agencia Española de Protección de Datos (AEPD)</span>
            <span className="text-[#64748b]">Portal</span>
            <span className="text-[#0f172a] font-mono">sedeagpd.gob.es</span>
            <span className="text-[#64748b]">Teléfono</span>
            <span className="text-[#0f172a]">901 100 099</span>
          </div>
        </div>

      </div>
    </div>
  );
}
