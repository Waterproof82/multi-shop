import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getAuthAdminUseCase, getEmpresaUseCase } from '@/core/infrastructure/database';
import { SUPERADMIN_ROLE } from '@/core/domain/repositories/IAdminRepository';
import { ConfiguracionPageClient } from '@/components/admin/configuracion-page-client';

export const dynamic = 'force-dynamic';

export default async function ConfiguracionPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('admin_token')?.value;

  if (!token) {
    redirect('/admin/login');
  }

  const admin = await getAuthAdminUseCase().verifyToken(token);

  if (!admin) {
    redirect('/admin/login');
  }

  if (admin.rol === 'encargado') {
    redirect('/admin');
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
  const empresaResult = await getEmpresaUseCase().getById(empresaId);
  
  const empresaData = empresaResult.success ? empresaResult.data : null;
  
  const empresaDatos = {
    email_notification: empresaData?.emailNotification || '',
    telefono_whatsapp: empresaData?.telefonoWhatsapp || '',
    fb: empresaData?.fb || '',
    instagram: empresaData?.instagram || '',
    url_mapa: empresaData?.urlMapa || '',
    direccion: empresaData?.direccion || '',
    nif: empresaData?.nif || '',
    razonSocial: empresaData?.razonSocial || '',
    tipoImpuesto: (empresaData?.tipoImpuesto as 'iva' | 'igic' | undefined) ?? 'iva',
    porcentajeImpuesto: empresaData?.porcentajeImpuesto ?? 10,
  };

  const empresaApariencia = {
    logo_url: empresaData?.logoUrl || null,
    mostrar_logo: empresaData?.mostrarLogo ?? true,
    url_image: empresaData?.urlImage || null,
    banner_fit: empresaData?.bannerFit ?? 'contain',
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
      descuentoBienvenidaDuracion={empresaData?.descuentoBienvenidaDuracion ?? 30}
    />
  );
}
