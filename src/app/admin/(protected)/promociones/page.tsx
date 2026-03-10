'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { Users, Mail, FileText, Send, CheckCircle, Image as ImageIcon, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Cliente {
  id: string;
  nombre: string | null;
  email: string | null;
  aceptar_promociones: boolean | null;
}

interface Promocion {
  id: string;
  fecha_hora: string;
  texto_promocion: string;
  numero_envios: number;
  imagen_url: string | null;
  created_at: string;
}

export default function PromocionesPage() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [promociones, setPromociones] = useState<Promocion[]>([]);
  const [savingPromo, setSavingPromo] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  
  const [promoTexto, setPromoTexto] = useState('');

  useEffect(() => {
    async function fetchData() {
      try {
        const [clientesRes, promocionesRes] = await Promise.all([
          fetch('/api/admin/clientes'),
          fetch('/api/admin/promociones'),
        ]);
        
        if (clientesRes.ok) {
          const data = await clientesRes.json();
          setClientes(data.clientes || []);
        }
        if (promocionesRes.ok) {
          const data = await promocionesRes.json();
          setPromociones(data.promociones || []);
        }
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        // Data loaded
      }
    }
    fetchData();
  }, []);

  const clientesConPromociones = clientes.filter(c => c.aceptar_promociones && c.email);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        alert('La imagen no puede exceder 10MB');
        return;
      }
      setSelectedImage(file);
      // Create preview URL
      const reader = new FileReader();
      reader.onload = (e) => setPreviewImage(e.target?.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveImage = () => {
    setSelectedImage(null);
    setPreviewImage(null);
  };

  const handleGuardarPromocion = async () => {
    if (!promoTexto) return;
    
    setSavingPromo(true);
    try {
      // Upload image to R2 if selected
      let imagenUrl: string | null = null;
      if (selectedImage) {
        setUploadingImage(true);
        try {
          const formData = new FormData();
          formData.append('file', selectedImage);
          const uploadRes = await fetch('/api/admin/upload-image', {
            method: 'POST',
            body: formData,
          });
          if (!uploadRes.ok) {
            const data = await uploadRes.json().catch(() => ({})) as { error?: string };
            throw new Error(data.error ?? 'Error al subir imagen');
          }
          const data = await uploadRes.json() as { publicUrl?: string };
          if (!data.publicUrl) throw new Error('No se recibió la URL de la imagen');
          imagenUrl = data.publicUrl;
        } finally {
          setUploadingImage(false);
        }
      }

      const res = await fetch('/api/admin/promociones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          texto_promocion: promoTexto,
          imagen_url: imagenUrl,
        }),
      });
      
      if (res.ok) {
        const data = await res.json();
        setPromociones(prev => [data.promocion, ...prev]);
        setPromoTexto('');
        handleRemoveImage();
        setShowSuccess(true);
        setTimeout(() => setShowSuccess(false), 3000);
      }
    } catch (error) {
      console.error('Error creating promocion:', error);
      alert('Error al crear la promoción');
    } finally {
      setSavingPromo(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header con contador */}
      <div className="bg-gradient-to-r from-primary to-primary/80 rounded-xl p-6 shadow-lg">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Promociones</h1>
            <p className="text-white/80 text-sm mt-1">Envía promociones a tus clientes</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white/20 rounded-lg px-4 py-3 text-center">
              <Users className="w-6 h-6 text-white mx-auto mb-1" />
              <span className="text-2xl font-bold text-white">{clientes.length}</span>
              <p className="text-white/80 text-xs">Total</p>
            </div>
            <div className="bg-white/20 rounded-lg px-4 py-3 text-center">
              <Mail className="w-6 h-6 text-white mx-auto mb-1" />
              <span className="text-2xl font-bold text-white">{clientesConPromociones.length}</span>
              <p className="text-white/80 text-xs">Para enviar</p>
            </div>
          </div>
        </div>
      </div>

      {/* Sección crear promoción */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <Send className="w-5 h-5" />
          Nueva Promoción
        </h2>
        
        <div className="space-y-4">
          <div>
            <label htmlFor="promo_texto" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Mensaje de la promoción
            </label>
            <textarea
              id="promo_texto"
              placeholder="Ej: ¡20% de descuento en tu próximo pedido! 🍕"
              value={promoTexto}
              onChange={(e) => setPromoTexto(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white resize-none"
            />
          </div>

          {/* Imagen de la promoción */}
          <div>
            <label htmlFor="promo-image" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Imagen de la promoción (opcional)
            </label>
            {previewImage ? (
              <div className="relative group rounded-lg overflow-hidden border h-48 mb-2">
                <Image
                  src={previewImage}
                  alt="Vista previa de la promoción"
                  fill
                  style={{objectFit:"contain"}}
                  className="bg-gray-50"
                />
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <button
                    type="button"
                    onClick={handleRemoveImage}
                    className="px-3 py-1.5 bg-red-600 text-white rounded-md text-sm hover:bg-red-700"
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            ) : (
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-gray-400 transition-colors">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageSelect}
                  className="hidden"
                  id="promo-image"
                />
                <label htmlFor="promo-image" className="cursor-pointer">
                  <ImageIcon className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                  <span className="text-sm text-gray-500">
                    Click para seleccionar una imagen
                  </span>
                  <p className="text-xs text-gray-400 mt-1">
                    JPEG, PNG, WEBP (max 10MB)
                  </p>
                </label>
              </div>
            )}
            <p className="text-xs text-gray-500 mt-1">
              Esta imagen se mostrará adjunta en el correo electrónico
            </p>
          </div>

          {/* Vista previa de clientes */}
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Esta promoción se enviará a:
              </span>
              <span className="text-lg font-bold text-primary">{clientesConPromociones.length} clientes</span>
            </div>
            {clientesConPromociones.length > 0 ? (
              <div className="flex flex-wrap gap-2 mt-3">
                {clientesConPromociones.slice(0, 10).map((c) => (
                  <span 
                    key={c.id} 
                    className="inline-flex items-center gap-1 px-2 py-1 bg-white dark:bg-gray-600 rounded-full text-xs text-gray-700 dark:text-gray-200"
                  >
                    <Mail className="w-3 h-3" />
                    {c.email}
                  </span>
                ))}
                {clientesConPromociones.length > 10 && (
                  <span className="inline-flex items-center px-2 py-1 bg-gray-200 dark:bg-gray-500 rounded-full text-xs text-gray-700 dark:text-gray-200">
                    +{clientesConPromociones.length - 10} más
                  </span>
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                No hay clientes con promociones activadas
              </p>
            )}
          </div>

          <div className="flex justify-end">
            {showSuccess ? (
              <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                <CheckCircle className="w-5 h-5" />
                <span className="font-medium">Promoción guardada correctamente</span>
              </div>
            ) : (
              <Button 
                onClick={handleGuardarPromocion}
                disabled={!promoTexto || savingPromo || clientesConPromociones.length === 0}
                className="bg-primary hover:bg-primary/90"
              >
                {savingPromo ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {uploadingImage ? 'Subiendo imagen...' : 'Enviando...'}
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Guardar y Enviar
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Historial de promociones */}
      {promociones.length > 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl border shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Última Promoción
          </h2>
          <div className="space-y-3">
            {promociones.slice(0, 1).map((promo) => (
              <div key={promo.id} className="p-4 bg-gray-50 dark:bg-gray-700/30 rounded-lg">
                {promo.imagen_url && (
                  <div className="mb-3">
                    <Image 
                      src={promo.imagen_url} 
                      alt="Imagen de promoción" 
                      width={128}
                      height={128}
                      className="max-h-32 rounded-lg object-contain bg-white"
                    />
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="font-medium text-gray-900 dark:text-white">{promo.texto_promocion}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {new Date(promo.fecha_hora).toLocaleString('es-ES')}
                    </p>
                  </div>
                  <div className="text-right px-4">
                    <span className="text-2xl font-bold text-primary">{promo.numero_envios}</span>
                    <p className="text-xs text-gray-500 dark:text-gray-400">clientes</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl border p-12 shadow-sm text-center">
          <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500 dark:text-gray-400">No hay promociones guardadas</p>
        </div>
      )}
    </div>
  );
}
