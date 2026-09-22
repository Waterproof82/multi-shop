'use client';

import { useState, useEffect, useCallback, useMemo, Fragment } from 'react';
import Link from 'next/link';
import { Plus, Pencil, Trash2, Loader2, Search, ArrowUp, ArrowDown, Languages, ChevronDown, ChevronRight, Tags, FolderTree, UtensilsCrossed, GlassWater, GripVertical, ExternalLink, CornerDownRight } from 'lucide-react';
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
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { fetchWithCsrf } from '@/lib/csrf-client';
import { useLanguage, type Language } from '@/lib/language-context';
import { useAdmin } from '@/lib/admin-context';
import { t } from '@/lib/translations';
import { reordenarPorArrastre } from '@/lib/drag-reorder';

interface Category {
  id: string;
  nombre_es: string;
  nombre_en: string;
  nombre_fr: string;
  nombre_it: string;
  nombre_de: string;
  descripcion_es: string | null;
  descripcion_en: string | null;
  descripcion_fr: string | null;
  descripcion_it: string | null;
  descripcion_de: string | null;
  orden: number;
  categoria_complemento_de: string | null;
  complemento_obligatorio: boolean;
  categoria_padre_id: string | null;
  tipo_producto: 'comida' | 'bebida';
  hasSubcategories?: boolean;
}

interface CategoryFormData {
  nombre_es: string;
  nombre_en: string;
  nombre_fr: string;
  nombre_it: string;
  nombre_de: string;
  descripcion_es: string;
  descripcion_en: string;
  descripcion_fr: string;
  descripcion_it: string;
  descripcion_de: string;
  orden: number;
  categoria_complemento_de: string | null;
  complemento_obligatorio: boolean;
  categoria_padre_id: string | null;
  tipo_producto: 'comida' | 'bebida';
}

interface MenuVirtualAdmin {
  id: string;
  empresaId: string;
  padreId: string | null;
  nombre: string;
  orden: number;
  productosCount: number;
}

type TopLevelNode =
  | { kind: 'categoria'; id: string; orden: number; categoria: Category }
  | { kind: 'menu_virtual'; id: string; orden: number; menu: MenuVirtualAdmin };

const emptyForm: CategoryFormData = {
  nombre_es: '',
  nombre_en: '',
  nombre_fr: '',
  nombre_it: '',
  nombre_de: '',
  descripcion_es: '',
  descripcion_en: '',
  descripcion_fr: '',
  descripcion_it: '',
  descripcion_de: '',
  orden: 0,
  categoria_complemento_de: null,
  complemento_obligatorio: false,
  categoria_padre_id: null,
  tipo_producto: 'comida',
};

function CategoryTypeBadges({ cat, parentName, empresaTipo, language }: Readonly<{
  cat: Category;
  parentName: string | null;
  empresaTipo?: string;
  language: Language;
}>) {
  return (
    <div className="flex flex-col gap-1">
      {cat.categoria_padre_id ? (
        <>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-teal-500/20 border border-teal-400/30 text-teal-300 text-xs font-medium">
            {t("subcategory", language)}
          </span>
          {parentName && (
            <span className="text-xs text-slate-400">
              → {parentName}
            </span>
          )}
        </>
      ) : (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-700/50 border border-slate-600 text-slate-300 text-xs font-medium">
          {t("mainCategory", language)}
        </span>
      )}
      {empresaTipo === 'restaurante' && (cat.tipo_producto === 'bebida' ? (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/20 border border-blue-400/30 text-blue-300 text-xs font-medium">
          <GlassWater className="w-3 h-3" /> Bar
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-500/20 border border-orange-400/30 text-orange-300 text-xs font-medium">
          <UtensilsCrossed className="w-3 h-3" /> Cocina
        </span>
      ))}
    </div>
  );
}

function CategorySubcategoriasBadge({ hasSubcategories, language }: Readonly<{ hasSubcategories: boolean; language: Language }>) {
  if (!hasSubcategories) return <span className="text-slate-400">—</span>;
  return (
    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-cyan-500/20 border border-cyan-400/30 text-cyan-300 text-xs font-medium">
      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
        <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
        <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" />
      </svg>
      {t("yes", language)}
    </span>
  );
}

function CategoryRowActions({ cat, language, onEdit, onDelete }: Readonly<{
  cat: Category;
  language: Language;
  onEdit: () => void;
  onDelete: () => void;
}>) {
  return (
    <>
      <button type="button"
        onClick={onEdit}
        aria-label={`${t("edit", language)} ${cat.nombre_es}`}
        className="p-2 text-cyan-400 hover:text-cyan-300 mr-1 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-slate-900 focus-visible:ring-offset-2 min-h-[44px] min-w-[44px] inline-flex items-center justify-center transition-colors"
      >
        <Pencil className="h-4 w-4" />
      </button>
      <button type="button"
        onClick={onDelete}
        aria-label={`${t("delete", language)} ${cat.nombre_es}`}
        className="p-2 text-red-400 hover:text-red-300 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-slate-900 focus-visible:ring-offset-2 min-h-[44px] min-w-[44px] inline-flex items-center justify-center transition-colors"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </>
  );
}

function MenuVirtualRowActions({ menu, language }: Readonly<{ menu: MenuVirtualAdmin; language: Language }>) {
  return (
    <Link
      href={`/admin/menus-virtuales?nodo=${menu.id}`}
      aria-label={`${t("goToVirtualMenus", language)}: ${menu.nombre}`}
      className="p-2 text-violet-400 hover:text-violet-300 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-slate-900 focus-visible:ring-offset-2 min-h-[44px] min-w-[44px] inline-flex items-center justify-center transition-colors"
    >
      <ExternalLink className="h-4 w-4" />
    </Link>
  );
}

interface SortableMenuVirtualRowProps {
  menu: MenuVirtualAdmin;
  hasSubcategories: boolean;
  language: Language;
}

function SortableMenuVirtualRow({ menu, hasSubcategories, language }: Readonly<SortableMenuVirtualRowProps>) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: menu.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <tr ref={setNodeRef} style={style} className="hover:bg-white/5 transition-colors border-b border-white/10">
      <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-300">
        <button
          type="button"
          aria-label={t('orderLabel', language)}
          className="touch-none p-1.5 -ml-1.5 text-slate-400 hover:text-white cursor-grab active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="w-3.5 h-3.5" />
        </button>
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-white">
        {menu.nombre}
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-sm">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-500/20 border border-violet-400/30 text-violet-300 text-xs font-medium">
          {t("categoryTypeVirtualMenu", language)}
        </span>
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-sm">
        <CategorySubcategoriasBadge hasSubcategories={hasSubcategories} language={language} />
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-400">—</td>
      <td className="px-4 py-3 whitespace-nowrap text-right text-sm">
        <MenuVirtualRowActions menu={menu} language={language} />
      </td>
    </tr>
  );
}

interface SortableMenuVirtualCardProps {
  menu: MenuVirtualAdmin;
  language: Language;
}

function SortableMenuVirtualCard({ menu, language }: Readonly<SortableMenuVirtualCardProps>) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: menu.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="p-4 hover:bg-white/5 transition-colors flex items-start gap-2">
      <button
        type="button"
        aria-label={t('orderLabel', language)}
        className="touch-none p-1.5 mt-0.5 text-slate-400 hover:text-white cursor-grab active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="w-4 h-4" />
      </button>
      <div className="flex items-start justify-between flex-1">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <p className="font-medium text-white">{menu.nombre}</p>
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-violet-500/20 border border-violet-400/30 text-violet-300 text-[10px] font-medium">
              {t("categoryTypeVirtualMenu", language)}
            </span>
          </div>
        </div>
        <MenuVirtualRowActions menu={menu} language={language} />
      </div>
    </div>
  );
}

interface SortableCategoryRowProps {
  cat: Category;
  parentName: string | null;
  hasSubcategories: boolean;
  complementoDeName: string | null;
  empresaTipo?: string;
  language: Language;
  onEdit: () => void;
  onDelete: () => void;
}

function SortableCategoryRow({ cat, parentName, hasSubcategories, complementoDeName, empresaTipo, language, onEdit, onDelete }: Readonly<SortableCategoryRowProps>) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: cat.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <tr ref={setNodeRef} style={style} className="hover:bg-white/5 transition-colors border-b border-white/10">
      <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-300">
        <button
          type="button"
          aria-label={t('orderLabel', language)}
          className="touch-none p-1.5 -ml-1.5 text-slate-400 hover:text-white cursor-grab active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="w-3.5 h-3.5" />
        </button>
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-white">
        <div className={`flex items-center gap-1.5 ${cat.categoria_padre_id ? 'pl-6 font-normal text-slate-200' : ''}`}>
          {cat.categoria_padre_id && (
            <CornerDownRight className="w-3.5 h-3.5 text-teal-400 shrink-0" aria-hidden="true" />
          )}
          <span>{cat.nombre_es}</span>
        </div>
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-sm">
        <CategoryTypeBadges cat={cat} parentName={parentName} empresaTipo={empresaTipo} language={language} />
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-sm">
        <CategorySubcategoriasBadge hasSubcategories={hasSubcategories} language={language} />
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-400">{complementoDeName ?? '—'}</td>
      <td className="px-4 py-3 whitespace-nowrap text-right text-sm">
        <CategoryRowActions cat={cat} language={language} onEdit={onEdit} onDelete={onDelete} />
      </td>
    </tr>
  );
}

interface SortableCategoryCardProps {
  cat: Category;
  parentName: string | null;
  hasSubcategories: boolean;
  language: Language;
  onEdit: () => void;
  onDelete: () => void;
}

function SortableCategoryCard({ cat, parentName, hasSubcategories, language, onEdit, onDelete }: Readonly<SortableCategoryCardProps>) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: cat.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="p-4 hover:bg-white/5 transition-colors flex items-start gap-2">
      <button
        type="button"
        aria-label={t('orderLabel', language)}
        className="touch-none p-1.5 mt-0.5 text-slate-400 hover:text-white cursor-grab active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="w-4 h-4" />
      </button>
      <div className="flex items-start justify-between flex-1">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            {cat.categoria_padre_id && (
              <CornerDownRight className="w-3.5 h-3.5 text-teal-400 shrink-0" aria-hidden="true" />
            )}
            <p className="font-medium text-white">{cat.nombre_es}</p>
            {cat.categoria_padre_id && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-teal-500/20 border border-teal-400/30 text-teal-300 text-[10px] font-medium">
                Sub
              </span>
            )}
            {!cat.categoria_padre_id && hasSubcategories && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-cyan-500/20 border border-cyan-400/30 text-cyan-300 text-[10px] font-medium">
                {t("mainCategory", language)}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-1">
            {cat.categoria_padre_id && parentName ? `${t("subcategoryOf", language)} ${parentName}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button"
            onClick={onEdit}
            aria-label={`${t("edit", language)} ${cat.nombre_es}`}
            className="p-2 text-cyan-400 hover:bg-cyan-500/20 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-slate-900 focus-visible:ring-offset-2 min-h-[44px] min-w-[44px] flex items-center justify-center transition-colors"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button type="button"
            onClick={onDelete}
            aria-label={`${t("delete", language)} ${cat.nombre_es}`}
            className="p-2 text-red-400 hover:bg-red-500/20 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-slate-900 focus-visible:ring-offset-2 min-h-[44px] min-w-[44px] flex items-center justify-center transition-colors"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CategoriasPage() {
  const { language } = useLanguage();
  const { empresaId, overrideEmpresaId, empresaTipo } = useAdmin();
  const effectiveEmpresaId = overrideEmpresaId || empresaId;
  const [categorias, setCategorias] = useState<Category[]>([]);
  const [menusVirtuales, setMenusVirtuales] = useState<MenuVirtualAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState<CategoryFormData>(emptyForm);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [nameSortDirection, setNameSortDirection] = useState<'asc' | 'desc'>('asc');
  const [showTranslations, setShowTranslations] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const fetchCategorias = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/categorias?empresaId=${effectiveEmpresaId}`);
      if (!res.ok) throw new Error(t("loadCategoriesError", language));
      const data = await res.json();
      setCategorias(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("unknownError", language));
    } finally {
      setLoading(false);
    }
  }, [language, effectiveEmpresaId]);

  const fetchMenusVirtuales = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/menus-virtuales');
      if (!res.ok) return;
      const data = await res.json() as MenuVirtualAdmin[];
      setMenusVirtuales(data);
    } catch {
      // best-effort: si falla, la tabla sigue mostrando las categorías reales igual
    }
  }, []);

  useEffect(() => {
    fetchCategorias();
    fetchMenusVirtuales();
  }, [fetchCategorias, fetchMenusVirtuales]);

  const handleSubmit = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      const url = editingId
        ? `/api/admin/categorias?id=${editingId}&empresaId=${effectiveEmpresaId}`
        : `/api/admin/categorias?empresaId=${effectiveEmpresaId}`;

      const method = editingId ? 'PUT' : 'POST';

      const res = await fetchWithCsrf(url, {
        method,
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || t("saveError", language));
      }

      await fetchCategorias();
      closeModal();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("unknownError", language));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t("confirmDeleteCategory", language))) return;

    try {
      const res = await fetchWithCsrf(`/api/admin/categorias?id=${id}&empresaId=${effectiveEmpresaId}`, {
        method: 'DELETE',
      });

      if (!res.ok) throw new Error(t("deleteError", language));
      await fetchCategorias();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("unknownError", language));
    }
  };

  const openEditModal = (categoria: Category) => {
    setFormData({
      nombre_es: categoria.nombre_es,
      nombre_en: categoria.nombre_en || '',
      nombre_fr: categoria.nombre_fr || '',
      nombre_it: categoria.nombre_it || '',
      nombre_de: categoria.nombre_de || '',
      descripcion_es: categoria.descripcion_es || '',
      descripcion_en: categoria.descripcion_en || '',
      descripcion_fr: categoria.descripcion_fr || '',
      descripcion_it: categoria.descripcion_it || '',
      descripcion_de: categoria.descripcion_de || '',
      orden: categoria.orden,
      categoria_complemento_de: categoria.categoria_complemento_de,
      complemento_obligatorio: categoria.complemento_obligatorio || false,
      categoria_padre_id: categoria.categoria_padre_id,
      tipo_producto: categoria.tipo_producto ?? 'comida',
    });
    setEditingId(categoria.id);
    setIsModalOpen(true);
  };

  const openCreateModal = () => {
    setFormData(emptyForm);
    setEditingId(null);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setFormData(emptyForm);
    setEditingId(null);
  };

  function toggleNameSort() {
    setNameSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
  }

  const padresCombinados = useMemo<TopLevelNode[]>(() => {
    const nodosCategoria: TopLevelNode[] = categorias
      .filter((c) => !c.categoria_padre_id)
      .map((categoria) => ({ kind: 'categoria' as const, id: categoria.id, orden: categoria.orden, categoria }));
    const nodosMenu: TopLevelNode[] = menusVirtuales
      .filter((m) => !m.padreId)
      .map((menu) => ({ kind: 'menu_virtual' as const, id: menu.id, orden: menu.orden, menu }));
    return [...nodosCategoria, ...nodosMenu].sort((a, b) => a.orden - b.orden);
  }, [categorias, menusVirtuales]);

  const hijosDe = useCallback(
    (padreId: string) => categorias.filter((c) => c.categoria_padre_id === padreId).sort((a, b) => a.orden - b.orden),
    [categorias]
  );

  async function persistirOrdenCategorias(reordenados: Category[], original: Category[]) {
    const cambiados = reordenados.filter((cat) => {
      const previo = original.find((o) => o.id === cat.id);
      return previo && previo.orden !== cat.orden;
    });
    await Promise.all(cambiados.map((cat) =>
      fetchWithCsrf(`/api/admin/categorias?id=${cat.id}&empresaId=${effectiveEmpresaId}`, {
        method: 'PUT',
        body: JSON.stringify({ orden: cat.orden }),
      })
    ));
  }

  async function persistirOrdenCombinado(reordenados: TopLevelNode[], original: TopLevelNode[]) {
    const cambiados = reordenados.filter((nodo) => {
      const previo = original.find((o) => o.id === nodo.id);
      return previo && previo.orden !== nodo.orden;
    });
    await Promise.all(cambiados.map((nodo) =>
      nodo.kind === 'categoria'
        ? fetchWithCsrf(`/api/admin/categorias?id=${nodo.id}&empresaId=${effectiveEmpresaId}`, {
            method: 'PUT',
            body: JSON.stringify({ orden: nodo.orden }),
          })
        : fetchWithCsrf(`/api/admin/menus-virtuales/${nodo.id}`, {
            method: 'PUT',
            body: JSON.stringify({ orden: nodo.orden }),
          })
    ));
  }

  function handleDragEndPadres(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const reordenados = reordenarPorArrastre(padresCombinados, String(active.id), String(over.id));
    if (reordenados === padresCombinados) return;
    setCategorias((prev) => prev.map((c) => {
      const match = reordenados.find((r) => r.kind === 'categoria' && r.id === c.id);
      return match ? { ...c, orden: match.orden } : c;
    }));
    setMenusVirtuales((prev) => prev.map((m) => {
      const match = reordenados.find((r) => r.kind === 'menu_virtual' && r.id === m.id);
      return match ? { ...m, orden: match.orden } : m;
    }));
    void persistirOrdenCombinado(reordenados, padresCombinados);
  }

  function handleDragEndHijos(padreId: string, event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const hijos = hijosDe(padreId);
    const reordenados = reordenarPorArrastre(hijos, String(active.id), String(over.id));
    if (reordenados === hijos) return;
    setCategorias((prev) => prev.map((c) => reordenados.find((r) => r.id === c.id) ?? c));
    void persistirOrdenCategorias(reordenados, hijos);
  }

  const isSearching = searchTerm.trim().length > 0;

  const filteredCategorias = categorias
    .filter((cat) => {
      const term = searchTerm.toLowerCase();
      return (
        cat.nombre_es?.toLowerCase().includes(term) ||
        cat.nombre_en?.toLowerCase().includes(term) ||
        cat.nombre_fr?.toLowerCase().includes(term) ||
        cat.nombre_it?.toLowerCase().includes(term) ||
        cat.nombre_de?.toLowerCase().includes(term)
      );
    })
    .map((cat) => {
      const parentCat = cat.categoria_padre_id
        ? categorias.find((c) => c.id === cat.categoria_padre_id)
        : null;
      return {
        ...cat,
        hasSubcategories: categorias.some((c) => c.categoria_padre_id === cat.id),
        parentName: parentCat?.nombre_es || null,
      };
    })
    .sort((a, b) => {
      if (a.categoria_padre_id !== b.categoria_padre_id) {
        if (a.categoria_padre_id && !b.categoria_padre_id) return 1;
        if (!a.categoria_padre_id && b.categoria_padre_id) return -1;
      }
      const aVal = a.nombre_es?.toLowerCase() ?? '';
      const bVal = b.nombre_es?.toLowerCase() ?? '';
      return nameSortDirection === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const subcategoriasCount = categorias.filter(cat => cat.categoria_padre_id !== null).length;

  return (
    <div className="pt-16 lg:pt-0 px-6 py-8 space-y-8 min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header con stats */}
      <div className="backdrop-blur-2xl bg-white/10 border border-white/20 rounded-2xl p-6 sm:p-8 shadow-2xl">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">{t("categoriesTitle", language)}</h1>
            <p className="text-slate-300 text-sm mt-1">{t("categoriesSubtitle", language)}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <section className="backdrop-blur-xl bg-gradient-to-br from-cyan-500/20 to-cyan-700/20 border border-cyan-400/30 rounded-xl px-3 sm:px-4 py-3 text-center hover:shadow-[0_0_20px_rgba(34,211,238,0.3)] transition-shadow duration-300">
              <Tags className="w-5 h-5 sm:w-6 sm:h-6 text-cyan-300 mx-auto mb-2" />
              <span className="text-lg sm:text-2xl font-semibold text-white">{categorias.filter(c => !c.categoria_padre_id).length}</span>
              <p className="text-slate-300 text-[10px] sm:text-xs">{t("categoriesLabel", language)}</p>
            </section>
            <section className="backdrop-blur-xl bg-gradient-to-br from-teal-500/20 to-teal-700/20 border border-teal-400/30 rounded-xl px-3 sm:px-4 py-3 text-center hover:shadow-[0_0_20px_rgba(13,148,136,0.3)] transition-shadow duration-300">
              <FolderTree className="w-5 h-5 sm:w-6 sm:h-6 text-teal-300 mx-auto mb-2" />
              <span className="text-lg sm:text-2xl font-semibold text-white">{subcategoriasCount}</span>
              <p className="text-slate-300 text-[10px] sm:text-xs">{t("subcategories", language)}</p>
            </section>
          </div>
        </div>
      </div>

      {/* Buscador y acciones */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="relative flex-1 w-full sm:max-w-xs backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl px-3 py-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            type="text"
            placeholder={t("searchCategories", language)}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            aria-label={t("searchCategories", language)}
            className="pl-10 w-full bg-transparent border-0 text-white placeholder:text-slate-400 focus:outline-none focus:ring-0"
          />
        </div>
        <Button onClick={openCreateModal} className="w-full sm:w-auto">
          <Plus className="h-4 w-4" />
          <span>{t("newCategory", language)}</span>
        </Button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-md">
          {error}
        </div>
      )}

      <div className="backdrop-blur-2xl bg-white/10 border border-white/20 rounded-2xl shadow-2xl overflow-hidden">
        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto scrollbar scrollbar-thumb-white/20 scrollbar-track-transparent scrollbar-thin">
          <table className="min-w-full divide-y divide-white/10">
            <thead className="bg-white/5 border-b border-white/10">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase">
                  {t("orderLabel", language)}
                </th>
                <th
                  className={`px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase ${isSearching ? 'cursor-pointer hover:bg-white/10 transition-colors' : ''}`}
                  onClick={isSearching ? toggleNameSort : undefined}
                >
                    <div className="flex items-center gap-1">
                      {t("nameES", language)}
                      {isSearching && (
                        nameSortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                      )}
                    </div>
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase">
                  {t("typeLabel", language)}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase">
                  {t("subcategories", language)}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase">
                  {t("complementOf", language)}
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-300 uppercase">
                  {t("actions", language)}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {isSearching ? (
                filteredCategorias.map((cat) => (
                  <tr key={cat.id} className="hover:bg-white/5 transition-colors border-b border-white/10">
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-300">
                      {cat.orden}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-white">
                      {cat.nombre_es}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm">
                      <CategoryTypeBadges cat={cat} parentName={cat.parentName} empresaTipo={empresaTipo} language={language} />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm">
                      <CategorySubcategoriasBadge hasSubcategories={!!cat.hasSubcategories} language={language} />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-400">
                      {cat.categoria_complemento_de
                        ? categorias.find(c => c.id === cat.categoria_complemento_de)?.nombre_es || '—'
                        : '—'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right text-sm">
                      <CategoryRowActions cat={cat} language={language} onEdit={() => openEditModal(cat)} onDelete={() => handleDelete(cat.id)} />
                    </td>
                  </tr>
                ))
              ) : (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEndPadres}>
                  <SortableContext items={padresCombinados.map(n => n.id)} strategy={verticalListSortingStrategy}>
                    {padresCombinados.map((nodo) => {
                      if (nodo.kind === 'menu_virtual') {
                        return (
                          <SortableMenuVirtualRow
                            key={nodo.id}
                            menu={nodo.menu}
                            hasSubcategories={menusVirtuales.some(m => m.padreId === nodo.id)}
                            language={language}
                          />
                        );
                      }
                      const padre = nodo.categoria;
                      const hijos = hijosDe(padre.id);
                      return (
                        <Fragment key={padre.id}>
                          <SortableCategoryRow
                            cat={padre}
                            parentName={null}
                            hasSubcategories={hijos.length > 0}
                            complementoDeName={padre.categoria_complemento_de ? categorias.find(c => c.id === padre.categoria_complemento_de)?.nombre_es ?? null : null}
                            empresaTipo={empresaTipo}
                            language={language}
                            onEdit={() => openEditModal(padre)}
                            onDelete={() => handleDelete(padre.id)}
                          />
                          {hijos.length > 0 && (
                            <DndContext
                              sensors={sensors}
                              collisionDetection={closestCenter}
                              onDragEnd={(event) => handleDragEndHijos(padre.id, event)}
                            >
                              <SortableContext items={hijos.map(h => h.id)} strategy={verticalListSortingStrategy}>
                                {hijos.map((hijo) => (
                                  <SortableCategoryRow
                                    key={hijo.id}
                                    cat={hijo}
                                    parentName={padre.nombre_es}
                                    hasSubcategories={false}
                                    complementoDeName={hijo.categoria_complemento_de ? categorias.find(c => c.id === hijo.categoria_complemento_de)?.nombre_es ?? null : null}
                                    empresaTipo={empresaTipo}
                                    language={language}
                                    onEdit={() => openEditModal(hijo)}
                                    onDelete={() => handleDelete(hijo.id)}
                                  />
                                ))}
                              </SortableContext>
                            </DndContext>
                          )}
                        </Fragment>
                      );
                    })}
                  </SortableContext>
                </DndContext>
              )}
              {(isSearching ? filteredCategorias.length === 0 : padresCombinados.length === 0) && (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-400">
                    {isSearching ? t("noCategoriesFound", language) : t("noCategoriesYet", language)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="md:hidden divide-y divide-white/10">
          {isSearching ? (
            filteredCategorias.map((cat) => (
              <div key={cat.id} className="p-4 hover:bg-white/5 transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400">#{cat.orden}</span>
                      <p className="font-medium text-white">{cat.nombre_es}</p>
                      {cat.categoria_padre_id && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-teal-500/20 border border-teal-400/30 text-teal-300 text-[10px] font-medium">
                          Sub
                        </span>
                      )}
                      {!cat.categoria_padre_id && cat.hasSubcategories && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-cyan-500/20 border border-cyan-400/30 text-cyan-300 text-[10px] font-medium">
                          {t("mainCategory", language)}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      {cat.categoria_padre_id && cat.parentName ? `${t("subcategoryOf", language)} ${cat.parentName}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button"
                      onClick={() => openEditModal(cat)}
                      aria-label={`${t("edit", language)} ${cat.nombre_es}`}
                      className="p-2 text-cyan-400 hover:bg-cyan-500/20 dark:hover:bg-cyan-500/20 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-slate-900 focus-visible:ring-offset-2 min-h-[44px] min-w-[44px] flex items-center justify-center transition-colors"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button type="button"
                      onClick={() => handleDelete(cat.id)}
                      aria-label={`${t("delete", language)} ${cat.nombre_es}`}
                      className="p-2 text-red-400 hover:bg-red-500/20 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-slate-900 focus-visible:ring-offset-2 min-h-[44px] min-w-[44px] flex items-center justify-center transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEndPadres}>
              <SortableContext items={padresCombinados.map(n => n.id)} strategy={verticalListSortingStrategy}>
                {padresCombinados.map((nodo) => {
                  if (nodo.kind === 'menu_virtual') {
                    return <SortableMenuVirtualCard key={nodo.id} menu={nodo.menu} language={language} />;
                  }
                  const padre = nodo.categoria;
                  const hijos = hijosDe(padre.id);
                  return (
                    <Fragment key={padre.id}>
                      <SortableCategoryCard
                        cat={padre}
                        parentName={null}
                        hasSubcategories={hijos.length > 0}
                        language={language}
                        onEdit={() => openEditModal(padre)}
                        onDelete={() => handleDelete(padre.id)}
                      />
                      {hijos.length > 0 && (
                        <DndContext
                          sensors={sensors}
                          collisionDetection={closestCenter}
                          onDragEnd={(event) => handleDragEndHijos(padre.id, event)}
                        >
                          <SortableContext items={hijos.map(h => h.id)} strategy={verticalListSortingStrategy}>
                            <div className="ml-6 border-l-2 border-teal-400/20 divide-y divide-white/10">
                              {hijos.map((hijo) => (
                                <SortableCategoryCard
                                  key={hijo.id}
                                  cat={hijo}
                                  parentName={padre.nombre_es}
                                  hasSubcategories={false}
                                  language={language}
                                  onEdit={() => openEditModal(hijo)}
                                  onDelete={() => handleDelete(hijo.id)}
                                />
                              ))}
                            </div>
                          </SortableContext>
                        </DndContext>
                      )}
                    </Fragment>
                  );
                })}
              </SortableContext>
            </DndContext>
          )}
          {(isSearching ? filteredCategorias.length === 0 : padresCombinados.length === 0) && (
            <div className="p-8 text-center text-slate-400">
              {isSearching ? t("noCategoriesFound", language) : t("noCategoriesYet", language)}
            </div>
          )}
        </div>
      </div>

      <Dialog open={isModalOpen} onOpenChange={(open) => { if (!open) closeModal(); }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingId ? t("editCategory", language) : t("newCategory", language)}
            </DialogTitle>
            <DialogDescription>
              {editingId ? t("editCategoryDesc", language) : t("newCategoryDesc", language)}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="nombre_es" className="block text-sm font-medium text-foreground mb-1">
                {t("nameSpanish", language)} <span className="text-destructive" aria-hidden="true">*</span>
              </label>
              <Input
                id="nombre_es"
                type="text"
                required
                value={formData.nombre_es}
                onChange={(e) => setFormData({ ...formData, nombre_es: e.target.value })}
              />
            </div>

            {showTranslations && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="nombre_en" className="block text-sm font-medium text-foreground mb-1">
                    {t("nameEnglish", language)}
                  </label>
                  <Input
                    id="nombre_en"
                    type="text"
                    value={formData.nombre_en}
                    onChange={(e) => setFormData({ ...formData, nombre_en: e.target.value })}
                  />
                </div>
                <div>
                  <label htmlFor="nombre_fr" className="block text-sm font-medium text-foreground mb-1">
                    {t("nameFrench", language)}
                  </label>
                  <Input
                    id="nombre_fr"
                    type="text"
                    value={formData.nombre_fr}
                    onChange={(e) => setFormData({ ...formData, nombre_fr: e.target.value })}
                  />
                </div>
                <div>
                  <label htmlFor="nombre_it" className="block text-sm font-medium text-foreground mb-1">
                    {t("nameItalian", language)}
                  </label>
                  <Input
                    id="nombre_it"
                    type="text"
                    value={formData.nombre_it}
                    onChange={(e) => setFormData({ ...formData, nombre_it: e.target.value })}
                  />
                </div>
                <div>
                  <label htmlFor="nombre_de" className="block text-sm font-medium text-foreground mb-1">
                    {t("nameGerman", language)}
                  </label>
                  <Input
                    id="nombre_de"
                    type="text"
                    value={formData.nombre_de}
                    onChange={(e) => setFormData({ ...formData, nombre_de: e.target.value })}
                  />
                </div>
              </div>
            )}

            <div>
              <label htmlFor="descripcion_es" className="block text-sm font-medium text-foreground mb-1">
                {t("descSpanish", language)}
              </label>
              <Textarea
                id="descripcion_es"
                value={formData.descripcion_es}
                onChange={(e) => setFormData({ ...formData, descripcion_es: e.target.value })}
                rows={2}
                placeholder={t("descPlaceholder", language)}
              />
            </div>

            {showTranslations && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="descripcion_en" className="block text-sm font-medium text-foreground mb-1">
                    {t("descEnglish", language)}
                  </label>
                  <Textarea
                    id="descripcion_en"
                    value={formData.descripcion_en}
                    onChange={(e) => setFormData({ ...formData, descripcion_en: e.target.value })}
                    rows={2}
                  />
                </div>
                <div>
                  <label htmlFor="descripcion_fr" className="block text-sm font-medium text-foreground mb-1">
                    {t("descFrench", language)}
                  </label>
                  <Textarea
                    id="descripcion_fr"
                    value={formData.descripcion_fr}
                    onChange={(e) => setFormData({ ...formData, descripcion_fr: e.target.value })}
                    rows={2}
                  />
                </div>
                <div>
                  <label htmlFor="descripcion_it" className="block text-sm font-medium text-foreground mb-1">
                    {t("descItalian", language)}
                  </label>
                  <Textarea
                    id="descripcion_it"
                    value={formData.descripcion_it}
                    onChange={(e) => setFormData({ ...formData, descripcion_it: e.target.value })}
                    rows={2}
                  />
                </div>
                <div>
                  <label htmlFor="descripcion_de" className="block text-sm font-medium text-foreground mb-1">
                    {t("descGerman", language)}
                  </label>
                  <Textarea
                    id="descripcion_de"
                    value={formData.descripcion_de}
                    onChange={(e) => setFormData({ ...formData, descripcion_de: e.target.value })}
                    rows={2}
                  />
                </div>
              </div>
            )}

            <div>
              <label htmlFor="categoria_padre_id" className="block text-sm font-medium text-foreground mb-1">
                {t("parentCategory", language)}
              </label>
              <select
                id="categoria_padre_id"
                value={formData.categoria_padre_id || ''}
                onChange={(e) => setFormData({ ...formData, categoria_padre_id: e.target.value || null })}
                className="w-full px-3 py-2 rounded-md border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background transition-colors cursor-pointer"
                aria-label={t("parentCategory", language)}
              >
                <option value="">{t("noParent", language)}</option>
                {categorias
                  .filter((c) => !c.categoria_padre_id && c.id !== editingId)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre_es}
                    </option>
                  ))}
              </select>
              <p className="text-xs text-muted-foreground mt-1">
                {t("parentCategoryHelp", language)}
              </p>
            </div>

            <div>
              <label htmlFor="categoria_complemento_de" className="block text-sm font-medium text-foreground mb-1">
                {t("complementCategory", language)}
              </label>
              <select
                id="categoria_complemento_de"
                value={formData.categoria_complemento_de || ''}
                onChange={(e) => setFormData({ ...formData, categoria_complemento_de: e.target.value || null })}
                className="w-full px-3 py-2 rounded-md border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background transition-colors cursor-pointer"
                aria-label={t("complementCategory", language)}
              >
                <option value="">{t("noParent", language)}</option>
                {categorias
                  .filter((c) => c.id !== editingId)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre_es}
                    </option>
                  ))}
              </select>
              <p className="text-xs text-muted-foreground mt-1">
                {t("complementCategoryHelp", language)}
              </p>
            </div>

            {formData.categoria_complemento_de && (
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="complemento_obligatorio"
                  checked={formData.complemento_obligatorio}
                  onChange={(e) => setFormData({ ...formData, complemento_obligatorio: e.target.checked })}
                  className="w-4 h-4 rounded border-border text-primary focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background cursor-pointer accent-primary"
                />
                <label htmlFor="complemento_obligatorio" className="text-sm text-foreground cursor-pointer">
                  {t("mandatoryComplement", language)}
                </label>
              </div>
            )}

            {empresaTipo === 'restaurante' && (
            <div>
              <p className="block text-sm font-medium text-foreground mb-2">
                Tipo
              </p>
              <div className="flex gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="tipo_producto"
                    value="comida"
                    checked={formData.tipo_producto !== 'bebida'}
                    onChange={() => setFormData({ ...formData, tipo_producto: 'comida' })}
                    className="accent-primary"
                  />
                  <span className="inline-flex items-center gap-1 text-sm px-2 py-0.5 rounded-full bg-orange-500/20 border border-orange-400/30 text-orange-400">
                    <UtensilsCrossed className="w-3 h-3" /> Cocina
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="tipo_producto"
                    value="bebida"
                    checked={formData.tipo_producto === 'bebida'}
                    onChange={() => setFormData({ ...formData, tipo_producto: 'bebida' })}
                    className="accent-primary"
                  />
                  <span className="inline-flex items-center gap-1 text-sm px-2 py-0.5 rounded-full bg-blue-500/20 border border-blue-400/30 text-blue-400">
                    <GlassWater className="w-3 h-3" /> Bar
                  </span>
                </label>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Todos los productos de esta categoría se enrutarán a Cocina o Bar.
              </p>
            </div>
            )}

            <div className="col-span-2">
              <button
                type="button"
                onClick={() => setShowTranslations(!showTranslations)}
                className="flex items-center gap-2 text-sm font-medium text-foreground hover:text-primary dark:hover:text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {showTranslations ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                <Languages className="h-4 w-4" />
                {t("translationsToggle", language)} ({showTranslations ? t("hideLabel", language) : t("showLabel", language)})
              </button>
            </div>

            <div className="flex justify-end gap-3 pt-4 col-span-2">
              <Button variant="outline" type="button" onClick={closeModal}>
                {t("cancel", language)}
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    {t("savingProgress", language)}
                  </>
                ) : (
                  t("save", language)
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
