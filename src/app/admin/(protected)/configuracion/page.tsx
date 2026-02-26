import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import { adminRepository } from '@/core/infrastructure/database/SupabaseAdminRepository';
import { ColoresForm } from '@/components/admin/colores-form';

const ADMIN_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET!;

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

  return (
    <div className="pt-20 lg:pt-0 px-6 lg:px-8">
      <h1 className="text-2xl font-serif font-bold text-gray-900 dark:text-white mb-2">
        Configuración
      </h1>
      <p className="text-gray-600 dark:text-gray-400 mb-6">
        Gestionando: <strong>{admin.empresa.nombre}</strong>
      </p>

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
