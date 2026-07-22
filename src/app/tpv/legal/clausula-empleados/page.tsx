import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { getAuthAdminUseCase, getEmpresaPublicRepository } from '@/core/infrastructure/database';
import { verifyTpvEmployeeToken } from '@/lib/tpv-employee-auth';
import { getDomainFromHeaders } from '@/lib/domain-utils';
import { DECLARATION_DATE } from '@/lib/fabricante';

export const dynamic = 'force-dynamic';

export default async function ClausulaEmpleadosPage() {
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

  const empresaNombre = empresa?.nombre ?? '[NOMBRE DE LA EMPRESA]';
  const empresaNif = empresa?.nif ?? '[NIF]';
  const empresaEmail = empresa?.emailNotification ?? '[EMAIL]';

  const clausulaTexto = `CLÁUSULA DE PROTECCIÓN DE DATOS PARA EMPLEADOS / COLABORADORES

En cumplimiento del Reglamento (UE) 2016/679 (RGPD) y la Ley Orgánica 3/2018 (LOPDGDD), se le informa de lo siguiente:

RESPONSABLE DEL TRATAMIENTO
${empresaNombre} — NIF: ${empresaNif}
Email de contacto: ${empresaEmail}

FINALIDAD Y BASE JURÍDICA
Sus datos personales (nombre, NIF, datos de contacto, datos bancarios y de nómina) serán tratados para:
— La gestión de la relación laboral o mercantil (Art.6.1.b RGPD; Art.9.2.b para datos de salud si procede).
— El cumplimiento de obligaciones legales en materia laboral, fiscal y de seguridad social (Art.6.1.c RGPD).

DESTINATARIOS
Sus datos podrán ser comunicados a:
— Administraciones públicas (AEAT, Seguridad Social, Inspección de Trabajo) cuando lo exija la ley.
— Gestoría o asesoría laboral contratada por la empresa.
— Entidades financieras para el pago de nóminas.

No se realizarán transferencias internacionales de datos.

PLAZO DE CONSERVACIÓN
Los datos se conservarán durante la vigencia de la relación laboral/mercantil y, una vez extinguida, durante los plazos legales aplicables (mínimo 4 años para obligaciones laborales y 5 años para obligaciones fiscales).

DERECHOS
Puede ejercer sus derechos de acceso, rectificación, supresión, oposición, limitación y portabilidad dirigiéndose a ${empresaEmail}, aportando copia de su DNI. Tiene derecho a presentar reclamación ante la Agencia Española de Protección de Datos (www.aepd.es).

ACCESO AL SISTEMA TPV
En el ejercicio de sus funciones, podrá acceder al sistema TPV multi_shop y tratar datos de clientes (nombre, contacto, historial de pedidos) por cuenta de ${empresaNombre}. Queda obligado a:
— Mantener la confidencialidad de los datos a los que acceda, incluso tras la extinción de la relación.
— No extraer, copiar ni compartir datos de clientes fuera del sistema.
— Comunicar inmediatamente cualquier incidente de seguridad o acceso no autorizado.
— Usar el sistema exclusivamente para las finalidades autorizadas por la empresa.

El incumplimiento de estas obligaciones puede derivar en responsabilidad disciplinaria y/o civil/penal.

He recibido y leído la presente cláusula informativa:

Nombre y apellidos: ________________________________________
DNI/NIE: ________________________________________________
Fecha: __________________________________________________
Firma: __________________________________________________`;

  return (
    <div className="flex-1 overflow-auto p-6 bg-[#f1f5f9]">
      <div className="max-w-2xl mx-auto flex flex-col gap-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold text-[#2563eb] uppercase tracking-widest mb-1">
              RGPD Art.13 + LOPDGDD
            </p>
            <h1 className="text-2xl font-bold text-[#0f172a]">Cláusula de Protección de Datos — Empleados</h1>
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
            Esta cláusula debe entregarse y firmarse por cada empleado o colaborador con acceso al TPV.
            Guarde una copia firmada en el expediente del empleado. Generada para{' '}
            <strong className="text-[#475569]">{empresaNombre}</strong> el{' '}
            <strong className="text-[#475569]">{DECLARATION_DATE}</strong>.
          </p>
        </div>

        {/* Texto de la cláusula */}
        <div className="bg-white border border-[#e2e8f0] rounded-xl p-5 shadow-sm">
          <pre className="text-xs text-[#475569] leading-relaxed whitespace-pre-wrap font-sans select-all">
            {clausulaTexto}
          </pre>
        </div>

        {/* Instrucciones de uso */}
        <div className="bg-[#f0f9ff] border border-[#bae6fd] rounded-xl p-4 flex flex-col gap-2">
          <p className="text-[10px] font-bold text-[#0369a1] uppercase tracking-wider">Instrucciones de uso</p>
          <ul className="text-xs text-[#0c4a6e] space-y-1 list-disc list-inside">
            <li>Seleccione todo el texto de la cláusula (o use Ctrl+A dentro del recuadro).</li>
            <li>Cópielo y péguelo en un documento Word/PDF con el membrete de la empresa.</li>
            <li>Imprima, firme y archive en el expediente del empleado.</li>
            <li>Rellene los campos entre corchetes con los datos definitivos si aparecen incompletos.</li>
          </ul>
        </div>

      </div>
    </div>
  );
}
