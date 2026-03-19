'use client';

import { useState, useEffect } from 'react';
import { MapPin, Phone, Mail, Link as LinkIcon, Users, Camera } from 'lucide-react';
import { fetchWithCsrf } from '@/lib/csrf-client';

interface EmpresaDatosFormProps {
  readonly initialData: {
    email_notification: string;
    telefono_whatsapp: string;
    fb: string;
    instagram: string;
    url_mapa: string;
    direccion: string;
  };
}

export function EmpresaDatosForm({ initialData }: EmpresaDatosFormProps) {
  const [formData, setFormData] = useState(initialData);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setFormData(initialData);
  }, [initialData]);

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setSaved(false);
  };

  const handleSubmit = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);

    try {
      const res = await fetchWithCsrf('/api/admin/empresa', {
        method: 'PUT',
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        setSaved(true);
      }
    } catch (error) {
      console.error('Error guardando datos:', error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Email de notificaciones */}
        <div className="flex flex-col gap-2">
          <label htmlFor="email_notification" className="text-sm font-medium text-foreground flex items-center gap-2">
            <Mail className="w-4 h-4" />
            Email de notificaciones
          </label>
          <input
            id="email_notification"
            name="email_notification"
            type="email"
            value={formData.email_notification}
            onChange={(e) => handleChange('email_notification', e.target.value)}
            placeholder="pedidos@tuempresa.com"
            className="px-3 py-2 border rounded-md bg-card border-border text-foreground text-sm"
            aria-describedby="email_notification_help"
          />
          <span id="email_notification_help" className="text-xs text-muted-foreground">Recibirás los pedidos nuevos en este email</span>
        </div>

        {/* WhatsApp */}
        <div className="flex flex-col gap-2">
          <label htmlFor="telefono_whatsapp" className="text-sm font-medium text-foreground flex items-center gap-2">
            <Phone className="w-4 h-4" />
            WhatsApp
          </label>
          <input
            id="telefono_whatsapp"
            name="telefono_whatsapp"
            type="text"
            value={formData.telefono_whatsapp}
            onChange={(e) => handleChange('telefono_whatsapp', e.target.value)}
            placeholder="+5491112345678"
            className="px-3 py-2 border rounded-md bg-card border-border text-foreground text-sm"
          />
          <span className="text-xs text-muted-foreground">Número con código de país sin espacios</span>
        </div>

        {/* Dirección */}
        <div className="flex flex-col gap-2 md:col-span-2">
          <label htmlFor="direccion" className="text-sm font-medium text-foreground flex items-center gap-2">
            <MapPin className="w-4 h-4" />
            Dirección
          </label>
          <input
            id="direccion"
            name="direccion"
            type="text"
            value={formData.direccion}
            onChange={(e) => handleChange('direccion', e.target.value)}
            placeholder="Av. Example 123, Ciudad"
            className="px-3 py-2 border rounded-md bg-card border-border text-foreground text-sm"
          />
        </div>

        {/* Facebook */}
        <div className="flex flex-col gap-2">
          <label htmlFor="fb" className="text-sm font-medium text-foreground flex items-center gap-2">
            <Users className="w-4 h-4" />
            Facebook
          </label>
          <input
            id="fb"
            name="fb"
            type="url"
            value={formData.fb}
            onChange={(e) => handleChange('fb', e.target.value)}
            placeholder="https://facebook.com/tuempresa"
            className="px-3 py-2 border rounded-md bg-card border-border text-foreground text-sm"
          />
        </div>

        {/* Instagram */}
        <div className="flex flex-col gap-2">
          <label htmlFor="instagram" className="text-sm font-medium text-foreground flex items-center gap-2">
            <Camera className="w-4 h-4" />
            Instagram
          </label>
          <input
            id="instagram"
            name="instagram"
            type="url"
            value={formData.instagram}
            onChange={(e) => handleChange('instagram', e.target.value)}
            placeholder="https://instagram.com/tuempresa"
            className="px-3 py-2 border rounded-md bg-card border-border text-foreground text-sm"
          />
        </div>

        {/* URL del Mapa */}
        <div className="flex flex-col gap-2 md:col-span-2">
          <label htmlFor="url_mapa" className="text-sm font-medium text-foreground flex items-center gap-2">
            <LinkIcon className="w-4 h-4" />
            Embed del mapa (iframe)
          </label>
          <input
            id="url_mapa"
            name="url_mapa"
            type="url"
            value={formData.url_mapa}
            onChange={(e) => handleChange('url_mapa', e.target.value)}
            placeholder="https://www.google.com/maps/embed?pb=..."
            className="px-3 py-2 border rounded-md bg-card border-border text-foreground text-sm"
          />
          <span className="text-xs text-muted-foreground">
            Ir a Google Maps → Compartir → Insertar mapa → Copiar HTML → Pegar solo la URL del src
          </span>
        </div>
      </div>

      <div className="flex items-center gap-4 pt-4">
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {saving ? 'Guardando...' : 'Guardar datos'}
        </button>
        {saved && (
          <span className="text-primary text-sm">¡Datos guardados correctamente!</span>
        )}
      </div>
    </form>
  );
}
