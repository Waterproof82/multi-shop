'use client';

import { useState, useEffect } from 'react';
import { Instagram, Facebook, MapPin, Phone, Mail, Link as LinkIcon } from 'lucide-react';

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

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);

    try {
      const res = await fetch('/api/admin/empresa', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
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
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
            <Mail className="w-4 h-4" />
            Email de notificaciones
          </label>
          <input
            type="email"
            value={formData.email_notification}
            onChange={(e) => handleChange('email_notification', e.target.value)}
            placeholder="pedidos@tuempresa.com"
            className="px-3 py-2 border rounded-md dark:bg-gray-800 dark:border-gray-600 dark:text-white text-sm"
          />
          <span className="text-xs text-gray-500">Recibirás los pedidos nuevos en este email</span>
        </div>

        {/* WhatsApp */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
            <Phone className="w-4 h-4" />
            WhatsApp
          </label>
          <input
            type="text"
            value={formData.telefono_whatsapp}
            onChange={(e) => handleChange('telefono_whatsapp', e.target.value)}
            placeholder="+5491112345678"
            className="px-3 py-2 border rounded-md dark:bg-gray-800 dark:border-gray-600 dark:text-white text-sm"
          />
          <span className="text-xs text-gray-500">Número con código de país sin espacios</span>
        </div>

        {/* Dirección */}
        <div className="flex flex-col gap-2 md:col-span-2">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
            <MapPin className="w-4 h-4" />
            Dirección
          </label>
          <input
            type="text"
            value={formData.direccion}
            onChange={(e) => handleChange('direccion', e.target.value)}
            placeholder="Av. Example 123, Ciudad"
            className="px-3 py-2 border rounded-md dark:bg-gray-800 dark:border-gray-600 dark:text-white text-sm"
          />
        </div>

        {/* Facebook */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
            <Facebook className="w-4 h-4" />
            Facebook
          </label>
          <input
            type="url"
            value={formData.fb}
            onChange={(e) => handleChange('fb', e.target.value)}
            placeholder="https://facebook.com/tuempresa"
            className="px-3 py-2 border rounded-md dark:bg-gray-800 dark:border-gray-600 dark:text-white text-sm"
          />
        </div>

        {/* Instagram */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
            <Instagram className="w-4 h-4" />
            Instagram
          </label>
          <input
            type="url"
            value={formData.instagram}
            onChange={(e) => handleChange('instagram', e.target.value)}
            placeholder="https://instagram.com/tuempresa"
            className="px-3 py-2 border rounded-md dark:bg-gray-800 dark:border-gray-600 dark:text-white text-sm"
          />
        </div>

        {/* URL del Mapa */}
        <div className="flex flex-col gap-2 md:col-span-2">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
            <LinkIcon className="w-4 h-4" />
            Embed del mapa (iframe)
          </label>
          <input
            type="url"
            value={formData.url_mapa}
            onChange={(e) => handleChange('url_mapa', e.target.value)}
            placeholder="https://www.google.com/maps/embed?pb=..."
            className="px-3 py-2 border rounded-md dark:bg-gray-800 dark:border-gray-600 dark:text-white text-sm"
          />
          <span className="text-xs text-gray-500">
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
          <span className="text-green-600 text-sm">¡Datos guardados correctamente!</span>
        )}
      </div>
    </form>
  );
}
