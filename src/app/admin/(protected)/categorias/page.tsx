'use client';

import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, X, Loader2, Search, ArrowUpDown, ArrowUp, ArrowDown, Languages, ChevronDown, ChevronRight, Tags, FolderTree } from 'lucide-react';
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

  useEffect(() => {
    fetchCategorias();
  }, []);

  const fetchCategorias = async () => {
    try {
      const res = await fetch('/api/admin/categorias');
      if (!res.ok) throw new Error(t("loadCategoriesError", language));
      const data = await res.json();
      setCategorias(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("unknownError", language));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      const url = editingId 
        ? `/api/admin/categorias?id=${editingId}` 
        : '/api/admin/categorias';
      
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
      const res = await fetchWithCsrf(`/api/admin/categorias?id=${id}`, {
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
    <div className="pt-16 lg:pt-0 px-6 py-6 space-y-6">
      {/* Header con stats */}
      <div className="bg-primary rounded-lg p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold text-primary-foreground">{t("categoriesTitle", language)}</h1>
            <p className="text-primary-foreground/80 text-sm mt-1">{t("categoriesSubtitle", language)}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-primary-foreground/20 rounded-lg px-3 sm:px-4 py-2 sm:py-3 text-center">
              <Tags className="w-4 h-4 sm:w-5 sm:h-5 text-primary-foreground mx-auto mb-1" />
              <span className="text-lg sm:text-2xl font-semibold text-primary-foreground">{categorias.filter(c => !c.categoria_padre_id).length}</span>
              <p className="text-primary-foreground/80 text-[10px] sm:text-xs">{t("categoriesLabel", language)}</p>
            </div>
            <div className="bg-primary-foreground/20 rounded-lg px-3 sm:px-4 py-2 sm:py-3 text-center">
              <FolderTree className="w-4 h-4 sm:w-5 sm:h-5 text-primary-foreground mx-auto mb-1" />
              <span className="text-lg sm:text-2xl font-semibold text-primary-foreground">{subcategoriasCount}</span>
              <p className="text-primary-foreground/80 text-[10px] sm:text-xs">{t("subcategories", language)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Buscador y acciones */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="relative flex-1 w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder={t("searchCategories", language)}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            aria-label={t("searchCategories", language)}
            className="pl-10 w-full"
          />
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring transition-colors duration-150 w-full sm:w-auto justify-center"
        >
          <Plus className="h-4 w-4" />
          <span>{t("newCategory", language)}</span>
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-md">
          {error}
        </div>
      )}

      <div className="bg-card rounded-lg shadow-elegant border border-border overflow-hidden">
        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-muted">
              <tr>
                <th 
                  className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase cursor-pointer hover:bg-muted"
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
                  className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase cursor-pointer hover:bg-muted"
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
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                  {t("typeLabel", language)}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                  {t("subcategories", language)}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                  {t("complementOf", language)}
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">
                  {t("actions", language)}
                </th>
              </tr>
            </thead>
            <tbody className="bg-card divide-y divide-border">
              {filteredCategorias.map((cat) => (
                <tr key={cat.id} className="hover:bg-muted/50">
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-foreground">
                    {cat.orden}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-foreground">
                    {cat.nombre_es}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm">
                    {cat.categoria_padre_id ? (
                      <div className="flex flex-col gap-1">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground text-xs font-medium">
                          {t("subcategory", language)}
                        </span>
                        {cat.parentName && (
                          <span className="text-xs text-muted-foreground">
                            → {cat.parentName}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-foreground text-xs font-medium">
                        {t("mainCategory", language)}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm">
                    {cat.hasSubcategories ? (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
                          <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" />
                        </svg>
                        Sí
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-muted-foreground">
                    {cat.categoria_complemento_de 
                      ? categorias.find(c => c.id === cat.categoria_complemento_de)?.nombre_es || '—'
                      : '—'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-right text-sm">
                    <button
                      onClick={() => openEditModal(cat)}
                      aria-label={`Editar ${cat.nombre_es}`}
                      className="text-primary hover:text-primary/80 mr-3 rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(cat.id)}
                      aria-label={`Eliminar ${cat.nombre_es}`}
                      className="text-destructive hover:text-destructive/80 rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {filteredCategorias.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-muted-foreground">
                    {searchTerm ? t("noCategoriesFound", language) : t("noCategoriesYet", language)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="md:hidden divide-y divide-border">
          {filteredCategorias.map((cat) => (
            <div key={cat.id} className="p-4 hover:bg-muted/50">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">#{cat.orden}</span>
                    <p className="font-medium text-foreground">{cat.nombre_es}</p>
                    {cat.categoria_padre_id && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-secondary text-secondary-foreground text-[10px] font-medium">
                        Sub
                      </span>
                    )}
                    {!cat.categoria_padre_id && cat.hasSubcategories && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-medium">
                        {t("mainCategory", language)}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {cat.categoria_padre_id && cat.parentName ? `${t("subcategoryOf", language)} ${cat.parentName}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openEditModal(cat)}
                    aria-label={`Editar ${cat.nombre_es}`}
                    className="p-1.5 text-primary hover:bg-primary/10 dark:hover:bg-primary/20 rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(cat.id)}
                    aria-label={`Eliminar ${cat.nombre_es}`}
                    className="p-1.5 text-destructive hover:bg-destructive/10 rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
          {filteredCategorias.length === 0 && (
            <div className="p-8 text-center text-muted-foreground">
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
                {t("nameSpanish", language)}
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
                aria-label="Categoría padre"
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
