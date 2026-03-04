import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import { adminRepository } from '@/core/infrastructure/database/SupabaseAdminRepository';
import { createClient } from '@supabase/supabase-js';
import { ColoresForm } from '@/components/admin/colores-form';
import { EmpresaDatosForm } from '@/components/admin/empresa-datos-form';

const ADMIN_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET!;

function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Configuración de Supabase incompleta");
  }
  return createClient(supabaseUrl, supabaseKey);
}

export default async function ConfiguracionPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('admin_token')?.value;

  if (!token) {
    return <div>No autorizado</div>;
  }

  const { payload } = await jwtVerify(token, new TextEncoder().encode(ADMIN_TOKEN_SECRET));
  const admin = await adminRepository.findById(payload.adminId as string);

  if (!admin) {
    return <div>Admin no encontrado</div>;
  }

  // Obtener datos adicionales de la empresa
  const supabase = getSupabaseClient();
  const { data: empresaData } = await supabase
    .from('empresas')
    .select('email_notification, telefono_whatsapp, fb, instagram, url_mapa, direccion')
    .eq('id', admin.empresa.id)
    .single();

  const empresaDatos = {
    email_notification: empresaData?.email_notification || '',
    telefono_whatsapp: empresaData?.telefono_whatsapp || '',
    fb: empresaData?.fb || '',
    instagram: empresaData?.instagram || '',
    url_mapa: empresaData?.url_mapa || '',
    direccion: empresaData?.direccion || '',
  };

  return (
    <div className="pt-20 lg:pt-0 px-6 lg:px-8">
      <h1 className="text-2xl font-serif font-bold text-gray-900 dark:text-white mb-2">
        Configuración
      </h1>
      <p className="text-gray-600 dark:text-gray-400 mb-6">
        Gestionando: <strong>{admin.empresa.nombre}</strong>
      </p>

      {/* Datos de la empresa */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border dark:border-gray-700 p-6 mb-6">
        <h2 className="text-lg font-semibold mb-6 dark:text-white">
          Datos de contacto y redes
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          Esta información se mostrará en el pie de página de tu menú digital.
        </p>
        <EmpresaDatosForm initialData={empresaDatos} />
      </div>

      {/* Colores */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border dark:border-gray-700 p-6">
        <h2 className="text-lg font-semibold mb-6 dark:text-white">
          Colores del tema
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          Personaliza los colores de tu menú digital. Los cambios se aplicarán automáticamente.
        </p>
        <ColoresForm
          coloresIniciales={admin.empresa.colores}
          empresaId={admin.empresa.id}
        />
      </div>
    </div>
  );
}
