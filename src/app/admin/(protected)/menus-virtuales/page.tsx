'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Plus, Trash2, Save, Loader2, Folder, Tag, GripVertical } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { fetchWithCsrf } from '@/lib/csrf-client';
import { useAdmin } from '@/lib/admin-context';
import { useLanguage } from '@/lib/language-context';
import { t } from '@/lib/translations';
import { reordenarPorArrastre } from '@/lib/drag-reorder';
import { NuevoMenuVirtualDialog } from '@/components/admin/NuevoMenuVirtualDialog';
import { EliminarMenuVirtualDialog } from '@/components/admin/EliminarMenuVirtualDialog';
import { ADMIN_INPUT_CLASS, ADMIN_LABEL_CLASS, ADMIN_OUTLINE_BUTTON_CLASS } from '@/components/admin/admin-styles';

interface MenuVirtual {
  id: string;
  empresaId: string;
  padreId: string | null;
  nombre: string;
  orden: number;
  productosCount: number;
}

interface AdminProducto {
  id: string;
  titulo_es: string;
  activo: boolean;
}

interface SortableNodoRowProps {
  nodo: MenuVirtual;
  selected: boolean;
  esHijo: boolean;
  subcategoriasCount: number;
  onSelect: () => void;
}

function SortableNodoRow({ nodo, selected, esHijo, subcategoriasCount, onSelect }: Readonly<SortableNodoRowProps>) {
  const { language } = useLanguage();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: nodo.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const vacio = subcategoriasCount === 0 && nodo.productosCount === 0;
  const Icono = esHijo ? Tag : Folder;

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-1">
      <button
        type="button"
        aria-label={t('orderLabel', language)}
        className="touch-none p-1.5 text-slate-400 hover:text-white cursor-grab active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        onClick={onSelect}
        className={`flex-1 text-left px-2 py-2 rounded-lg text-sm flex items-center gap-2 ${
          esHijo ? '' : 'font-medium'
        } ${selected ? 'bg-cyan-500/20 text-cyan-300' : 'hover:bg-white/10 text-white'}`}
      >
        <Icono className="w-4 h-4 shrink-0 opacity-70" />
        <span className="truncate">{nodo.nombre}</span>
        {vacio ? (
          <span className="ml-auto text-xs text-slate-400">{t('menuVirtualVacio', language)}</span>
        ) : (
          <span className="ml-auto text-xs text-slate-400 shrink-0">
            {esHijo ? nodo.productosCount : subcategoriasCount}
          </span>
        )}
      </button>
    </div>
  );
}

export default function MenusVirtualesPage() {
  const { empresaId } = useAdmin();
  const { language } = useLanguage();
  const [nodos, setNodos] = useState<MenuVirtual[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editNombre, setEditNombre] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [productos, setProductos] = useState<AdminProducto[]>([]);
  const [selectedProductoIds, setSelectedProductoIds] = useState<string[]>([]);
  const [productoSearch, setProductoSearch] = useState('');
  const [savingProductos, setSavingProductos] = useState(false);

  const [dialogAbierto, setDialogAbierto] = useState(false);
  const [padreParaNuevo, setPadreParaNuevo] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);

  const [eliminarAbierto, setEliminarAbierto] = useState(false);
  const [nodoAEliminar, setNodoAEliminar] = useState<MenuVirtual | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

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
  const selectedPadre = selectedNodo?.padreId ? nodos.find(n => n.id === selectedNodo.padreId) ?? null : null;
  const selectedEsHoja = selectedNodo !== null && hijosDe(selectedNodo.id).length === 0;

  function handleSelect(nodo: MenuVirtual) {
    setSelectedId(nodo.id);
    setEditNombre(nodo.nombre);
    setProductoSearch('');
    setSelectedProductoIds([]);
    setError('');
  }

  const autoSelectedRef = useRef(false);
  useEffect(() => {
    if (loading || autoSelectedRef.current) return;
    const nodoId = new URLSearchParams(window.location.search).get('nodo');
    if (!nodoId) return;
    const nodo = nodos.find(n => n.id === nodoId);
    if (nodo) {
      handleSelect(nodo);
      autoSelectedRef.current = true;
    }
  }, [loading, nodos]);

  useEffect(() => {
    if (!selectedId || !selectedEsHoja) return;
    void fetch(`/api/admin/menus-virtuales/${selectedId}/productos`)
      .then(res => res.ok ? res.json() : [])
      .then((ids: string[]) => setSelectedProductoIds(ids));
  }, [selectedId, selectedEsHoja]);

  function abrirDialogoNuevoMenu() {
    setPadreParaNuevo(null);
    setDialogAbierto(true);
  }

  function abrirDialogoNuevaSubcategoria(padreId: string) {
    setPadreParaNuevo(padreId);
    setDialogAbierto(true);
  }

  async function handleCrear(nombre: string) {
    if (!empresaId) return;
    setCreando(true);
    setError('');
    try {
      const res = await fetchWithCsrf('/api/admin/menus-virtuales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre_es: nombre, empresaId, padreId: padreParaNuevo }),
      });
      if (!res.ok) {
        setError(t('menuVirtualGuardarNombreError', language));
        return;
      }
      const created = await res.json() as MenuVirtual;
      const creadoConConteo = { ...created, productosCount: 0 };
      setNodos(prev => [...prev, creadoConConteo]);
      handleSelect(creadoConConteo);
      setDialogAbierto(false);
    } finally {
      setCreando(false);
    }
  }

  async function handleGuardarNombre() {
    if (!selectedId) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetchWithCsrf(`/api/admin/menus-virtuales/${selectedId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre_es: editNombre }),
      });
      if (!res.ok) {
        setError(t('menuVirtualGuardarNombreError', language));
        return;
      }
      const updated = await res.json() as MenuVirtual;
      setNodos(prev => prev.map(n => n.id === selectedId ? { ...updated, productosCount: n.productosCount } : n));
    } finally {
      setSaving(false);
    }
  }

  function pedirEliminar(nodo: MenuVirtual) {
    setNodoAEliminar(nodo);
    setEliminarAbierto(true);
  }

  async function handleEliminar() {
    if (!nodoAEliminar) return;
    const id = nodoAEliminar.id;
    const res = await fetchWithCsrf(`/api/admin/menus-virtuales/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      setError(t('menuVirtualGuardarNombreError', language));
      return;
    }
    setNodos(prev => prev.filter(n => n.id !== id && n.padreId !== id));
    if (selectedId === id) setSelectedId(null);
    setEliminarAbierto(false);
    setNodoAEliminar(null);
  }

  function toggleProducto(productoId: string) {
    setSelectedProductoIds(prev =>
      prev.includes(productoId) ? prev.filter(id => id !== productoId) : [...prev, productoId]
    );
  }

  async function handleGuardarProductos() {
    if (!selectedId) return;
    setSavingProductos(true);
    setError('');
    try {
      const res = await fetchWithCsrf(`/api/admin/menus-virtuales/${selectedId}/productos`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productoIds: selectedProductoIds }),
      });
      if (!res.ok) {
        setError(t('menuVirtualGuardarProductosError', language));
        return;
      }
      setNodos(prev => prev.map(n => n.id === selectedId ? { ...n, productosCount: selectedProductoIds.length } : n));
    } finally {
      setSavingProductos(false);
    }
  }

  async function persistirOrden(reordenados: MenuVirtual[], original: MenuVirtual[]) {
    const cambiados = reordenados.filter(n => {
      const previo = original.find(o => o.id === n.id);
      return previo && previo.orden !== n.orden;
    });
    await Promise.all(cambiados.map(n =>
      fetchWithCsrf(`/api/admin/menus-virtuales/${n.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orden: n.orden }),
      })
    ));
  }

  function handleDragEndPadres(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const reordenados = reordenarPorArrastre(padres, String(active.id), String(over.id));
    if (reordenados === padres) return;
    setNodos(prev => prev.map(n => reordenados.find(r => r.id === n.id) ?? n));
    void persistirOrden(reordenados, padres);
  }

  function handleDragEndHijos(padreId: string, event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const hijos = hijosDe(padreId);
    const reordenados = reordenarPorArrastre(hijos, String(active.id), String(over.id));
    if (reordenados === hijos) return;
    setNodos(prev => prev.map(n => reordenados.find(r => r.id === n.id) ?? n));
    void persistirOrden(reordenados, hijos);
  }

  const productosFiltrados = useMemo(() => {
    const q = productoSearch.trim().toLowerCase();
    const activos = productos.filter(p => p.activo);
    if (!q) return activos;
    return activos.filter(p => p.titulo_es.toLowerCase().includes(q));
  }, [productos, productoSearch]);

  if (loading) {
    return <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>;
  }

  return (
    <div className="p-6 grid grid-cols-1 md:grid-cols-[320px_1fr] gap-6">
      <div className="space-y-2">
        <Button onClick={abrirDialogoNuevoMenu} className="w-full justify-start gap-2">
          <Plus className="w-4 h-4" /> {t('menuVirtualNuevoMenu', language)}
        </Button>
        {padres.length === 0 && (
          <p className="text-sm text-slate-400 py-4">{t('menuVirtualSinNodos', language)}</p>
        )}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEndPadres}>
          <SortableContext items={padres.map(p => p.id)} strategy={verticalListSortingStrategy}>
            {padres.map(padre => {
              const hijos = hijosDe(padre.id);
              return (
                <div key={padre.id} className="space-y-1">
                  <SortableNodoRow
                    nodo={padre}
                    selected={selectedId === padre.id}
                    esHijo={false}
                    subcategoriasCount={hijos.length}
                    onSelect={() => handleSelect(padre)}
                  />
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={event => handleDragEndHijos(padre.id, event)}
                  >
                    <SortableContext items={hijos.map(h => h.id)} strategy={verticalListSortingStrategy}>
                      <div className="pl-4">
                        {hijos.map(hijo => (
                          <SortableNodoRow
                            key={hijo.id}
                            nodo={hijo}
                            selected={selectedId === hijo.id}
                            esHijo
                            subcategoriasCount={0}
                            onSelect={() => handleSelect(hijo)}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                  <button
                    type="button"
                    onClick={() => abrirDialogoNuevaSubcategoria(padre.id)}
                    className="w-full text-left pl-8 pr-3 py-1 text-xs text-slate-400 hover:text-white"
                  >
                    + {t('menuVirtualNuevaSubcategoria', language)}
                  </button>
                </div>
              );
            })}
          </SortableContext>
        </DndContext>
      </div>

      {selectedNodo && (
        <div className="space-y-6 max-w-xl">
          {error && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-md text-sm">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <p className="text-xs text-slate-400">
              {selectedPadre ? `${selectedPadre.nombre} › ${selectedNodo.nombre}` : selectedNodo.nombre}
            </p>
            <div className="space-y-2">
              <label htmlFor="menu-virtual-nombre" className={ADMIN_LABEL_CLASS}>{t('menuVirtualNombre', language)}</label>
              <Input id="menu-virtual-nombre" value={editNombre} onChange={e => setEditNombre(e.target.value)} className={ADMIN_INPUT_CLASS} />
            </div>
            <div className="flex items-end gap-2">
              <Button onClick={handleGuardarNombre} disabled={saving} className="gap-2">
                <Save className="w-4 h-4" /> {t('menuVirtualGuardar', language)}
              </Button>
              <Button variant="outline" onClick={() => pedirEliminar(selectedNodo)} className={`gap-2 ${ADMIN_OUTLINE_BUTTON_CLASS} text-red-300 hover:text-red-200`}>
                <Trash2 className="w-4 h-4" /> {t('menuVirtualEliminar', language)}
              </Button>
            </div>
          </div>

          {selectedEsHoja && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-white">
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
                className={ADMIN_INPUT_CLASS}
              />
              <div className="max-h-96 overflow-y-auto space-y-1 border border-white/20 rounded-lg p-2">
                {productosFiltrados.map(producto => (
                  <label
                    key={producto.id}
                    className="flex items-center gap-2 cursor-pointer p-2 rounded-md hover:bg-white/10"
                  >
                    <input
                      type="checkbox"
                      checked={selectedProductoIds.includes(producto.id)}
                      onChange={() => toggleProducto(producto.id)}
                      className="w-4 h-4 accent-cyan-500 shrink-0"
                    />
                    <span className="text-sm text-white truncate">{producto.titulo_es}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <NuevoMenuVirtualDialog
        open={dialogAbierto}
        esSubcategoria={padreParaNuevo !== null}
        saving={creando}
        onOpenChange={setDialogAbierto}
        onConfirm={handleCrear}
      />
      <EliminarMenuVirtualDialog
        open={eliminarAbierto}
        nodoNombre={nodoAEliminar?.nombre ?? null}
        onOpenChange={setEliminarAbierto}
        onConfirm={handleEliminar}
      />
    </div>
  );
}
