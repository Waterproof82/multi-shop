import { cookies } from 'next/headers';
import { authAdminUseCase, empresaUseCase } from '@/core/infrastructure/database';
import { ColoresForm } from '@/components/admin/colores-form';
import { EmpresaDatosForm } from '@/components/admin/empresa-datos-form';
import { EmpresaAparienciaForm } from '@/components/admin/empresa-apariencia-form';

export default async function ConfiguracionPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('admin_token')?.value;

  if (!token) {
    return <div>No autorizado</div>;
  }

  const admin = await authAdminUseCase.verifyToken(token);

  if (!admin) {
    return <div>No autorizado</div>;
  }

  const empresaResult = await empresaUseCase.getById(admin.empresa.id);
  
  // Handle error case - use defaults
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

  const empresaSlug = empresaData?.dominio || admin.empresa.id;

  return (
    <div className="pt-20 lg:pt-0 px-6 lg:px-8">
      <h1 className="text-2xl font-bold text-foreground mb-2">
        Configuración
      </h1>
      <p className="text-muted-foreground mb-6">
        Gestionando: <strong>{admin.empresa.nombre}</strong>
      </p>

      {/* Datos de la empresa */}
      <div className="bg-card rounded-lg shadow-elegant border border-border p-6 mb-6">
        <h2 className="text-lg font-semibold mb-6 text-foreground">
          Datos de contacto y redes
        </h2>
        <p className="text-sm text-muted-foreground mb-6">
          Esta información se mostrará en el pie de página de tu menú digital.
        </p>
        <EmpresaDatosForm initialData={empresaDatos} />
      </div>

      {/* Apariencia */}
      <div className="bg-card rounded-lg shadow-elegant border border-border p-6 mb-6">
        <h2 className="text-lg font-semibold mb-6 text-foreground">
          Apariencia del menú
        </h2>
        <p className="text-sm text-muted-foreground mb-6">
          Imagen de fondo del banner y descripción del restaurante en cada idioma.
        </p>
        <EmpresaAparienciaForm initialData={empresaApariencia} empresaSlug={empresaSlug} />
      </div>

      {/* Colores */}
      <div className="bg-card rounded-lg shadow-elegant border border-border p-6">
        <h2 className="text-lg font-semibold mb-6 text-foreground">
          Colores del tema
        </h2>
        <p className="text-sm text-muted-foreground mb-6">
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
