'use client';

import { useState, useEffect } from 'react';
import { MapPin, Phone, Mail, Link as LinkIcon, Users, Camera, Loader2, Facebook } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { fetchWithCsrf } from '@/lib/csrf-client';
import { logClientError } from '@/lib/client-error';
import { useLanguage } from '@/lib/language-context';
import { t } from '@/lib/translations';
import { useAdmin } from '@/lib/admin-context';

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
  const { language } = useLanguage();
  const { overrideEmpresaId, empresaId: defaultEmpresaId } = useAdmin();
  const efectivoEmpresaId = overrideEmpresaId || defaultEmpresaId;
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
      const res = await fetchWithCsrf(`/api/admin/empresa?empresaId=${efectivoEmpresaId}`, {
        method: 'PUT',
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        setSaved(true);
      }
    } catch (error) {
      logClientError(error, 'handleSubmit');
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
            {t('emailNotificationLabel', language)}
          </label>
          <Input
            id="email_notification"
            name="email_notification"
            type="email"
            value={formData.email_notification}
            onChange={(e) => handleChange('email_notification', e.target.value)}
            placeholder="pedidos@tuempresa.com"
            aria-describedby="email_notification_help"
            aria-required="true"
            required
          />
          <span id="email_notification_help" className="text-xs text-muted-foreground">{t('emailNotificationHelp', language)}</span>
        </div>

        {/* WhatsApp */}
        <div className="flex flex-col gap-2">
          <label htmlFor="telefono_whatsapp" className="text-sm font-medium text-foreground flex items-center gap-2">
            <Phone className="w-4 h-4" />
            {t('whatsappLabel', language)}
          </label>
          <Input
            id="telefono_whatsapp"
            name="telefono_whatsapp"
            type="text"
            value={formData.telefono_whatsapp}
            onChange={(e) => handleChange('telefono_whatsapp', e.target.value)}
            placeholder="+34612345678"
            aria-describedby="telefono_whatsapp_help"
          />
          <span id="telefono_whatsapp_help" className="text-xs text-muted-foreground">{t('whatsappHelp', language)}</span>
        </div>

        {/* Dirección */}
        <div className="flex flex-col gap-2 md:col-span-2">
          <label htmlFor="direccion" className="text-sm font-medium text-foreground flex items-center gap-2">
            <MapPin className="w-4 h-4" />
            {t('address', language)}
          </label>
          <Input
            id="direccion"
            name="direccion"
            type="text"
            value={formData.direccion}
            onChange={(e) => handleChange('direccion', e.target.value)}
            placeholder="Av. Example 123, Ciudad"
            aria-describedby="direccion_help"
          />
          <span id="direccion_help" className="text-xs text-muted-foreground">{t('addressHelp', language)}</span>
        </div>

        {/* Facebook */}
        <div className="flex flex-col gap-2">
          <label htmlFor="fb" className="text-sm font-medium text-foreground flex items-center gap-2">
            <Facebook className="w-4 h-4" />
            {t('facebook', language)}
          </label>
          <Input
            id="fb"
            name="fb"
            type="url"
            value={formData.fb}
            onChange={(e) => handleChange('fb', e.target.value)}
            placeholder="https://facebook.com/tuempresa"
            aria-describedby="fb_help"
          />
          <span id="fb_help" className="text-xs text-muted-foreground">{t('facebookHelp', language)}</span>
        </div>

        {/* Instagram */}
        <div className="flex flex-col gap-2">
          <label htmlFor="instagram" className="text-sm font-medium text-foreground flex items-center gap-2">
            <Camera className="w-4 h-4" />
            {t('instagram', language)}
          </label>
          <Input
            id="instagram"
            name="instagram"
            type="url"
            value={formData.instagram}
            onChange={(e) => handleChange('instagram', e.target.value)}
            placeholder="https://instagram.com/tuempresa"
            aria-describedby="instagram_help"
          />
          <span id="instagram_help" className="text-xs text-muted-foreground">{t('instagramHelp', language)}</span>
        </div>

        {/* URL del Mapa */}
        <div className="flex flex-col gap-2 md:col-span-2">
          <label htmlFor="url_mapa" className="text-sm font-medium text-foreground flex items-center gap-2">
            <LinkIcon className="w-4 h-4" />
            {t('mapEmbedLabel', language)}
          </label>
          <Input
            id="url_mapa"
            name="url_mapa"
            type="url"
            value={formData.url_mapa}
            onChange={(e) => handleChange('url_mapa', e.target.value)}
            placeholder="https://www.google.com/maps/embed?pb=..."
            aria-describedby="url_mapa_help"
          />
          <span id="url_mapa_help" className="text-xs text-muted-foreground">
            {t('mapEmbedHelp', language)}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-4 pt-4">
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 min-h-[44px] bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center gap-2 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />}
          {saving ? t('savingProgress', language) : t('saveContactData', language)}
        </button>
        {saved && (
          <span className="text-primary text-sm">{t('contactDataSaved', language)}</span>
        )}
      </div>
    </form>
  );
}
