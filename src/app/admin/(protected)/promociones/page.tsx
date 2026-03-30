'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import {
  Users, Mail, FileText, Send, CheckCircle, Image as ImageIcon, Loader2,
  ShoppingBag, Plus, Trash2, Minus, ChevronDown, ChevronUp, Clock, CalendarOff, Pencil, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { fetchWithCsrf, getCsrfToken } from '@/lib/csrf-client';
import { logClientError } from '@/lib/client-error';
import { useLanguage } from '@/lib/language-context';
import type { Language } from '@/lib/language-context';
import { useAdmin } from '@/lib/admin-context';
import { t } from '@/lib/translations';
import { formatDateTime } from '@/lib/format-date';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

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
  fecha_fin: string | null;
  created_at: string;
}

interface TgtgItem {
  id: string;
  titulo: string;
  descripcion: string | null;
  imagenUrl: string | null;
  precioOriginal: number;
  precioDescuento: number;
  cuponesTotal: number;
  cuponesDisponibles: number;
  orden: number;
  reservasCount: number;
}

interface TgtgPromo {
  id: string;
  horaRecogidaInicio: string;
  horaRecogidaFin: string;
  numeroEnvios: number;
  createdAt: string;
  items: TgtgItem[];
}

interface TgtgReserva {
  id: string;
  itemId: string;
  email: string;
  nombre: string | null;
  createdAt: string;
}

interface TgtgItemForm {
  titulo: string;
  descripcion: string;
  imagenUrl: string | null;
  precioOriginal: string;
  precioDescuento: string;
  cuponesTotal: string;
  imageFile: File | null;
  previewUrl: string | null;
  uploading: boolean;
}

// ─────────────────────────────────────────────────────────────
// Image optimization
// ─────────────────────────────────────────────────────────────

const MAX_WIDTH = 480;
const MAX_HEIGHT = 480;
const QUALITY = 0.8;

async function optimizeImage(file: File): Promise<{ file: File; type: string }> {
  return new Promise((resolve, reject) => {
    const img = document.createElement('img');
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;
      if (width > MAX_WIDTH) { height = (height * MAX_WIDTH) / width; width = MAX_WIDTH; }
      if (height > MAX_HEIGHT) { width = (width * MAX_HEIGHT) / height; height = MAX_HEIGHT; }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas error')); return; }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => {
        if (!blob) { reject(new Error('Compress error')); return; }
        resolve({ file: new File([blob], file.name, { type: 'image/webp' }), type: 'image/webp' });
      }, 'image/webp', QUALITY);
    };
    img.onerror = () => reject(new Error('Load error'));
    img.src = URL.createObjectURL(file);
  });
}

// ─────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────

export default function PromocionesPage() {
  const { language } = useLanguage();
  const { empresaId, overrideEmpresaId } = useAdmin();
  const effectiveEmpresaId = overrideEmpresaId || empresaId;

  const [activeTab, setActiveTab] = useState<'normal' | 'tgtg'>('normal');

  // ── Normal promo state ──────────────────────────────────────
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [promociones, setPromociones] = useState<Promocion[]>([]);
  const [savingPromo, setSavingPromo] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [promoTexto, setPromoTexto] = useState('');
  const [promoFechaFin, setPromoFechaFin] = useState('');

  // ── TGTG state ─────────────────────────────────────────────
  const [tgtgPromo, setTgtgPromo] = useState<TgtgPromo | null>(null);
  const [tgtgLoading, setTgtgLoading] = useState(false);
  const [tgtgSaving, setTgtgSaving] = useState(false);
  const [tgtgSuccess, setTgtgSuccess] = useState(false);
  const [horaInicio, setHoraInicio] = useState('18:00');
  const [horaFin, setHoraFin] = useState('20:00');
  const [tgtgItems, setTgtgItems] = useState<TgtgItemForm[]>([createEmptyItem()]);
  const [reservasByItem, setReservasByItem] = useState<Record<string, TgtgReserva[]>>({});
  const [expandedReservas, setExpandedReservas] = useState<Set<string>>(new Set());
  const [adjustingItem, setAdjustingItem] = useState<string | null>(null);
  const [editingHoras, setEditingHoras] = useState(false);
  const [editHoraInicio, setEditHoraInicio] = useState('');
  const [editHoraFin, setEditHoraFin] = useState('');
  const [savingHoras, setSavingHoras] = useState(false);

  function createEmptyItem(): TgtgItemForm {
    return {
      titulo: '', descripcion: '', imagenUrl: null,
      precioOriginal: '', precioDescuento: '', cuponesTotal: '',
      imageFile: null, previewUrl: null, uploading: false,
    };
  }

  // ── Fetch data ─────────────────────────────────────────────
  useEffect(() => {
    async function fetchData() {
      try {
        const [clientesRes, promocionesRes, tgtgRes] = await Promise.all([
          fetch(`/api/admin/clientes?empresaId=${effectiveEmpresaId}`),
          fetch(`/api/admin/promociones?empresaId=${effectiveEmpresaId}`),
          fetch(`/api/admin/tgtg?empresaId=${effectiveEmpresaId}`),
        ]);
        if (clientesRes.ok) {
          const data = await clientesRes.json() as { clientes?: Cliente[] };
          setClientes(data.clientes || []);
        }
        if (promocionesRes.ok) {
          const data = await promocionesRes.json() as { promociones?: Promocion[] };
          setPromociones(data.promociones || []);
        }
        if (tgtgRes.ok) {
          const data = await tgtgRes.json() as { tgtgPromo?: TgtgPromo | null };
          setTgtgPromo(data.tgtgPromo || null);
        }
      } catch (error) {
        logClientError(error, 'fetchPromoData');
      }
    }
    fetchData();
  }, [effectiveEmpresaId]);

  const clientesConPromociones = clientes.filter(c => c.aceptar_promociones && c.email);

  // ── Normal promo handlers ───────────────────────────────────

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedImage(file);
    const reader = new FileReader();
    reader.onload = (ev) => setPreviewImage(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleRemoveImage = () => { setSelectedImage(null); setPreviewImage(null); };

  const handleGuardarPromocion = async () => {
    if (!promoTexto) return;
    setSavingPromo(true);
    try {
      let imagenUrl: string | null = null;
      if (selectedImage) {
        setUploadingImage(true);
        try {
          const optimized = await optimizeImage(selectedImage);
          const formData = new FormData();
          formData.append('file', optimized.file);
          const csrfToken = getCsrfToken();
          const uploadRes = await fetch('/api/admin/upload-image', {
            method: 'POST',
            headers: csrfToken ? { 'x-csrf-token': csrfToken } : {},
            body: formData,
          });
          if (!uploadRes.ok) throw new Error(t("imageUploadError", language));
          const data = await uploadRes.json() as { publicUrl?: string };
          if (!data.publicUrl) throw new Error(t("imageUrlError", language));
          imagenUrl = data.publicUrl;
        } finally {
          setUploadingImage(false);
        }
      }
      const res = await fetchWithCsrf(`/api/admin/promociones?empresaId=${effectiveEmpresaId}`, {
        method: 'POST',
        body: JSON.stringify({
          texto_promocion: promoTexto,
          imagen_url: imagenUrl,
          fecha_fin: promoFechaFin ? new Date(promoFechaFin).toISOString() : null,
        }),
      });
      if (res.ok) {
        const data = await res.json() as { promocion: Promocion };
        setPromociones(prev => [data.promocion, ...prev]);
        setPromoTexto('');
        setPromoFechaFin('');
        handleRemoveImage();
        setShowSuccess(true);
        setTimeout(() => setShowSuccess(false), 3000);
      }
    } catch (error) {
      logClientError(error, 'handleCreatePromocion');
      alert(t("promoCreateError", language));
    } finally {
      setSavingPromo(false);
    }
  };

  // ── TGTG handlers ───────────────────────────────────────────

  const handleTgtgItemChange = (index: number, field: keyof TgtgItemForm, value: string) => {
    setTgtgItems(prev => prev.map((item, i) => i === index ? { ...item, [field]: value } : item));
  };

  const handleTgtgImageSelect = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setTgtgItems(prev => prev.map((item, i) =>
        i === index ? { ...item, imageFile: file, previewUrl: ev.target?.result as string } : item
      ));
    };
    reader.readAsDataURL(file);
  };

  const handleTgtgRemoveImage = (index: number) => {
    setTgtgItems(prev => prev.map((item, i) =>
      i === index ? { ...item, imageFile: null, previewUrl: null, imagenUrl: null } : item
    ));
  };

  const handleAddItem = () => setTgtgItems(prev => [...prev, createEmptyItem()]);
  const handleRemoveItem = (index: number) => {
    if (tgtgItems.length <= 1) return;
    setTgtgItems(prev => prev.filter((_, i) => i !== index));
  };

  const uploadTgtgImage = async (index: number, file: File, csrfToken: string | null): Promise<string | null> => {
    setTgtgItems(prev => prev.map((item, i) => i === index ? { ...item, uploading: true } : item));
    try {
      const optimized = await optimizeImage(file);
      const formData = new FormData();
      formData.append('file', optimized.file);
      const uploadRes = await fetch('/api/admin/upload-image', {
        method: 'POST',
        headers: csrfToken ? { 'x-csrf-token': csrfToken } : {},
        body: formData,
      });
      if (!uploadRes.ok) return null;
      const data = await uploadRes.json() as { publicUrl?: string };
      return data.publicUrl ?? null;
    } finally {
      setTgtgItems(prev => prev.map((item, i) => i === index ? { ...item, uploading: false } : item));
    }
  };

  const handleSendTgtgCampaign = async () => {
    const valid = tgtgItems.every(item =>
      item.titulo.trim() &&
      Number(item.precioOriginal) > 0 &&
      Number(item.precioDescuento) > 0 &&
      Number(item.cuponesTotal) > 0
    );
    if (!valid) {
      alert('Completa todos los campos requeridos de cada oferta.');
      return;
    }
    if (clientesConPromociones.length === 0) return;

    setTgtgSaving(true);
    try {
      const csrfToken = getCsrfToken();
      // Upload images in parallel
      const uploadedUrls = await Promise.all(
        tgtgItems.map(async (item, index) => {
          if (item.imageFile) {
            return await uploadTgtgImage(index, item.imageFile, csrfToken);
          }
          return item.imagenUrl;
        })
      );

      const itemsPayload = tgtgItems.map((item, index) => ({
        titulo: item.titulo.trim(),
        descripcion: item.descripcion.trim() || null,
        imagen_url: uploadedUrls[index] ?? null,
        precio_original: Number(item.precioOriginal),
        precio_descuento: Number(item.precioDescuento),
        cupones_total: Number(item.cuponesTotal),
      }));

      const res = await fetchWithCsrf(`/api/admin/tgtg?empresaId=${effectiveEmpresaId}`, {
        method: 'POST',
        body: JSON.stringify({
          hora_recogida_inicio: horaInicio,
          hora_recogida_fin: horaFin,
          items: itemsPayload,
        }),
      });

      if (res.ok) {
        const data = await res.json() as { tgtgPromo: TgtgPromo };
        // Refresh to get items
        const refreshRes = await fetch(`/api/admin/tgtg?empresaId=${effectiveEmpresaId}`);
        if (refreshRes.ok) {
          const refreshData = await refreshRes.json() as { tgtgPromo?: TgtgPromo | null };
          setTgtgPromo(refreshData.tgtgPromo || null);
        } else {
          setTgtgPromo(data.tgtgPromo);
        }
        setTgtgItems([createEmptyItem()]);
        setTgtgSuccess(true);
        setTimeout(() => setTgtgSuccess(false), 3000);
      } else {
        alert('Error al crear la campaña TGTG.');
      }
    } catch (error) {
      logClientError(error, 'handleSendTgtgCampaign');
      alert('Error al crear la campaña.');
    } finally {
      setTgtgSaving(false);
    }
  };

  const handleAdjustCupones = async (itemId: string, delta: number) => {
    setAdjustingItem(itemId);
    try {
      const res = await fetchWithCsrf(
        `/api/admin/tgtg/items/${encodeURIComponent(itemId)}/cupones?empresaId=${effectiveEmpresaId}`,
        { method: 'PATCH', body: JSON.stringify({ delta }) }
      );
      if (res.ok) {
        const data = await res.json() as { item: TgtgItem };
        setTgtgPromo(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            items: prev.items.map(item =>
              item.id === itemId
                ? { ...item, cuponesDisponibles: data.item.cuponesDisponibles }
                : item
            ),
          };
        });
      }
    } catch (error) {
      logClientError(error, 'handleAdjustCupones');
    } finally {
      setAdjustingItem(null);
    }
  };

  const handleToggleReservas = async (itemId: string) => {
    if (expandedReservas.has(itemId)) {
      setExpandedReservas(prev => { const s = new Set(prev); s.delete(itemId); return s; });
      return;
    }
    if (!tgtgPromo) return;
    try {
      const res = await fetch(
        `/api/admin/tgtg/reservas?tgtgPromoId=${tgtgPromo.id}&empresaId=${effectiveEmpresaId}`
      );
      if (res.ok) {
        const data = await res.json() as { reservas: TgtgReserva[] };
        const byItem = data.reservas.filter(r => r.itemId === itemId);
        setReservasByItem(prev => ({ ...prev, [itemId]: byItem }));
        setExpandedReservas(prev => new Set([...prev, itemId]));
      }
    } catch (error) {
      logClientError(error, 'handleToggleReservas');
    }
  };

  const handleStartEditHoras = () => {
    if (!tgtgPromo) return;
    setEditHoraInicio(tgtgPromo.horaRecogidaInicio);
    setEditHoraFin(tgtgPromo.horaRecogidaFin);
    setEditingHoras(true);
  };

  const handleCancelEditHoras = () => setEditingHoras(false);

  const handleSaveHoras = async () => {
    if (!tgtgPromo) return;
    setSavingHoras(true);
    try {
      const res = await fetchWithCsrf(
        `/api/admin/tgtg/${encodeURIComponent(tgtgPromo.id)}/horas?empresaId=${effectiveEmpresaId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            hora_recogida_inicio: editHoraInicio,
            hora_recogida_fin: editHoraFin,
          }),
        }
      );
      if (res.ok) {
        const data = await res.json() as { tgtgPromo: { horaRecogidaInicio: string; horaRecogidaFin: string } };
        setTgtgPromo(prev => prev ? {
          ...prev,
          horaRecogidaInicio: data.tgtgPromo.horaRecogidaInicio,
          horaRecogidaFin: data.tgtgPromo.horaRecogidaFin,
        } : prev);
        setEditingHoras(false);
      } else {
        const err = await res.json() as { error?: string };
        alert(err.error ?? 'Error al guardar las horas');
      }
    } catch (error) {
      logClientError(error, 'handleSaveHoras');
      alert('Error al guardar las horas');
    } finally {
      setSavingHoras(false);
    }
  };

  const anyItemUploading = tgtgItems.some(i => i.uploading);

  // ─────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────

  return (
    <div className="pt-16 lg:pt-0 px-6 py-6 space-y-6">
      {/* Header */}
      <div className="bg-primary rounded-lg p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-primary-foreground">{t("promotionsTitle", language)}</h1>
            <p className="text-primary-foreground/80 text-sm mt-1">{t("promotionsSubtitle", language)}</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-primary-foreground/20 rounded-lg px-4 py-3 text-center">
              <Users className="w-6 h-6 text-primary-foreground mx-auto mb-1" />
              <span className="text-2xl font-semibold text-primary-foreground">{clientes.length}</span>
              <p className="text-primary-foreground/80 text-xs">{t("total", language)}</p>
            </div>
            <div className="bg-primary-foreground/20 rounded-lg px-4 py-3 text-center">
              <Mail className="w-6 h-6 text-primary-foreground mx-auto mb-1" />
              <span className="text-2xl font-semibold text-primary-foreground" aria-live="polite">{clientesConPromociones.length}</span>
              <p className="text-primary-foreground/80 text-xs">{t("toSend", language)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-muted rounded-lg p-1 w-fit">
        <button
          onClick={() => setActiveTab('normal')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[44px] ${
            activeTab === 'normal'
              ? 'bg-card text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <span className="flex items-center gap-2"><Send className="w-4 h-4" />{t("newPromotion", language)}</span>
        </button>
        <button
          onClick={() => setActiveTab('tgtg')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[44px] ${
            activeTab === 'tgtg'
              ? 'bg-card text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <span className="flex items-center gap-2"><ShoppingBag className="w-4 h-4" />TooGoodToGo</span>
        </button>
      </div>

      {/* ── TAB: Normal promo ────────────────────────────────── */}
      {activeTab === 'normal' && (
        <div className="bg-card rounded-lg border shadow-elegant p-6 space-y-4">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Send className="w-5 h-5" />
            {t("newPromotion", language)}
          </h2>

          <div>
            <label htmlFor="promo_texto" className="block text-sm font-medium text-foreground mb-1">
              {t("promoMessageLabel", language)}
            </label>
            <Textarea
              id="promo_texto"
              placeholder="Ej: ¡20% de descuento en tu próximo pedido!"
              value={promoTexto}
              onChange={(e) => setPromoTexto(e.target.value)}
              rows={3}
            />
          </div>

          {/* Fecha fin — obligatoria */}
          <div>
            <label htmlFor="promo_fecha_fin" className="block text-sm font-medium text-foreground mb-1">
              {t("promoFechaFin", language)} <span className="text-destructive" aria-hidden="true">*</span>
            </label>
            <input
              id="promo_fecha_fin"
              type="date"
              required
              value={promoFechaFin}
              onChange={e => setPromoFechaFin(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
          </div>

          {/* Image upload */}
          <div>
            <label htmlFor="promo-image" className="block text-sm font-medium text-foreground mb-1">
              {t("promoImageLabel", language)}
            </label>
            {previewImage ? (
              <div className="relative group rounded-lg overflow-hidden border h-48 mb-2">
                <Image src={previewImage} alt="Vista previa" fill className="object-contain bg-muted" />
                <div className="absolute inset-0 bg-overlay opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <button type="button" onClick={handleRemoveImage}
                    className="px-3 py-1.5 bg-destructive text-destructive-foreground rounded-md text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                    {t("delete", language)}
                  </button>
                </div>
              </div>
            ) : (
              <div className="border-2 border-dashed border-border rounded-lg p-4 text-center hover:border-muted-foreground transition-colors">
                <input type="file" accept="image/*" onChange={handleImageSelect} className="hidden" id="promo-image" />
                <label htmlFor="promo-image" className="cursor-pointer">
                  <ImageIcon className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                  <span className="text-sm text-muted-foreground">{t("clickToSelectImage", language)}</span>
                  <p className="text-xs text-muted-foreground/50 mt-1">JPEG, PNG, WEBP (max 10MB)</p>
                </label>
              </div>
            )}
          </div>

          {/* Clients preview */}
          <div className="bg-muted rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-foreground">{t("promoSendTo", language)}</span>
              <span className="text-lg font-bold text-primary">{clientesConPromociones.length} {t("clients", language)}</span>
            </div>
            {clientesConPromociones.length > 0 ? (
              <div className="flex flex-wrap gap-2 mt-3">
                {clientesConPromociones.slice(0, 10).map((c) => (
                  <span key={c.id} className="inline-flex items-center gap-1 px-2 py-1 bg-card rounded-full text-xs text-foreground">
                    <Mail className="w-3 h-3" />{c.email}
                  </span>
                ))}
                {clientesConPromociones.length > 10 && (
                  <span className="inline-flex items-center px-2 py-1 bg-muted rounded-full text-xs text-foreground">
                    +{clientesConPromociones.length - 10} {t("moreLabel", language)}
                  </span>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground mt-2" role="status" aria-live="polite">{t("noClientsWithPromos", language)}</p>
            )}
          </div>

          <div className="flex justify-end">
            {showSuccess ? (
              <div className="flex items-center gap-2 text-primary" role="status" aria-live="polite">
                <CheckCircle className="w-5 h-5" />
                <span className="font-medium">{t("promoSavedSuccess", language)}</span>
              </div>
            ) : (
              <Button
                onClick={handleGuardarPromocion}
                disabled={!promoTexto || !promoFechaFin || savingPromo || clientesConPromociones.length === 0}
                className="bg-primary hover:bg-primary/90"
              >
                {savingPromo ? (
                  <><Loader2 className="w-4 h-4 animate-spin" />{uploadingImage ? t("uploadingImageProgress", language) : t("sendingProgress", language)}</>
                ) : (
                  <><Send className="w-4 h-4" />{t("saveAndSend", language)}</>
                )}
              </Button>
            )}
          </div>

          {/* Last promo */}
          {promociones.length > 0 ? (
            <div className="border-t pt-6 space-y-3">
              <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
                <FileText className="w-4 h-4" />{t("lastPromotion", language)}
              </h3>
              {promociones.slice(0, 1).map((promo) => (
                <div key={promo.id} className="p-4 bg-muted rounded-lg">
                  {promo.imagen_url && (
                    <div className="mb-3">
                      <Image src={promo.imagen_url} alt="Imagen de promoción" width={128} height={128} className="max-h-32 rounded-lg object-contain bg-card" />
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <p className="font-medium text-foreground">{promo.texto_promocion}</p>
                      <p className="text-sm text-muted-foreground">{formatDateTime(promo.fecha_hora)}</p>
                      {promo.fecha_fin && (
                        <p className="text-xs text-amber-600 mt-0.5">
                          ⏰ {t("promoFechaFinEmail", language)}: {new Date(promo.fecha_fin).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })}
                        </p>
                      )}
                    </div>
                    <div className="text-right px-4">
                      <span className="text-2xl font-bold text-primary">{promo.numero_envios}</span>
                      <p className="text-xs text-muted-foreground">{t("clients", language)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="border-t pt-6 text-center" role="status" aria-live="polite">
              <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">{t("noPromotions", language)}</p>
            </div>
          )}
        </div>
      )}

      {/* ── TAB: TooGoodToGo ────────────────────────────────── */}
      {activeTab === 'tgtg' && (
        <div className="space-y-6">
          {/* Form */}
          <div className="bg-card rounded-lg border shadow-elegant p-6 space-y-6">
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <ShoppingBag className="w-5 h-5" />
              {t("tgtgNewPromo", language)}
            </h2>

            {/* Pickup time */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="hora-inicio" className="block text-sm font-medium text-foreground mb-1">
                  <Clock className="w-3.5 h-3.5 inline mr-1" />{t("tgtgPickupFrom", language)}
                </label>
                <input
                  id="hora-inicio"
                  type="time"
                  value={horaInicio}
                  onChange={e => setHoraInicio(e.target.value)}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                />
              </div>
              <div>
                <label htmlFor="hora-fin" className="block text-sm font-medium text-foreground mb-1">
                  <Clock className="w-3.5 h-3.5 inline mr-1" />{t("tgtgPickupTo", language)}
                </label>
                <input
                  id="hora-fin"
                  type="time"
                  value={horaFin}
                  onChange={e => setHoraFin(e.target.value)}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                />
              </div>
            </div>

            {/* Items */}
            <div className="space-y-4">
              {tgtgItems.map((item, index) => (
                <TgtgItemFormCard
                  key={index}
                  index={index}
                  item={item}
                  language={language}
                  canRemove={tgtgItems.length > 1}
                  onFieldChange={handleTgtgItemChange}
                  onImageSelect={handleTgtgImageSelect}
                  onRemoveImage={handleTgtgRemoveImage}
                  onRemoveItem={handleRemoveItem}
                />
              ))}
            </div>

            <button
              type="button"
              onClick={handleAddItem}
              className="flex items-center gap-2 text-sm text-primary hover:text-primary/80 font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[44px]"
            >
              <Plus className="w-4 h-4" />{t("tgtgAddItem", language)}
            </button>

            {/* Clients count */}
            <div className="bg-muted rounded-lg px-4 py-3 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t("promoSendTo", language)}</span>
              <span className="font-bold text-primary">{clientesConPromociones.length} {t("clients", language)}</span>
            </div>

            <div className="flex justify-end">
              {tgtgSuccess ? (
                <div className="flex items-center gap-2 text-primary" role="status" aria-live="polite">
                  <CheckCircle className="w-5 h-5" />
                  <span className="font-medium">{t("promoSavedSuccess", language)}</span>
                </div>
              ) : (
                <Button
                  onClick={handleSendTgtgCampaign}
                  disabled={tgtgSaving || anyItemUploading || clientesConPromociones.length === 0}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  {tgtgSaving || anyItemUploading ? (
                    <><Loader2 className="w-4 h-4 animate-spin" />{t("sendingProgress", language)}</>
                  ) : (
                    <><Send className="w-4 h-4" />{t("tgtgSendCampaign", language)}</>
                  )}
                </Button>
              )}
            </div>
          </div>

          {/* Active campaign */}
          {tgtgLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : tgtgPromo ? (() => {
            const promoDate = new Date(tgtgPromo.createdAt).toISOString().split('T')[0];
            const pickupEnd = new Date(`${promoDate}T${tgtgPromo.horaRecogidaFin}:00`);
            const isExpired = new Date() > pickupEnd;
            return (
            <div className="bg-card rounded-lg border shadow-elegant p-6 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                  <ShoppingBag className={`w-5 h-5 ${isExpired ? 'text-muted-foreground' : 'text-green-600'}`} />
                  {isExpired ? t("tgtgNoPromo", language) : t("tgtgActiveCampaign", language)}
                </h2>
                {editingHoras ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    <input
                      type="time"
                      value={editHoraInicio}
                      onChange={e => setEditHoraInicio(e.target.value)}
                      aria-label={t("tgtgPickupFrom", language)}
                      className="h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    />
                    <span className="text-muted-foreground text-sm">–</span>
                    <input
                      type="time"
                      value={editHoraFin}
                      onChange={e => setEditHoraFin(e.target.value)}
                      aria-label={t("tgtgPickupTo", language)}
                      className="h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    />
                    <button
                      onClick={handleSaveHoras}
                      disabled={savingHoras}
                      aria-label={t("save", language)}
                      className="h-8 px-3 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 flex items-center gap-1 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 min-h-[44px]"
                    >
                      {savingHoras ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                      {t("save", language)}
                    </button>
                    <button
                      onClick={handleCancelEditHoras}
                      disabled={savingHoras}
                      aria-label={t("cancel", language)}
                      className="h-8 px-2 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted flex items-center outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 min-h-[44px]"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className={`text-xs flex items-center gap-1 ${isExpired ? 'text-destructive/70' : 'text-muted-foreground'}`}>
                      <Clock className="w-3.5 h-3.5" />
                      {tgtgPromo.horaRecogidaInicio} – {tgtgPromo.horaRecogidaFin}
                      {isExpired && <span className="ml-1">(finalizada)</span>}
                    </span>
                    <button
                      onClick={handleStartEditHoras}
                      aria-label="Editar horas de recogida"
                      className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[44px] min-w-[44px] flex items-center justify-center"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              <div className="space-y-4">
                {tgtgPromo.items.map((item) => (
                  <TgtgItemAdminCard
                    key={item.id}
                    item={item}
                    language={language}
                    adjusting={adjustingItem === item.id}
                    reservas={reservasByItem[item.id] ?? null}
                    expanded={expandedReservas.has(item.id)}
                    onAdjust={handleAdjustCupones}
                    onToggleReservas={handleToggleReservas}
                  />
                ))}
              </div>
            </div>
            );
          })() : (
            <div className="bg-card rounded-lg border p-12 shadow-elegant text-center" role="status" aria-live="polite">
              <CalendarOff className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">{t("tgtgNoPromo", language)}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────

interface TgtgItemFormCardProps {
  index: number;
  item: TgtgItemForm;
  language: Language;
  canRemove: boolean;
  onFieldChange: (index: number, field: keyof TgtgItemForm, value: string) => void;
  onImageSelect: (index: number, e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveImage: (index: number) => void;
  onRemoveItem: (index: number) => void;
}

function TgtgItemFormCard({
  index, item, language, canRemove,
  onFieldChange, onImageSelect, onRemoveImage, onRemoveItem,
}: TgtgItemFormCardProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="border border-border rounded-lg p-4 space-y-3 relative">
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-semibold text-foreground">Oferta {index + 1}</span>
        {canRemove && (
          <button
            type="button"
            onClick={() => onRemoveItem(index)}
            aria-label={t("tgtgRemoveItem", language)}
            className="p-1.5 text-destructive hover:bg-destructive/10 rounded-md transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Title */}
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">{t("tgtgItemTitle", language)} *</label>
        <input
          type="text"
          maxLength={200}
          value={item.titulo}
          onChange={e => onFieldChange(index, 'titulo', e.target.value)}
          placeholder="Ej: Bolsa sorpresa panadería"
          className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        />
      </div>

      {/* Description */}
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">{t("tgtgItemDescription", language)}</label>
        <input
          type="text"
          maxLength={500}
          value={item.descripcion}
          onChange={e => onFieldChange(index, 'descripcion', e.target.value)}
          placeholder="Ej: Pan, bollería y repostería del día"
          className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        />
      </div>

      {/* Prices + coupons */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">{t("tgtgItemPriceOriginal", language)} *</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={item.precioOriginal}
            onChange={e => onFieldChange(index, 'precioOriginal', e.target.value)}
            placeholder="15.00"
            className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">{t("tgtgItemPriceDiscount", language)} *</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={item.precioDescuento}
            onChange={e => onFieldChange(index, 'precioDescuento', e.target.value)}
            placeholder="5.00"
            className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">{t("tgtgItemCoupons", language)} *</label>
          <input
            type="number"
            min="1"
            step="1"
            value={item.cuponesTotal}
            onChange={e => onFieldChange(index, 'cuponesTotal', e.target.value)}
            placeholder="10"
            className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
        </div>
      </div>

      {/* Image */}
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">{t("tgtgItemImage", language)}</label>
        {item.previewUrl ? (
          <div className="relative group rounded-lg overflow-hidden border h-32">
            <Image src={item.previewUrl} alt="Vista previa" fill className="object-cover" />
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <button type="button" onClick={() => onRemoveImage(index)}
                className="px-2 py-1 bg-destructive text-destructive-foreground rounded text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                {t("delete", language)}
              </button>
            </div>
          </div>
        ) : (
          <div className="border-2 border-dashed border-border rounded-lg p-3 text-center hover:border-muted-foreground transition-colors cursor-pointer"
            onClick={() => fileInputRef.current?.click()}>
            <input ref={fileInputRef} type="file" accept="image/*"
              onChange={e => onImageSelect(index, e)} className="hidden" />
            <ImageIcon className="w-6 h-6 text-muted-foreground mx-auto mb-1" />
            <span className="text-xs text-muted-foreground">{t("clickToSelectImage", language)}</span>
          </div>
        )}
        {item.uploading && (
          <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
            <Loader2 className="w-3 h-3 animate-spin" />{t("uploadingImageProgress", language)}
          </div>
        )}
      </div>
    </div>
  );
}

interface TgtgItemAdminCardProps {
  item: TgtgItem;
  language: Language;
  adjusting: boolean;
  reservas: TgtgReserva[] | null;
  expanded: boolean;
  onAdjust: (itemId: string, delta: number) => void;
  onToggleReservas: (itemId: string) => void;
}

function TgtgItemAdminCard({
  item, language, adjusting, reservas, expanded, onAdjust, onToggleReservas,
}: TgtgItemAdminCardProps) {
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="p-4 space-y-3">
        <div className="flex items-start gap-3">
          {item.imagenUrl && (
            <Image
              src={item.imagenUrl}
              alt={item.titulo}
              width={64}
              height={64}
              className="rounded-lg object-cover flex-shrink-0 bg-muted"
            />
          )}
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-foreground truncate">{item.titulo}</p>
            {item.descripcion && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{item.descripcion}</p>}
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-muted-foreground line-through">€{Number(item.precioOriginal).toFixed(2)}</span>
              <span className="text-sm font-bold text-green-600">€{Number(item.precioDescuento).toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Coupon counter */}
        <div className="flex items-center justify-between bg-muted rounded-lg px-4 py-2">
          <div>
            <p className="text-xs text-muted-foreground">{t("tgtgCouponsAvailable", language)}</p>
            <p className="text-xl font-bold text-foreground">
              {item.cuponesDisponibles}
              <span className="text-sm font-normal text-muted-foreground"> / {item.cuponesTotal}</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onAdjust(item.id, -1)}
              disabled={adjusting || item.cuponesDisponibles <= 0}
              aria-label="Reducir cupones"
              className="w-9 h-9 rounded-lg border border-border bg-card hover:bg-muted flex items-center justify-center transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-40 disabled:pointer-events-none min-h-[44px] min-w-[44px]"
            >
              {adjusting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Minus className="w-4 h-4" />}
            </button>
            <button
              onClick={() => onAdjust(item.id, 1)}
              disabled={adjusting || item.cuponesDisponibles >= item.cuponesTotal}
              aria-label="Aumentar cupones"
              className="w-9 h-9 rounded-lg border border-border bg-card hover:bg-muted flex items-center justify-center transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-40 disabled:pointer-events-none min-h-[44px] min-w-[44px]"
            >
              {adjusting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Reservas toggle */}
        <button
          onClick={() => onToggleReservas(item.id)}
          className="w-full flex items-center justify-between text-sm text-muted-foreground hover:text-foreground transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[44px] px-1"
        >
          <span className="flex items-center gap-1.5">
            <Users className="w-4 h-4" />
            {t("tgtgReservas", language)}
            <span className="bg-primary/10 text-primary text-xs px-1.5 py-0.5 rounded-full font-medium">{item.reservasCount}</span>
          </span>
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {/* Reservas list */}
      {expanded && (
        <div className="border-t border-border bg-muted/40">
          {reservas && reservas.length > 0 ? (
            <ul className="divide-y divide-border">
              {reservas.map(r => (
                <li key={r.id} className="px-4 py-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{r.nombre ?? r.email}</p>
                    {r.nombre && <p className="text-xs text-muted-foreground">{r.email}</p>}
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(r.createdAt).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-4 py-6 text-center">
              <p className="text-sm text-muted-foreground">{t("tgtgNoReservas", language)}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
