'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, Trash2, Save, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { fetchWithCsrf } from '@/lib/csrf-client';
import { useAdmin } from '@/lib/admin-context';
import { useLanguage } from '@/lib/language-context';
import { t } from '@/lib/translations';

interface MenuVirtual {
  id: string;
  empresaId: string;
  padreId: string | null;
  nombre: string;
  orden: number;
}

interface AdminProducto {
  id: string;
  titulo_es: string;
  activo: boolean;
}

export default function MenusVirtualesPage() {
  const { empresaId } = useAdmin();
  const { language } = useLanguage();
  const [nodos, setNodos] = useState<MenuVirtual[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editNombre, setEditNombre] = useState('');
  const [editOrden, setEditOrden] = useState(0);
  const [saving, setSaving] = useState(false);

  const [productos, setProductos] = useState<AdminProducto[]>([]);
  const [selectedProductoIds, setSelectedProductoIds] = useState<string[]>([]);
  const [productoSearch, setProductoSearch] = useState('');
  const [savingProductos, setSavingProductos] = useState(false);

  const fetchNodos = useCallback(async () => {
    const res = await fetch('/api/admin/menus-virtuales');
    if (!res.ok) return;
    const data = await res.json() as MenuVirtual[];
    setNodos(data);
  }, []);

  useEffect(() => {
    void fetchNodos().finally(() => setLoading(false));
  }, [fetchNodos]);

  useEffect(() => {
    void fetch('/api/admin/productos')
      .then(res => res.ok ? res.json() : [])
      .then((data: AdminProducto[]) => setProductos(data));
  }, []);

  const padres = useMemo(() => nodos.filter(n => !n.padreId).sort((a, b) => a.orden - b.orden), [nodos]);
  const hijosDe = useCallback((padreId: string) => nodos.filter(n => n.padreId === padreId).sort((a, b) => a.orden - b.orden), [nodos]);

  const selectedNodo = nodos.find(n => n.id === selectedId) ?? null;
  const selectedEsHoja = selectedNodo !== null && hijosDe(selectedNodo.id).length === 0;

  function handleSelect(nodo: MenuVirtual) {
    setSelectedId(nodo.id);
    setEditNombre(nodo.nombre);
    setEditOrden(nodo.orden);
    setProductoSearch('');
    setSelectedProductoIds([]);
  }

  useEffect(() => {
    if (!selectedId || !selectedEsHoja) return;
    void fetch(`/api/admin/menus-virtuales/${selectedId}/productos`)
      .then(res => res.ok ? res.json() : [])
      .then((ids: string[]) => setSelectedProductoIds(ids));
  }, [selectedId, selectedEsHoja]);

  async function handleNuevoMenu() {
    if (!empresaId) return;
    const res = await fetchWithCsrf('/api/admin/menus-virtuales', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre_es: t('menuVirtualNuevoMenu', language), empresaId }),
    });
    if (!res.ok) return;
    const created = await res.json() as MenuVirtual;
    setNodos(prev => [...prev, created]);
    handleSelect(created);
  }

  async function handleNuevaSubcategoria(padreId: string) {
    if (!empresaId) return;
    const res = await fetchWithCsrf('/api/admin/menus-virtuales', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre_es: t('menuVirtualNuevaSubcategoria', language), empresaId, padreId }),
    });
    if (!res.ok) return;
    const created = await res.json() as MenuVirtual;
    setNodos(prev => [...prev, created]);
    handleSelect(created);
  }

  async function handleGuardarNombre() {
    if (!selectedId) return;
    setSaving(true);
    try {
      const res = await fetchWithCsrf(`/api/admin/menus-virtuales/${selectedId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre_es: editNombre, orden: editOrden }),
      });
      if (res.ok) {
        const updated = await res.json() as MenuVirtual;
        setNodos(prev => prev.map(n => n.id === selectedId ? updated : n));
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleEliminar(id: string) {
    if (!confirm(t('menuVirtualEliminarConfirm', language))) return;
    const res = await fetchWithCsrf(`/api/admin/menus-virtuales/${id}`, { method: 'DELETE' });
    if (!res.ok) return;
    setNodos(prev => prev.filter(n => n.id !== id && n.padreId !== id));
    if (selectedId === id) setSelectedId(null);
  }

  function toggleProducto(productoId: string) {
    setSelectedProductoIds(prev =>
      prev.includes(productoId) ? prev.filter(id => id !== productoId) : [...prev, productoId]
    );
  }

  async function handleGuardarProductos() {
    if (!selectedId) return;
    setSavingProductos(true);
    try {
      const res = await fetchWithCsrf(`/api/admin/menus-virtuales/${selectedId}/productos`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productoIds: selectedProductoIds }),
      });
      if (!res.ok) {
        alert(t('menuVirtualGuardarProductosError', language));
      }
    } finally {
      setSavingProductos(false);
    }
  }

  const productosFiltrados = useMemo(() => {
    const q = productoSearch.trim().toLowerCase();
    const activos = productos.filter(p => p.activo);
    if (!q) return activos;
    return activos.filter(p => p.titulo_es.toLowerCase().includes(q));
  }, [productos, productoSearch]);

  if (loading) {
    return <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="p-6 grid grid-cols-1 md:grid-cols-[320px_1fr] gap-6">
      <div className="space-y-2">
        <Button onClick={handleNuevoMenu} className="w-full justify-start gap-2">
          <Plus className="w-4 h-4" /> {t('menuVirtualNuevoMenu', language)}
        </Button>
        {padres.length === 0 && (
          <p className="text-sm text-muted-foreground py-4">{t('menuVirtualSinNodos', language)}</p>
        )}
        {padres.map(padre => (
          <div key={padre.id} className="space-y-1">
            <button
              type="button"
              onClick={() => handleSelect(padre)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium ${selectedId === padre.id ? 'bg-primary/10 text-primary' : 'hover:bg-muted/50'}`}
            >
              {padre.nombre}
            </button>
            {hijosDe(padre.id).map(hijo => (
              <button
                key={hijo.id}
                type="button"
                onClick={() => handleSelect(hijo)}
                className={`w-full text-left pl-6 pr-3 py-1.5 rounded-lg text-sm ${selectedId === hijo.id ? 'bg-primary/10 text-primary' : 'hover:bg-muted/50 text-muted-foreground'}`}
              >
                {hijo.nombre}
              </button>
            ))}
            <button
              type="button"
              onClick={() => handleNuevaSubcategoria(padre.id)}
              className="w-full text-left pl-6 pr-3 py-1 text-xs text-muted-foreground hover:text-foreground"
            >
              + {t('menuVirtualNuevaSubcategoria', language)}
            </button>
          </div>
        ))}
      </div>

      {selectedNodo && (
        <div className="space-y-6 max-w-xl">
          <div className="space-y-2">
            <div>
              <label htmlFor="menu-virtual-nombre" className="text-sm font-medium text-foreground">{t('menuVirtualNombre', language)}</label>
              <Input id="menu-virtual-nombre" value={editNombre} onChange={e => setEditNombre(e.target.value)} />
            </div>
            <div className="flex items-end gap-2">
              <div className="w-24">
                <label htmlFor="menu-virtual-orden" className="text-sm font-medium text-foreground">{t('orderLabel', language)}</label>
                <Input
                  id="menu-virtual-orden"
                  type="number"
                  value={editOrden}
                  onChange={e => setEditOrden(Number.parseInt(e.target.value) || 0)}
                />
              </div>
              <Button onClick={handleGuardarNombre} disabled={saving} className="gap-2">
                <Save className="w-4 h-4" /> {t('menuVirtualGuardar', language)}
              </Button>
              <Button variant="outline" onClick={() => handleEliminar(selectedNodo.id)} className="gap-2 text-destructive">
                <Trash2 className="w-4 h-4" /> {t('menuVirtualEliminar', language)}
              </Button>
            </div>
          </div>

          {selectedEsHoja && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-foreground">
                  {t('menuVirtualProductosAsociados', language)} ({selectedProductoIds.length})
                </h3>
                <Button size="sm" onClick={handleGuardarProductos} disabled={savingProductos} className="gap-2">
                  <Save className="w-4 h-4" /> {t('menuVirtualGuardar', language)}
                </Button>
              </div>
              <Input
                type="search"
                value={productoSearch}
                onChange={e => setProductoSearch(e.target.value)}
                placeholder={t('menuVirtualBuscarProducto', language)}
                aria-label={t('menuVirtualBuscarProducto', language)}
              />
              <div className="max-h-96 overflow-y-auto space-y-1 border border-border rounded-lg p-2">
                {productosFiltrados.map(producto => (
                  <label
                    key={producto.id}
                    className="flex items-center gap-2 cursor-pointer p-2 rounded-md hover:bg-muted/50"
                  >
                    <input
                      type="checkbox"
                      checked={selectedProductoIds.includes(producto.id)}
                      onChange={() => toggleProducto(producto.id)}
                      className="w-4 h-4 accent-primary shrink-0"
                    />
                    <span className="text-sm text-foreground truncate">{producto.titulo_es}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
