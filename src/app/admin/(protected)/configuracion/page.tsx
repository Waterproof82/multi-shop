import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { authAdminUseCase, empresaUseCase } from '@/core/infrastructure/database';
import { SUPERADMIN_ROLE } from '@/core/domain/repositories/IAdminRepository';
import { ConfiguracionPageClient } from '@/components/admin/configuracion-page-client';

export const dynamic = 'force-dynamic';

export default async function ConfiguracionPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('admin_token')?.value;

  if (!token) {
    redirect('/admin/login');
  }

  const admin = await authAdminUseCase.verifyToken(token);

  if (!admin) {
    redirect('/admin/login');
  }

  let empresaId = admin.empresaId;

  if (admin.rol === SUPERADMIN_ROLE) {
    const superadminEmpresaId = cookieStore.get('superadmin_empresa_id')?.value;
    if (!superadminEmpresaId) {
      redirect('/superadmin');
    }
    empresaId = superadminEmpresaId;
  }

  if (!empresaId) {
    redirect('/admin/login');
  }
  const empresaResult = await empresaUseCase.getById(empresaId);
  
  const empresaData = empresaResult.success ? empresaResult.data : null;
  
  const empresaDatos = {
    email_notification: empresaData?.emailNotification || '',
    telefono_whatsapp: empresaData?.telefonoWhatsapp || '',
    fb: empresaData?.fb || '',
    instagram: empresaData?.instagram || '',
    url_mapa: empresaData?.urlMapa || '',
    direccion: empresaData?.direccion || '',
  };

  const empresaApariencia = {
    logo_url: empresaData?.logoUrl || null,
    url_image: empresaData?.urlImage || null,
    descripcion_es: empresaData?.descripcion?.es || '',
    descripcion_en: empresaData?.descripcion?.en || '',
    descripcion_fr: empresaData?.descripcion?.fr || '',
    descripcion_it: empresaData?.descripcion?.it || '',
    descripcion_de: empresaData?.descripcion?.de || '',
  };

  const empresaSlug = empresaData?.dominio || empresaId;

  return (
    <ConfiguracionPageClient
      empresaNombre={empresaData?.nombre ?? ''}
      empresaId={empresaId}
      empresaSlug={empresaSlug}
      empresaDatos={empresaDatos}
      empresaApariencia={empresaApariencia}
      colores={empresaData?.colores ?? null}
      mostrarPromociones={empresaData?.mostrarPromociones ?? true}
      mostrarTgtg={empresaData?.mostrarTgtg ?? true}
      isSuperAdmin={admin.rol === SUPERADMIN_ROLE}
      descuentoBienvenidaActivo={empresaData?.descuentoBienvenidaActivo ?? false}
      descuentoBienvenidaPorcentaje={empresaData?.descuentoBienvenidaPorcentaje ?? 5}
    />
  );
}
