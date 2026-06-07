'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Pencil, Trash2, Loader2, Search, ArrowUpDown, ArrowUp, ArrowDown, Languages, ChevronDown, ChevronRight, Tags, FolderTree } from 'lucide-react';
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
import { useLanguage } from '@/lib/language-context';
import { useAdmin } from '@/lib/admin-context';
import { t } from '@/lib/translations';

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
}

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
};

export default function CategoriasPage() {
  const { language } = useLanguage();
  const { empresaId, overrideEmpresaId } = useAdmin();
  const effectiveEmpresaId = overrideEmpresaId || empresaId;
  const [categorias, setCategorias] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState<CategoryFormData>(emptyForm);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<'orden' | 'nombre_es'>('orden');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [showTranslations, setShowTranslations] = useState(false);

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

  useEffect(() => {
    fetchCategorias();
  }, [fetchCategorias]);

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

  const handleSort = (field: 'orden' | 'nombre_es') => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

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
    .map(cat => {
      const parentCat = cat.categoria_padre_id 
        ? categorias.find(c => c.id === cat.categoria_padre_id) 
        : null;
      return {
        ...cat,
        hasSubcategories: categorias.some(c => c.categoria_padre_id === cat.id),
        parentName: parentCat?.nombre_es || null
      };
    })
    .sort((a, b) => {
      // Put categories with subcategories first, then subcategories
      if (a.categoria_padre_id !== b.categoria_padre_id) {
        if (a.categoria_padre_id && !b.categoria_padre_id) return 1;
        if (!a.categoria_padre_id && b.categoria_padre_id) return -1;
      }
      if (sortField === 'orden') {
        return sortDirection === 'asc' ? a.orden - b.orden : b.orden - a.orden;
      }
      const aVal = String(a[sortField as keyof Category] ?? '').toLowerCase();
      const bVal = String(b[sortField as keyof Category] ?? '').toLowerCase();
      return sortDirection === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
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
                <th 
                  className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase cursor-pointer hover:bg-white/10 transition-colors"
                  onClick={() => handleSort('orden')}
                >
                    <div className="flex items-center gap-1">
                      {t("orderLabel", language)}
                      {sortField === 'orden' && (
                        sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                      )}
                      {sortField !== 'orden' && <ArrowUpDown className="h-3 w-3 opacity-30" />}
                    </div>
                </th>
                <th 
                  className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase cursor-pointer hover:bg-white/10 transition-colors"
                  onClick={() => handleSort('nombre_es')}
                >
                    <div className="flex items-center gap-1">
                      {t("nameES", language)}
                      {sortField === 'nombre_es' && (
                        sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                      )}
                      {sortField !== 'nombre_es' && <ArrowUpDown className="h-3 w-3 opacity-30" />}
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
              {filteredCategorias.map((cat) => (
                <tr key={cat.id} className="hover:bg-white/5 transition-colors border-b border-white/10">
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-300">
                    {cat.orden}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-white">
                    {cat.nombre_es}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm">
                    {cat.categoria_padre_id ? (
                      <div className="flex flex-col gap-1">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-teal-500/20 border border-teal-400/30 text-teal-300 text-xs font-medium">
                          {t("subcategory", language)}
                        </span>
                        {cat.parentName && (
                          <span className="text-xs text-slate-400">
                            → {cat.parentName}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-700/50 border border-slate-600 text-slate-300 text-xs font-medium">
                        {t("mainCategory", language)}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm">
                    {cat.hasSubcategories ? (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-cyan-500/20 border border-cyan-400/30 text-cyan-300 text-xs font-medium">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
                          <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" />
                        </svg>
                        {t("yes", language)}
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-400">
                    {cat.categoria_complemento_de 
                      ? categorias.find(c => c.id === cat.categoria_complemento_de)?.nombre_es || '—'
                      : '—'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-right text-sm">
                    <button
                      onClick={() => openEditModal(cat)}
                      aria-label={`${t("edit", language)} ${cat.nombre_es}`}
                      className="p-2 text-cyan-400 hover:text-cyan-300 mr-1 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-slate-900 focus-visible:ring-offset-2 min-h-[44px] min-w-[44px] inline-flex items-center justify-center transition-colors"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(cat.id)}
                      aria-label={`${t("delete", language)} ${cat.nombre_es}`}
                      className="p-2 text-red-400 hover:text-red-300 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-slate-900 focus-visible:ring-offset-2 min-h-[44px] min-w-[44px] inline-flex items-center justify-center transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {filteredCategorias.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-slate-400">
                    {searchTerm ? t("noCategoriesFound", language) : t("noCategoriesYet", language)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="md:hidden divide-y divide-white/10">
          {filteredCategorias.map((cat) => (
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
                  <button
                    onClick={() => openEditModal(cat)}
                    aria-label={`${t("edit", language)} ${cat.nombre_es}`}
                    className="p-2 text-cyan-400 hover:bg-cyan-500/20 dark:hover:bg-cyan-500/20 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-slate-900 focus-visible:ring-offset-2 min-h-[44px] min-w-[44px] flex items-center justify-center transition-colors"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(cat.id)}
                    aria-label={`${t("delete", language)} ${cat.nombre_es}`}
                    className="p-2 text-red-400 hover:bg-red-500/20 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-slate-900 focus-visible:ring-offset-2 min-h-[44px] min-w-[44px] flex items-center justify-center transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
          {filteredCategorias.length === 0 && (
            <div className="p-8 text-center text-slate-400">
              {searchTerm ? t("noCategoriesFound", language) : t("noCategoriesYet", language)}
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
              <label htmlFor="orden" className="block text-sm font-medium text-foreground mb-1">
                {t("orderLabel", language)}
              </label>
              <Input
                id="orden"
                type="number"
                value={formData.orden}
                onChange={(e) => setFormData({ ...formData, orden: Number.parseInt(e.target.value) || 0 })}
              />
            </div>

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
