'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import {
  Users, Send, CheckCircle, Image as ImageIcon, Loader2,
  ShoppingBag, Plus, Trash2, Minus, ChevronDown, ChevronUp, Clock, CalendarOff, Calendar, Pencil, X, ReceiptText, AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { fetchWithCsrf, ensureCsrfToken } from '@/lib/csrf-client';
import { logClientError } from '@/lib/client-error';
import { useLanguage } from '@/lib/language-context';
import type { Language } from '@/lib/language-context';
import { useAdmin } from '@/lib/admin-context';
import { t } from '@/lib/translations';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface Cliente {
  id: string;
  aceptar_promociones: boolean | null;
  email: string | null;
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
  fechaActivacion: string;
  numeroEnvios: number;
  emailEnviado: boolean;
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

function createEmptyItem(): TgtgItemForm {
  return {
    titulo: '', descripcion: '', imagenUrl: null,
    precioOriginal: '', precioDescuento: '', cuponesTotal: '',
    imageFile: null, previewUrl: null, uploading: false,
  };
}

// ─────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────

export default function TooGoodToGoPage() {
  const { language } = useLanguage();
  const { empresaId, overrideEmpresaId } = useAdmin();
  const effectiveEmpresaId = overrideEmpresaId || empresaId;

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [tgtgCampaigns, setTgtgCampaigns] = useState<TgtgPromo[]>([]);
  const [tgtgSaving, setTgtgSaving] = useState(false);
  const [tgtgSuccess, setTgtgSuccess] = useState(false);
  const [horaInicio, setHoraInicio] = useState('18:00');
  const [horaFin, setHoraFin] = useState('20:00');
  const [tgtgFechaActivacion, setTgtgFechaActivacion] = useState(() => new Date().toISOString().split('T')[0]);
  const [tgtgItems, setTgtgItems] = useState<TgtgItemForm[]>([createEmptyItem()]);
  const [reservasByItem, setReservasByItem] = useState<Record<string, TgtgReserva[]>>({});
  const [expandedReservas, setExpandedReservas] = useState<Set<string>>(new Set());
  const [adjustingItem, setAdjustingItem] = useState<string | null>(null);
  const [editingHorasId, setEditingHorasId] = useState<string | null>(null);
  const [editHoraInicio, setEditHoraInicio] = useState('');
  const [editHoraFin, setEditHoraFin] = useState('');
  const [savingHoras, setSavingHoras] = useState(false);
  const [allReservas, setAllReservas] = useState<Record<string, TgtgReserva[]>>({});
  const [loadingAllReservas, setLoadingAllReservas] = useState<string | null>(null);
  const [showAllReservasId, setShowAllReservasId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [selectedPromoIds, setSelectedPromoIds] = useState<Set<string>>(new Set());
  const [sendingEmails, setSendingEmails] = useState(false);

  useEffect(() => {
    async function fetchData() {
      try {
        const [clientesRes, tgtgRes] = await Promise.all([
          fetch(`/api/admin/clientes?empresaId=${effectiveEmpresaId}`),
          fetch(`/api/admin/tgtg?empresaId=${effectiveEmpresaId}`),
        ]);
        if (clientesRes.ok) {
          const data = await clientesRes.json() as { clientes?: Cliente[] };
          setClientes(data.clientes || []);
        }
        if (tgtgRes.ok) {
          const data = await tgtgRes.json() as { campaigns?: TgtgPromo[] };
          setTgtgCampaigns(data.campaigns || []);
        }
      } catch (error) {
        logClientError(error, 'fetchTgtgData');
      }
    }
    fetchData();
  }, [effectiveEmpresaId]);

  const clientesConPromociones = clientes.filter(c => c.aceptar_promociones && c.email);

  // ── Item form handlers ──────────────────────────────────────

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

  const handleCreateCampaign = async () => {
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
    const pickupEnd = new Date(`${tgtgFechaActivacion}T${horaFin}:00`);
    if (isNaN(pickupEnd.getTime()) || pickupEnd <= new Date()) {
      alert('La fecha y hora de fin de recogida debe ser posterior a la hora actual.');
      return;
    }
    setTgtgSaving(true);
    try {
      const csrfToken = await ensureCsrfToken();
      const uploadedUrls = await Promise.all(
        tgtgItems.map(async (item, index) => {
          if (item.imageFile) return await uploadTgtgImage(index, item.imageFile, csrfToken);
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
          fecha_activacion: tgtgFechaActivacion,
          items: itemsPayload,
        }),
      });

      if (res.ok) {
        const refreshRes = await fetch(`/api/admin/tgtg?empresaId=${effectiveEmpresaId}`);
        if (refreshRes.ok) {
          const refreshData = await refreshRes.json() as { campaigns?: TgtgPromo[] };
          setTgtgCampaigns(refreshData.campaigns || []);
        }
        setTgtgItems([createEmptyItem()]);
        setTgtgSuccess(true);
        setTimeout(() => setTgtgSuccess(false), 3000);
      } else {
        alert('Error al crear la campaña TGTG.');
      }
    } catch (error) {
      logClientError(error, 'handleCreateCampaign');
      alert('Error al crear la campaña.');
    } finally {
      setTgtgSaving(false);
    }
  };

  const handleConfirmSendEmails = async () => {
    setShowConfirmModal(false);
    setSendingEmails(true);
    try {
      const promoIdsArray = Array.from(selectedPromoIds);
      const res = await fetchWithCsrf(`/api/admin/tgtg/enviar?empresaId=${effectiveEmpresaId}`, {
        method: 'POST',
        body: JSON.stringify({ promoIds: promoIdsArray }),
      });
      if (res.ok) {
        const data = await res.json() as { updatedPromos: Array<{ id: string; emailEnviado: boolean; numeroEnvios: number }> };
        setTgtgCampaigns(prev => prev.map(c => {
          const updated = data.updatedPromos.find(u => u.id === c.id);
          return updated ? { ...c, emailEnviado: updated.emailEnviado, numeroEnvios: updated.numeroEnvios } : c;
        }));
        setSelectedPromoIds(new Set());
      } else {
        const err = await res.json() as { error?: string };
        alert(err.error ?? 'Error al enviar los emails.');
      }
    } catch (error) {
      logClientError(error, 'handleConfirmSendEmails');
      alert('Error al enviar los emails.');
    } finally {
      setSendingEmails(false);
    }
  };

  const handleToggleSelectPromo = (promoId: string) => {
    setSelectedPromoIds(prev => {
      const s = new Set(prev);
      if (s.has(promoId)) {
        s.delete(promoId);
      } else {
        s.add(promoId);
      }
      return s;
    });
  };

  const handleDeleteCampaign = async (promoId: string) => {
    if (!confirm('¿Eliminar esta campaña? Esta acción no se puede deshacer.')) return;
    setDeletingId(promoId);
    try {
      const res = await fetchWithCsrf(
        `/api/admin/tgtg/${encodeURIComponent(promoId)}?empresaId=${effectiveEmpresaId}`,
        { method: 'DELETE' }
      );
      if (res.ok) {
        setTgtgCampaigns(prev => prev.filter(c => c.id !== promoId));
        setSelectedPromoIds(prev => { const s = new Set(prev); s.delete(promoId); return s; });
      } else {
        const data = await res.json().catch(() => ({})) as { error?: string };
        alert(data.error || 'Error al eliminar la campaña.');
      }
    } catch (error) {
      logClientError(error, 'handleDeleteCampaign');
      alert('Error al eliminar la campaña.');
    } finally {
      setDeletingId(null);
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
        setTgtgCampaigns(prev => prev.map(c => ({
          ...c,
          items: c.items.map(item =>
            item.id === itemId ? { ...item, cuponesDisponibles: data.item.cuponesDisponibles } : item
          ),
        })));
      }
    } catch (error) {
      logClientError(error, 'handleAdjustCupones');
    } finally {
      setAdjustingItem(null);
    }
  };

  const handleToggleReservas = async (itemId: string, promoId: string) => {
    if (expandedReservas.has(itemId)) {
      setExpandedReservas(prev => { const s = new Set(prev); s.delete(itemId); return s; });
      return;
    }
    try {
      const res = await fetch(
        `/api/admin/tgtg/reservas?tgtgPromoId=${promoId}&empresaId=${effectiveEmpresaId}`
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

  const handleToggleAllReservas = async (promoId: string) => {
    if (showAllReservasId === promoId) { setShowAllReservasId(null); return; }
    setLoadingAllReservas(promoId);
    try {
      const res = await fetch(
        `/api/admin/tgtg/reservas?tgtgPromoId=${promoId}&empresaId=${effectiveEmpresaId}`
      );
      if (res.ok) {
        const data = await res.json() as { reservas: TgtgReserva[] };
        setAllReservas(prev => ({ ...prev, [promoId]: data.reservas }));
        setShowAllReservasId(promoId);
      }
    } catch (error) {
      logClientError(error, 'handleToggleAllReservas');
    } finally {
      setLoadingAllReservas(null);
    }
  };

  const handleStartEditHoras = (campaign: TgtgPromo) => {
    setEditHoraInicio(campaign.horaRecogidaInicio.slice(0, 5));
    setEditHoraFin(campaign.horaRecogidaFin.slice(0, 5));
    setEditingHorasId(campaign.id);
  };

  const handleCancelEditHoras = () => setEditingHorasId(null);

  const handleSaveHoras = async (promoId: string) => {
    setSavingHoras(true);
    try {
      const res = await fetchWithCsrf(
        `/api/admin/tgtg/${encodeURIComponent(promoId)}/horas?empresaId=${effectiveEmpresaId}`,
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
        setTgtgCampaigns(prev => prev.map(c => c.id === promoId ? {
          ...c,
          horaRecogidaInicio: data.tgtgPromo.horaRecogidaInicio,
          horaRecogidaFin: data.tgtgPromo.horaRecogidaFin,
        } : c));
        setEditingHorasId(null);
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

  const handleReutilizar = (campaign: TgtgPromo) => {
    setHoraInicio(campaign.horaRecogidaInicio.slice(0, 5));
    setHoraFin(campaign.horaRecogidaFin.slice(0, 5));
    setTgtgFechaActivacion(new Date().toISOString().split('T')[0]);
    setTgtgItems(campaign.items.map(item => ({
      titulo: item.titulo,
      descripcion: item.descripcion ?? '',
      imagenUrl: item.imagenUrl,
      precioOriginal: String(item.precioOriginal),
      precioDescuento: String(item.precioDescuento),
      cuponesTotal: String(item.cuponesTotal),
      imageFile: null,
      previewUrl: item.imagenUrl,
      uploading: false,
    })));
    setTimeout(() => {
      document.getElementById('tgtg-campaign-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  };

  const anyItemUploading = tgtgItems.some(i => i.uploading);

  // ─────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────

  const now = new Date();
  const withStatus = tgtgCampaigns.map(campaign => {
    const promoDate = campaign.fechaActivacion || new Date(campaign.createdAt).toISOString().split('T')[0];
    const horaFinNorm = campaign.horaRecogidaFin.length === 5 ? `${campaign.horaRecogidaFin}:00` : campaign.horaRecogidaFin;
    const pickupEnd = new Date(`${promoDate}T${horaFinNorm}`);
    const isExpired = !isNaN(pickupEnd.getTime()) && now > pickupEnd;
    const allCuponesAgotados = campaign.items.length > 0 && campaign.items.every(i => i.cuponesDisponibles === 0);
    return { campaign, isClosed: isExpired || allCuponesAgotados };
  });
  const activeCampaigns = withStatus.filter(c => !c.isClosed);
  const closedCampaigns = withStatus.filter(c => c.isClosed);

  const selectedActiveCampaigns = activeCampaigns.filter(({ campaign }) => selectedPromoIds.has(campaign.id));
  const totalSelectedItems = selectedActiveCampaigns.reduce((acc, { campaign }) => acc + campaign.items.length, 0);

  return (
    <div className="pt-16 lg:pt-0 px-6 py-6 space-y-6">
      {/* Header */}
      <div className="bg-primary rounded-lg p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-primary-foreground flex items-center gap-2">
              <ShoppingBag className="w-6 h-6" />
              TooGoodToGo
            </h1>
            <p className="text-primary-foreground/80 text-sm mt-1">{t("tgtgNewPromo", language)}</p>
          </div>
          <div className="bg-primary-foreground/20 rounded-lg px-4 py-3 text-center">
            <span className="text-2xl font-semibold text-primary-foreground">{clientesConPromociones.length}</span>
            <p className="text-primary-foreground/80 text-xs">{t("toSend", language)}</p>
          </div>
        </div>
      </div>

      {/* New campaign form */}
      <div id="tgtg-campaign-form" className="bg-card rounded-lg border shadow-elegant p-6 space-y-6">
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <ShoppingBag className="w-5 h-5" />
          {t("tgtgNewPromo", language)}
        </h2>

        {/* Activation date + Pickup time */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label htmlFor="tgtg-fecha" className="block text-sm font-medium text-foreground mb-1">
              <Calendar className="w-3.5 h-3.5 inline mr-1" />{t("tgtgActivationDate", language)} <span className="text-destructive" aria-hidden="true">*</span>
            </label>
            <input
              id="tgtg-fecha"
              type="date"
              value={tgtgFechaActivacion}
              onChange={e => setTgtgFechaActivacion(e.target.value)}
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
          </div>
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
              onClick={handleCreateCampaign}
              disabled={tgtgSaving || anyItemUploading}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {tgtgSaving || anyItemUploading ? (
                <><Loader2 className="w-4 h-4 animate-spin" />{t("sendingProgress", language)}</>
              ) : (
                <><Plus className="w-4 h-4" />Crear campaña</>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Campaigns list */}
      {tgtgCampaigns.length === 0 ? (
        <div className="bg-card rounded-lg border p-12 shadow-elegant text-center" role="status" aria-live="polite">
          <CalendarOff className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">{t("tgtgNoPromo", language)}</p>
        </div>
      ) : (
        <>
          {/* Active campaigns */}
          {activeCampaigns.map(({ campaign }, index) => {
            const displayInicio = campaign.horaRecogidaInicio.slice(0, 5);
            const displayFin = campaign.horaRecogidaFin.slice(0, 5);
            const editingThis = editingHorasId === campaign.id;
            const campaignNumber = activeCampaigns.length - index;
            const isSelected = selectedPromoIds.has(campaign.id);
            return (
              <div key={campaign.id} className={`bg-card rounded-lg border shadow-elegant p-6 space-y-4 transition-colors ${isSelected ? 'ring-2 ring-green-500' : ''}`}>
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-3">
                    {/* Checkbox or sent badge */}
                    {campaign.emailEnviado ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-100 dark:bg-green-900/30 dark:text-green-400 px-2 py-1 rounded-full">
                        <CheckCircle className="w-3.5 h-3.5" />
                        Enviada ✓
                      </span>
                    ) : (
                      <input
                        type="checkbox"
                        id={`select-promo-${campaign.id}`}
                        checked={isSelected}
                        onChange={() => handleToggleSelectPromo(campaign.id)}
                        aria-label={`Seleccionar campaña #${campaignNumber}`}
                        className="w-5 h-5 rounded border-border accent-green-600 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 flex-shrink-0"
                      />
                    )}
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                        <ShoppingBag className="w-5 h-5 text-green-600" />
                        {t("tgtgActiveCampaign", language)}
                        <span className="text-sm font-normal text-muted-foreground">#{campaignNumber}</span>
                      </h2>
                      <span className="text-xs text-muted-foreground">
                        {new Date(campaign.fechaActivacion + 'T00:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {editingThis ? (
                      <>
                        <input type="time" value={editHoraInicio} onChange={e => setEditHoraInicio(e.target.value)} aria-label={t("tgtgPickupFrom", language)} className="h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" />
                        <span className="text-muted-foreground text-sm">–</span>
                        <input type="time" value={editHoraFin} onChange={e => setEditHoraFin(e.target.value)} aria-label={t("tgtgPickupTo", language)} className="h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" />
                        <button onClick={() => handleSaveHoras(campaign.id)} disabled={savingHoras} aria-label={t("save", language)} className="h-8 px-3 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 flex items-center gap-1 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 min-h-[44px]">
                          {savingHoras ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                          {t("save", language)}
                        </button>
                        <button onClick={handleCancelEditHoras} disabled={savingHoras} aria-label={t("cancel", language)} className="h-8 px-2 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted flex items-center outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 min-h-[44px]">
                          <X className="w-4 h-4" />
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="text-xs flex items-center gap-1 text-muted-foreground">
                          <Clock className="w-3.5 h-3.5" />{displayInicio} – {displayFin}
                        </span>
                        <button onClick={() => handleStartEditHoras(campaign)} aria-label="Editar horas de recogida" className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[44px] min-w-[44px] flex items-center justify-center">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                    {(() => {
                      const totalReservas = campaign.items.reduce((acc, i) => acc + i.reservasCount, 0);
                      const cannotDelete = campaign.emailEnviado || totalReservas > 0;
                      const deleteTitle = campaign.emailEnviado
                        ? 'No se puede eliminar una campaña ya enviada'
                        : totalReservas > 0
                          ? `No se puede eliminar: hay ${totalReservas} reserva${totalReservas > 1 ? 's' : ''} activa${totalReservas > 1 ? 's' : ''}`
                          : 'Eliminar campaña';
                      return (
                        <button
                          onClick={() => !cannotDelete && handleDeleteCampaign(campaign.id)}
                          disabled={deletingId === campaign.id || cannotDelete}
                          aria-label={deleteTitle}
                          title={deleteTitle}
                          className="p-1 rounded-md text-destructive hover:bg-destructive/10 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[44px] min-w-[44px] flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          {deletingId === campaign.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                        </button>
                      );
                    })()}
                  </div>
                </div>
                <div className="space-y-4">
                  {campaign.items.map(item => (
                    <TgtgItemAdminCard key={item.id} item={item} language={language} adjusting={adjustingItem === item.id} closed={false} reservas={reservasByItem[item.id] ?? null} expanded={expandedReservas.has(item.id)} onAdjust={handleAdjustCupones} onToggleReservas={(id) => handleToggleReservas(id, campaign.id)} />
                  ))}
                </div>
                <div className="border-t pt-4">
                  <button onClick={() => handleToggleAllReservas(campaign.id)} className="w-full flex items-center justify-between text-sm font-medium text-foreground hover:text-primary transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[44px] px-1">
                    <span className="flex items-center gap-2">
                      <ReceiptText className="w-4 h-4" />
                      {t("tgtgCouponsValidated", language)}
                      <span className="bg-primary/10 text-primary text-xs px-1.5 py-0.5 rounded-full font-medium">
                        {campaign.items.reduce((acc, item) => acc + (item.cuponesTotal - item.cuponesDisponibles), 0)}
                      </span>
                    </span>
                    {loadingAllReservas === campaign.id ? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /> : showAllReservasId === campaign.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                  {showAllReservasId === campaign.id && (
                    <div className="mt-3 rounded-lg border border-border overflow-hidden">
                      {(allReservas[campaign.id] ?? []).length > 0 ? (
                        <table className="w-full text-sm">
                          <thead><tr className="bg-muted text-left"><th className="px-4 py-2 text-xs font-medium text-muted-foreground">Oferta</th><th className="px-4 py-2 text-xs font-medium text-muted-foreground">Cliente</th><th className="px-4 py-2 text-xs font-medium text-muted-foreground text-right">Precio</th><th className="px-4 py-2 text-xs font-medium text-muted-foreground text-right hidden sm:table-cell">Fecha</th></tr></thead>
                          <tbody className="divide-y divide-border">
                            {(allReservas[campaign.id] ?? []).map(r => {
                              const item = campaign.items.find(i => i.id === r.itemId);
                              return (
                                <tr key={r.id} className="bg-card hover:bg-muted/40 transition-colors">
                                  <td className="px-4 py-3"><p className="font-medium text-foreground truncate max-w-[120px]">{item?.titulo ?? '—'}</p></td>
                                  <td className="px-4 py-3"><p className="text-foreground">{r.nombre ?? r.email}</p>{r.nombre && <p className="text-xs text-muted-foreground">{r.email}</p>}</td>
                                  <td className="px-4 py-3 text-right"><span className="font-semibold text-green-600">{item ? `€${Number(item.precioDescuento).toFixed(2)}` : '—'}</span>{item && <p className="text-xs text-muted-foreground line-through">€{Number(item.precioOriginal).toFixed(2)}</p>}</td>
                                  <td className="px-4 py-3 text-right text-xs text-muted-foreground whitespace-nowrap hidden sm:table-cell">{new Date(r.createdAt).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      ) : (
                        <div className="px-4 py-8 text-center"><ReceiptText className="w-8 h-8 text-muted-foreground mx-auto mb-2" /><p className="text-sm text-muted-foreground">{t("tgtgNoReservas", language)}</p></div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* History (closed campaigns) */}
          {closedCampaigns.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                <Clock className="w-4 h-4" />
                {t("tgtgHistoryTitle", language)}
              </h3>
              <div className="space-y-2">
                {closedCampaigns.map(({ campaign }) => {
                  const displayDate = new Date(campaign.fechaActivacion + 'T00:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
                  const displayInicio = campaign.horaRecogidaInicio.slice(0, 5);
                  const displayFin = campaign.horaRecogidaFin.slice(0, 5);
                  const thumbnail = campaign.items.find(i => i.imagenUrl)?.imagenUrl ?? null;
                  return (
                    <div key={campaign.id} className="bg-card border border-border rounded-lg p-4 flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        {thumbnail && (
                          <div className="relative w-10 h-10 rounded-md overflow-hidden flex-shrink-0 bg-muted">
                            <Image src={thumbnail} alt="" fill className="object-cover" sizes="40px" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center gap-3 flex-wrap">
                            <span className="text-sm font-medium text-foreground flex items-center gap-1.5">
                              <Calendar className="w-3.5 h-3.5 text-muted-foreground" />{displayDate}
                            </span>
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Clock className="w-3 h-3" />{displayInicio} – {displayFin}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground truncate">
                            {campaign.items.map(i => i.titulo).join(' · ')}
                          </p>
                        </div>
                      </div>
                      <button onClick={() => handleReutilizar(campaign)} className="flex-shrink-0 h-8 px-3 rounded-md border border-border text-sm font-medium text-foreground hover:bg-muted transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[44px] flex items-center gap-1.5">
                        <ReceiptText className="w-3.5 h-3.5" />
                        {t("tgtgReutilizar", language)}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* Sticky bottom bar for selected campaigns */}
      {selectedPromoIds.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-card border-t shadow-xl p-4 flex items-center justify-between gap-4 flex-wrap lg:left-64">
          <span className="text-sm font-medium text-foreground">
            {selectedPromoIds.size} campaña(s) seleccionada(s)
          </span>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setSelectedPromoIds(new Set())}>
              Cancelar
            </Button>
            <Button
              onClick={() => setShowConfirmModal(true)}
              className="bg-green-600 hover:bg-green-700 text-white"
              disabled={sendingEmails}
            >
              {sendingEmails ? (
                <><Loader2 className="w-4 h-4 animate-spin" />Enviando...</>
              ) : (
                <><Send className="w-4 h-4" />Enviar email seleccionadas</>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Confirmation modal */}
      {showConfirmModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-modal-title"
        >
          <div className="bg-card rounded-xl border shadow-xl w-full max-w-md p-6 space-y-5">
            {/* Warning header */}
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <h2 id="confirm-modal-title" className="text-base font-semibold text-foreground">
                  Confirmar envío de emails
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Una vez enviados, la <strong className="text-foreground">fecha y horario de los emails no podrán modificarse</strong>. Asegúrate de que los datos son correctos antes de continuar.
                </p>
              </div>
            </div>

            {/* Selected campaigns summary */}
            <div className="bg-muted rounded-lg p-4 space-y-3 text-sm">
              {selectedActiveCampaigns.map(({ campaign }) => (
                <div key={campaign.id} className="space-y-1.5 pb-3 last:pb-0 border-b last:border-b-0 border-border">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" />Fecha</span>
                    <span className="font-medium text-foreground">
                      {new Date(campaign.fechaActivacion + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" />Recogida</span>
                    <span className="font-medium text-foreground">
                      {campaign.horaRecogidaInicio.slice(0, 5)} – {campaign.horaRecogidaFin.slice(0, 5)}
                    </span>
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between pt-1">
                <span className="text-muted-foreground flex items-center gap-1.5"><ShoppingBag className="w-3.5 h-3.5" />Total ofertas</span>
                <span className="font-medium text-foreground">{totalSelectedItems}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground flex items-center gap-1.5"><Users className="w-3.5 h-3.5" />Destinatarios</span>
                <span className="font-medium text-foreground">{clientesConPromociones.length} clientes</span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 justify-end">
              <Button
                variant="outline"
                onClick={() => setShowConfirmModal(false)}
                className="min-h-[44px]"
              >
                <X className="w-4 h-4" />
                Cancelar
              </Button>
              <Button
                onClick={handleConfirmSendEmails}
                className="bg-green-600 hover:bg-green-700 text-white min-h-[44px]"
              >
                <Send className="w-4 h-4" />
                Confirmar y enviar
              </Button>
            </div>
          </div>
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
  closed: boolean;
  reservas: TgtgReserva[] | null;
  expanded: boolean;
  onAdjust: (itemId: string, delta: number) => void;
  onToggleReservas: (itemId: string) => void;
}

function TgtgItemAdminCard({
  item, language, adjusting, closed, reservas, expanded, onAdjust, onToggleReservas,
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

        <div className="flex items-center justify-between bg-muted rounded-lg px-4 py-2">
          <div>
            <p className="text-xs text-muted-foreground">{t("tgtgCouponsAvailable", language)}</p>
            <p className="text-xl font-bold text-foreground">
              {item.cuponesDisponibles}
              <span className="text-sm font-normal text-muted-foreground"> / {item.cuponesTotal}</span>
            </p>
          </div>
          {!closed && (
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
          )}
        </div>

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
