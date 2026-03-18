import { cookies } from 'next/headers';
import { authAdminUseCase, empresaUseCase } from '@/core/infrastructure/database';
import { ColoresForm } from '@/components/admin/colores-form';
import { EmpresaDatosForm } from '@/components/admin/empresa-datos-form';
import { EmpresaAparienciaForm } from '@/components/admin/empresa-apariencia-form';
import { Settings, Palette, Building2 } from 'lucide-react';

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
    <div className="pt-16 lg:pt-0 px-6 py-6 space-y-6">
      {/* Header */}
      <div className="bg-primary rounded-lg p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold text-primary-foreground">Configuración</h1>
            <p className="text-primary-foreground/80 text-sm mt-1">{admin.empresa.nombre}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="bg-primary-foreground/20 rounded-lg px-3 sm:px-4 py-2 sm:py-3 text-center">
              <Building2 className="w-4 h-4 sm:w-5 sm:h-5 text-primary-foreground mx-auto mb-1" />
              <span className="text-xs text-primary-foreground/80">Empresa</span>
            </div>
            <div className="bg-primary-foreground/20 rounded-lg px-3 sm:px-4 py-2 sm:py-3 text-center">
              <Palette className="w-4 h-4 sm:w-5 sm:h-5 text-primary-foreground mx-auto mb-1" />
              <span className="text-xs text-primary-foreground/80">Apariencia</span>
            </div>
          </div>
        </div>
      </div>

      {/* Datos de la empresa */}
      <div className="bg-card rounded-lg shadow-elegant border border-border p-6 mb-6">
        <h2 className="text-lg font-semibold mb-6 text-foreground flex items-center gap-2">
          <Settings className="w-5 h-5" />
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
