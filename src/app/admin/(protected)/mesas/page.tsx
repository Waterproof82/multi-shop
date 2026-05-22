'use client';

import { useState, useEffect, useCallback } from 'react';
import { UtensilsCrossed, Plus, Trash2, KeyRound, QrCode, Check, AlertTriangle, Copy, ShoppingBag, XCircle } from 'lucide-react';
import { fetchWithCsrf } from '@/lib/csrf-client';
import { useAdmin } from '@/lib/admin-context';
import { logClientError } from '@/lib/client-error';
import { Input } from '@/components/ui/input';
import { formatPrice } from '@/lib/format-price';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

interface Mesa {
  id: string;
  numero: number;
  nombre: string | null;
  sesionId: string | null;
  activeOrderCount: number;
  sessionTotal: number;
}

function buildQrUrl(mesaId: string): string {
  if (typeof window === 'undefined') return `/?mesa=${mesaId}`;
  return `${window.location.origin}/?mesa=${mesaId}`;
}

export default function MesasPage() {
  const { empresaId, overrideEmpresaId } = useAdmin();
  const effectiveEmpresaId = overrideEmpresaId || empresaId;

  const [mesas, setMesas] = useState<Mesa[]>([]);
  const [loading, setLoading] = useState(true);

  // Add form
  const [numero, setNumero] = useState('');
  const [nombre, setNombre] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState('');

  // Delete mesa
  const [deleteConfirm, setDeleteConfirm] = useState<{ show: boolean; id: string | null; numero: number | null }>({ show: false, id: null, numero: null });
  const [deleting, setDeleting] = useState(false);

  // Close session
  const [closeConfirm, setCloseConfirm] = useState<{ show: boolean; mesa: Mesa | null }>({ show: false, mesa: null });
  const [closing, setClosing] = useState(false);

  // PIN
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [savingPin, setSavingPin] = useState(false);
  const [pinSuccess, setPinSuccess] = useState(false);
  const [pinError, setPinError] = useState('');

  // Copy feedback
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchMesas = useCallback(async () => {
    try {
      const res = await fetchWithCsrf(`/api/admin/mesas?empresaId=${effectiveEmpresaId}`);
      if (res.ok) {
        const data = await res.json() as { mesas: Mesa[] };
        setMesas(data.mesas);
      }
    } catch (e) {
      logClientError(e, 'fetchMesas');
    } finally {
      setLoading(false);
    }
  }, [effectiveEmpresaId]);

  useEffect(() => { void fetchMesas(); }, [fetchMesas]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError('');
    const num = parseInt(numero, 10);
    if (isNaN(num) || num < 1 || num > 999) {
      setAddError('El número de mesa debe estar entre 1 y 999');
      return;
    }
    setAdding(true);
    try {
      const res = await fetchWithCsrf(`/api/admin/mesas?empresaId=${effectiveEmpresaId}`, {
        method: 'POST',
        body: JSON.stringify({ numero: num, nombre: nombre.trim() || null }),
      });
      if (res.ok) {
        const data = await res.json() as { mesa: Mesa };
        setMesas(prev => [...prev, { ...data.mesa, sesionId: null, activeOrderCount: 0, sessionTotal: 0 }].sort((a, b) => a.numero - b.numero));
        setNumero('');
        setNombre('');
      } else {
        setAddError('Error al crear la mesa');
      }
    } catch (e) {
      logClientError(e, 'addMesa');
      setAddError('Error al crear la mesa');
    } finally {
      setAdding(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteConfirm.id) return;
    setDeleting(true);
    try {
      const res = await fetchWithCsrf(`/api/admin/mesas?empresaId=${effectiveEmpresaId}`, {
        method: 'DELETE',
        body: JSON.stringify({ id: deleteConfirm.id }),
      });
      if (res.ok) {
        setMesas(prev => prev.filter(m => m.id !== deleteConfirm.id));
        setDeleteConfirm({ show: false, id: null, numero: null });
      }
    } catch (e) {
      logClientError(e, 'deleteMesa');
    } finally {
      setDeleting(false);
    }
  };

  const confirmCloseSession = async () => {
    if (!closeConfirm.mesa?.sesionId) return;
    setClosing(true);
    try {
      const res = await fetchWithCsrf(`/api/admin/mesas?empresaId=${effectiveEmpresaId}`, {
        method: 'PATCH',
        body: JSON.stringify({ sesionId: closeConfirm.mesa.sesionId }),
      });
      if (res.ok) {
        setMesas(prev => prev.map(m =>
          m.id === closeConfirm.mesa!.id
            ? { ...m, sesionId: null, activeOrderCount: 0, sessionTotal: 0 }
            : m
        ));
        setCloseConfirm({ show: false, mesa: null });
      }
    } catch (e) {
      logClientError(e, 'closeSesion');
    } finally {
      setClosing(false);
    }
  };

  const handleSavePin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinError('');
    setPinSuccess(false);
    if (!/^\d{4,8}$/.test(pin)) {
      setPinError('El PIN debe tener entre 4 y 8 dígitos numéricos');
      return;
    }
    if (pin !== pinConfirm) {
      setPinError('Los PINs no coinciden');
      return;
    }
    setSavingPin(true);
    try {
      const res = await fetchWithCsrf(`/api/admin/waiter-pin?empresaId=${effectiveEmpresaId}`, {
        method: 'POST',
        body: JSON.stringify({ pin }),
      });
      if (res.ok) {
        setPinSuccess(true);
        setPin('');
        setPinConfirm('');
        setTimeout(() => setPinSuccess(false), 3000);
      } else {
        setPinError('Error al guardar el PIN');
      }
    } catch (e) {
      logClientError(e, 'savePin');
      setPinError('Error al guardar el PIN');
    } finally {
      setSavingPin(false);
    }
  };

  const handleCopy = (mesaId: string) => {
    const url = buildQrUrl(mesaId);
    void navigator.clipboard.writeText(url).then(() => {
      setCopiedId(mesaId);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  return (
    <div className="pt-16 lg:pt-0 px-6 py-8 space-y-8 min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <div className="backdrop-blur-2xl bg-white/10 border border-white/20 rounded-2xl p-6 sm:p-8 shadow-2xl">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-xl bg-amber-500/20 border border-amber-400/30">
            <UtensilsCrossed className="w-6 h-6 text-amber-300" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight">Mesas</h1>
            <p className="text-slate-300 text-sm mt-1">Gestiona las mesas, su estado y el PIN del camarero</p>
          </div>
        </div>
      </div>

      {/* Mesa list */}
      <div className="backdrop-blur-2xl bg-white/10 border border-white/20 rounded-2xl shadow-2xl overflow-hidden">
        <div className="p-6 border-b border-white/10">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <QrCode className="w-5 h-5 text-cyan-300" />
            Mesas disponibles
          </h2>
        </div>

        {loading ? (
          <div className="p-8 text-center text-slate-400">Cargando...</div>
        ) : mesas.length === 0 ? (
          <div className="p-8 text-center text-slate-400">No hay mesas configuradas</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">#</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Nombre</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Estado</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Pedidos activos</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Total sesión</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">URL QR</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {mesas.map(mesa => (
                  <tr key={mesa.id} className="hover:bg-muted/50">
                    <td className="px-4 py-3 font-medium text-foreground">{mesa.numero}</td>
                    <td className="px-4 py-3 text-muted-foreground">{mesa.nombre ?? <span className="italic text-slate-500">Sin nombre</span>}</td>
                    <td className="px-4 py-3">
                      {mesa.sesionId ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          Ocupada
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-500/20 text-slate-400 border border-slate-500/30">
                          Libre
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {mesa.sesionId ? (
                        <span className="flex items-center gap-1 text-sm">
                          <ShoppingBag className="w-3.5 h-3.5 text-cyan-400" />
                          {mesa.activeOrderCount}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {mesa.sesionId && mesa.sessionTotal > 0
                        ? <span className="font-medium text-white">{formatPrice(mesa.sessionTotal)}</span>
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <code className="text-xs text-cyan-300 bg-cyan-500/10 px-2 py-1 rounded font-mono truncate max-w-[220px]">
                          /?mesa={mesa.id}
                        </code>
                        <button
                          onClick={() => handleCopy(mesa.id)}
                          className="p-1.5 rounded hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
                          aria-label="Copiar URL"
                        >
                          {copiedId === mesa.id ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {mesa.sesionId && (
                          <button
                            onClick={() => setCloseConfirm({ show: true, mesa })}
                            className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-amber-400 hover:bg-amber-500/10 rounded-sm"
                            aria-label={`Cerrar sesión de mesa ${mesa.numero}`}
                            title="Cerrar mesa (nueva cuenta)"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => setDeleteConfirm({ show: true, id: mesa.id, numero: mesa.numero })}
                          className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-destructive hover:bg-destructive/10 rounded-sm"
                          aria-label={`Eliminar mesa ${mesa.numero}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Add mesa form */}
        <div className="p-6 border-t border-white/10">
          <h3 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Añadir mesa
          </h3>
          <form onSubmit={handleAdd} className="flex flex-wrap gap-3 items-end">
            <div>
              <label htmlFor="numero" className="block text-xs text-slate-400 mb-1">Número *</label>
              <Input
                id="numero"
                type="number"
                min="1"
                max="999"
                value={numero}
                onChange={e => setNumero(e.target.value)}
                placeholder="1"
                className="w-24 bg-white/5 border-white/20 text-white placeholder:text-slate-500"
                required
              />
            </div>
            <div>
              <label htmlFor="nombre" className="block text-xs text-slate-400 mb-1">Nombre (opcional)</label>
              <Input
                id="nombre"
                type="text"
                maxLength={100}
                value={nombre}
                onChange={e => setNombre(e.target.value)}
                placeholder="Terraza 1"
                className="w-48 bg-white/5 border-white/20 text-white placeholder:text-slate-500"
              />
            </div>
            <button
              type="submit"
              disabled={adding}
              className="flex items-center gap-2 px-4 py-2 min-h-[40px] bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              {adding ? 'Añadiendo...' : 'Añadir mesa'}
            </button>
          </form>
          {addError && <p className="text-destructive text-sm mt-2">{addError}</p>}
        </div>
      </div>

      {/* Waiter PIN */}
      <div className="backdrop-blur-2xl bg-white/10 border border-white/20 rounded-2xl shadow-2xl overflow-hidden">
        <div className="p-6 border-b border-white/10">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-amber-300" />
            PIN del camarero
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            El camarero usa este PIN para acceder al panel de sala en <code className="text-cyan-300">/waiter</code>
          </p>
        </div>
        <div className="p-6">
          <form onSubmit={handleSavePin} className="flex flex-wrap gap-3 items-end max-w-sm">
            <div className="w-full">
              <label htmlFor="pin" className="block text-xs text-slate-400 mb-1">Nuevo PIN (4–8 dígitos)</label>
              <Input
                id="pin"
                type="password"
                inputMode="numeric"
                maxLength={8}
                value={pin}
                onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
                placeholder="••••"
                className="bg-white/5 border-white/20 text-white placeholder:text-slate-500"
                autoComplete="new-password"
              />
            </div>
            <div className="w-full">
              <label htmlFor="pinConfirm" className="block text-xs text-slate-400 mb-1">Confirmar PIN</label>
              <Input
                id="pinConfirm"
                type="password"
                inputMode="numeric"
                maxLength={8}
                value={pinConfirm}
                onChange={e => setPinConfirm(e.target.value.replace(/\D/g, ''))}
                placeholder="••••"
                className="bg-white/5 border-white/20 text-white placeholder:text-slate-500"
                autoComplete="new-password"
              />
            </div>
            <button
              type="submit"
              disabled={savingPin || !pin || !pinConfirm}
              className="flex items-center gap-2 px-4 py-2 min-h-[40px] bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
            >
              <KeyRound className="w-4 h-4" />
              {savingPin ? 'Guardando...' : 'Guardar PIN'}
            </button>
            {pinSuccess && (
              <p className="w-full flex items-center gap-1.5 text-emerald-400 text-sm">
                <Check className="w-4 h-4" /> PIN guardado correctamente
              </p>
            )}
            {pinError && <p className="w-full text-destructive text-sm">{pinError}</p>}
          </form>
        </div>
      </div>

      {/* Close session dialog */}
      <Dialog open={closeConfirm.show} onOpenChange={(open) => { if (!open) setCloseConfirm({ show: false, mesa: null }); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className="p-2 bg-amber-500/10 rounded-full">
                <XCircle className="w-5 h-5 text-amber-400" />
              </div>
              Cerrar mesa {closeConfirm.mesa?.numero}
            </DialogTitle>
            <DialogDescription>
              Esto cerrará la sesión activa. El próximo cliente comenzará una cuenta nueva.
              {closeConfirm.mesa?.sessionTotal ? ` Total de la sesión: ${formatPrice(closeConfirm.mesa.sessionTotal)}.` : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 justify-end">
            <button
              onClick={() => setCloseConfirm({ show: false, mesa: null })}
              className="px-4 py-2 text-muted-foreground hover:bg-muted rounded-lg"
              disabled={closing}
            >
              Cancelar
            </button>
            <button
              onClick={confirmCloseSession}
              disabled={closing}
              className="px-4 py-2 bg-amber-600 text-white hover:bg-amber-500 rounded-lg disabled:opacity-50"
            >
              {closing ? 'Cerrando...' : 'Cerrar mesa'}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete dialog */}
      <Dialog open={deleteConfirm.show} onOpenChange={(open) => { if (!open) setDeleteConfirm({ show: false, id: null, numero: null }); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className="p-2 bg-destructive/10 rounded-full">
                <AlertTriangle className="w-5 h-5 text-destructive" />
              </div>
              Eliminar mesa {deleteConfirm.numero}
            </DialogTitle>
            <DialogDescription>
              Esta acción eliminará la mesa permanentemente. Los pedidos asociados no se eliminarán.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 justify-end">
            <button
              onClick={() => setDeleteConfirm({ show: false, id: null, numero: null })}
              className="px-4 py-2 text-muted-foreground hover:bg-muted rounded-lg"
              disabled={deleting}
            >
              Cancelar
            </button>
            <button
              onClick={confirmDelete}
              disabled={deleting}
              className="px-4 py-2 bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-lg disabled:opacity-50"
            >
              {deleting ? 'Eliminando...' : 'Eliminar'}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
