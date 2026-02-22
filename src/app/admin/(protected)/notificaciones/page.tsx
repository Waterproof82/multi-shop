'use client';

import { useState, useEffect } from 'react';
import { useAdmin } from '@/lib/admin-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface SettingsData {
  email_notification: string;
}

export default function NotificacionesPage() {
  const { empresaId } = useAdmin();
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchSettings() {
      try {
        const res = await fetch(`/api/admin/empresa`);
        if (res.ok) {
          const data = await res.json();
          setEmail(data.email_notification || '');
        }
      } catch (error) {
        console.error('Error fetching settings:', error);
      } finally {
        setLoading(false);
      }
    }
    if (empresaId) {
      fetchSettings();
    }
  }, [empresaId]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch('/api/admin/empresa', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email_notification: email }),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch (error) {
      console.error('Error saving:', error);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="pt-20 lg:pt-0 px-6 lg:px-8 flex items-center justify-center min-h-[50vh]">
        <div className="text-gray-500">Cargando...</div>
      </div>
    );
  }

  return (
    <div className="pt-20 lg:pt-0 px-6 lg:px-8">
      <h1 className="text-2xl font-serif font-bold text-gray-900 dark:text-white mb-2">
        Notificaciones
      </h1>
      <p className="text-gray-600 dark:text-gray-400 mb-6">
        Configura dónde recibir los pedidos confirmados
      </p>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border dark:border-gray-700 p-6 max-w-xl">
        <div className="space-y-4">
          <div>
            <Label htmlFor="email" className="text-sm font-medium dark:text-gray-200">
              Email para recibir pedidos
            </Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="pedidos@tuempresa.com"
              className="mt-1"
            />
            <p className="text-xs text-gray-500 mt-1">
              Los pedidos confirmados se enviarán a este email
            </p>
          </div>

          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Guardando...' : saved ? '¡Guardado!' : 'Guardar'}
          </Button>
        </div>
      </div>
    </div>
  );
}
