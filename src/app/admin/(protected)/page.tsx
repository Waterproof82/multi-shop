import { cookies } from 'next/headers';
import { authAdminUseCase } from '@/core/infrastructure/database';
import { getMenuUseCase } from '@/lib/server-services';

export default async function AdminDashboard() {
  const cookieStore = await cookies();
  const token = cookieStore.get('admin_token')?.value;

  if (!token) {
    return <div>No autorizado</div>;
  }

  const admin = await authAdminUseCase.verifyToken(token);

  if (!admin) {
    return <div>No autorizado</div>;
  }

  const menu = await getMenuUseCase.execute(admin.empresaId);

  const totalProductos = menu.reduce((sum, cat) => sum + cat.items.length, 0);
  const totalCategorias = menu.length;
  const productosEspeciales = menu.reduce(
    (sum, cat) => sum + cat.items.filter((item) => item.highlight).length,
    0
  );

  return (
    <div className="pt-20 lg:pt-0 px-6 lg:px-8">
      <h1 className="text-2xl font-serif font-bold text-gray-900 dark:text-white mb-2">
        Dashboard
      </h1>
      <p className="text-gray-600 dark:text-gray-400 mb-6">
        Gestionando: <strong>{admin.empresa.nombre}</strong>
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 lg:gap-6 mb-6 lg:mb-8">
        <div className="bg-white dark:bg-gray-800 p-4 lg:p-6 rounded-lg shadow-sm border dark:border-gray-700">
          <p className="text-sm text-gray-500 dark:text-gray-400">Categorías</p>
          <p className="text-2xl lg:text-3xl font-bold text-primary">{totalCategorias}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 p-4 lg:p-6 rounded-lg shadow-sm border dark:border-gray-700">
          <p className="text-sm text-gray-500 dark:text-gray-400">Productos</p>
          <p className="text-2xl lg:text-3xl font-bold text-primary">{totalProductos}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 p-4 lg:p-6 rounded-lg shadow-sm border dark:border-gray-700">
          <p className="text-sm text-gray-500 dark:text-gray-400">Productos Especiales</p>
          <p className="text-2xl lg:text-3xl font-bold text-accent">{productosEspeciales}</p>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border dark:border-gray-700 p-4 lg:p-6">
        <h2 className="text-lg font-semibold mb-4 dark:text-white">Vista Previa del Menú</h2>
        <div className="space-y-4">
          {menu.map((categoria) => (
            <div key={categoria.id} className="border-b pb-4 last:border-0 dark:border-gray-700">
              <h3 className="font-semibold text-gray-800 dark:text-gray-200">{categoria.label}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">{categoria.items.length} productos</p>
            </div>
          ))}
          {menu.length === 0 && (
            <p className="text-gray-500 dark:text-gray-400 text-center py-8">
              No hay categorías configuradas
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
