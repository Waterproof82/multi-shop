'use client';

import { useState, useEffect, useMemo } from 'react';
import Image from 'next/image';
import { Plus, Pencil, Trash2, Loader2, Image as ImageIcon, Search, ArrowUpDown, ArrowUp, ArrowDown, Utensils, Star } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useAdmin } from '@/lib/admin-context';
import { useLanguage } from '@/lib/language-context';
import { t } from '@/lib/translations';
import { ProductFormDialog, DeleteConfirmDialog } from '@/components/admin/product-form-dialog';
import { fetchWithCsrf } from '@/lib/csrf-client';
import type { ProductoFormData } from '@/components/admin/product-form-dialog';
import { formatPrice } from '@/lib/format-price';

interface Categoria {
  id: string;
  nombre_es: string;
  categoria_padre_id: string | null;
}

interface Producto {
  id: string;
  titulo_es: string;
  descripcion_es: string | null;
  titulo_en: string | null;
  titulo_fr: string | null;
  titulo_it: string | null;
  titulo_de: string | null;
  descripcion_en: string | null;
  descripcion_fr: string | null;
  descripcion_it: string | null;
  descripcion_de: string | null;
  precio: number;
  foto_url: string | null;
  categoria_id: string | null;
  es_especial: boolean;
  activo: boolean;
}

const emptyForm: ProductoFormData = {
  titulo_es: '',
  titulo_en: '',
  titulo_fr: '',
  titulo_it: '',
  titulo_de: '',
  descripcion_es: '',
  descripcion_en: '',
  descripcion_fr: '',
  descripcion_it: '',
  descripcion_de: '',
  precio: '',
  foto_url: '',
  categoria_id: '',
  es_especial: false,
  activo: true,
};

const SortIndicator = ({ field, currentField, direction }: { field: keyof Producto | 'categoria'; currentField: keyof Producto | 'categoria'; direction: 'asc' | 'desc' }) => {
  if (field !== currentField) {
    return <ArrowUpDown className="h-3 w-3 opacity-30" />;
  }
  return direction === 'asc' 
    ? <ArrowUp className="h-3 w-3" /> 
    : <ArrowDown className="h-3 w-3" />;
};

export default function ProductosPage() {
  const { empresaSlug } = useAdmin();
  const { language } = useLanguage();
  const [productos, setProductos] = useState<Producto[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState<ProductoFormData>(emptyForm);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<keyof Producto | 'categoria'>('titulo_es');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [showTranslations, setShowTranslations] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ show: boolean; id: string | null; nombre: string | null }>({ show: false, id: null, nombre: null });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [prodRes, catRes] = await Promise.all([
        fetch('/api/admin/productos'),
        fetch('/api/admin/categorias'),
      ]);
      
      if (prodRes.ok) {
        const prodData = await prodRes.json();
        setProductos(prodData);
      }
      
      if (catRes.ok) {
        const catData = await catRes.json();
        setCategorias(catData);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("unknownError", language));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: { preventDefault: () => void }) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      const url = editingId 
        ? `/api/admin/productos?id=${editingId}` 
        : '/api/admin/productos';
      
      const method = editingId ? 'PUT' : 'POST';

      const payload = {
        ...formData,
        precio: Number.parseFloat(formData.precio) || 0,
        categoria_id: formData.categoria_id || null,
        titulo_en: formData.titulo_en || null,
        titulo_fr: formData.titulo_fr || null,
        titulo_it: formData.titulo_it || null,
        titulo_de: formData.titulo_de || null,
        descripcion_es: formData.descripcion_es || null,
        descripcion_en: formData.descripcion_en || null,
        descripcion_fr: formData.descripcion_fr || null,
        descripcion_it: formData.descripcion_it || null,
        descripcion_de: formData.descripcion_de || null,
        foto_url: formData.foto_url || null,
      };

      const res = await fetchWithCsrf(url, {
        method,
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || t("saveError", language));
      }

      await fetchData();
      closeModal();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("unknownError", language));
    } finally {
      setSaving(false);
    }
  };



  const openEditModal = (producto: Producto) => {
    setFormData({
      titulo_es: producto.titulo_es,
      titulo_en: producto.titulo_en || '',
      titulo_fr: producto.titulo_fr || '',
      titulo_it: producto.titulo_it || '',
      titulo_de: producto.titulo_de || '',
      descripcion_es: producto.descripcion_es || '',
      descripcion_en: producto.descripcion_en || '',
      descripcion_fr: producto.descripcion_fr || '',
      descripcion_it: producto.descripcion_it || '',
      descripcion_de: producto.descripcion_de || '',
      precio: producto.precio.toString(),
      foto_url: producto.foto_url || '',
      categoria_id: producto.categoria_id || '',
      es_especial: producto.es_especial,
      activo: producto.activo,
    });
    setEditingId(producto.id);
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

  const toggleActivo = async (prod: Producto) => {
    const newActivo = !prod.activo;
    setProductos(prev => prev.map(p => p.id === prod.id ? { ...p, activo: newActivo } : p));
    try {
      const res = await fetchWithCsrf(`/api/admin/productos?id=${prod.id}`, {
        method: 'PUT',
        body: JSON.stringify({ activo: newActivo }),
      });
      if (!res.ok) {
        setProductos(prev => prev.map(p => p.id === prod.id ? { ...p, activo: prod.activo } : p));
      }
    } catch {
      setProductos(prev => prev.map(p => p.id === prod.id ? { ...p, activo: prod.activo } : p));
    }
  };

  const getCategoriaNombre = (categoriaId: string | null) => {
    if (!categoriaId) return '—';
    const cat = categorias.find(c => c.id === categoriaId);
    return cat ? cat.nombre_es : '—';
  };

  const getAriaSortValue = (field: keyof Producto | 'categoria'): 'ascending' | 'descending' | 'none' => {
    if (sortField !== field) return 'none';
    return sortDirection === 'asc' ? 'ascending' : 'descending';
  };

  const handleSort = (field: keyof Producto | 'categoria') => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const handleDeleteProduct = (id: string) => {
    const prod = productos.find(p => p.id === id);
    setDeleteConfirm({ show: true, id, nombre: prod?.titulo_es ?? null });
  };

  const confirmDeleteProduct = async () => {
    if (!deleteConfirm.id) return;
    try {
      const res = await fetchWithCsrf(`/api/admin/productos?id=${deleteConfirm.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error(t("deleteError", language));
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("unknownError", language));
    } finally {
      setDeleteConfirm({ show: false, id: null, nombre: null });
    }
  };

  const getSortValue = (product: Producto, field: keyof Producto | 'categoria'): string | number => {
    if (field === 'categoria') {
      return getCategoriaNombre(product.categoria_id);
    }
    if (field === 'precio') {
      return product.precio;
    }
    if (field === 'es_especial') {
      return product.es_especial ? 1 : 0;
    }
    if (field === 'activo') {
      return product.activo ? 1 : 0;
    }
    return (product[field as keyof Producto] as string) || '';
  };

  const compareSortValues = (aVal: string | number, bVal: string | number): number => {
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
    }
    const aStr = String(aVal).toLowerCase();
    const bStr = String(bVal).toLowerCase();
    return sortDirection === 'asc' 
      ? aStr.localeCompare(bStr) 
      : bStr.localeCompare(aStr);
  };

  const filteredProductos = useMemo(() => productos
    .filter((prod) => {
      const term = searchTerm.toLowerCase();
      return (
        prod.titulo_es?.toLowerCase().includes(term) ||
        prod.titulo_en?.toLowerCase().includes(term) ||
        prod.titulo_fr?.toLowerCase().includes(term) ||
        prod.titulo_it?.toLowerCase().includes(term) ||
        prod.titulo_de?.toLowerCase().includes(term) ||
        prod.descripcion_es?.toLowerCase().includes(term) ||
        getCategoriaNombre(prod.categoria_id).toLowerCase().includes(term)
      );
    })
    .sort((a, b) => {
      const aVal = getSortValue(a, sortField);
      const bVal = getSortValue(b, sortField);
      return compareSortValues(aVal, bVal);
    }), // eslint-disable-next-line react-hooks/exhaustive-deps -- Helper functions defined inline, stable references
    [productos, searchTerm, sortField, sortDirection, categorias]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const productosEspeciales = productos.filter(p => p.es_especial).length;

  return (
    <div className="pt-16 lg:pt-0 px-6 py-6 space-y-6">
      {/* Header con stats */}
      <div className="bg-primary rounded-lg p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold text-primary-foreground">{t("productsTitle", language)}</h1>
            <p className="text-primary-foreground/80 text-sm mt-1">{t("productsSubtitle", language)}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-primary-foreground/20 rounded-lg px-3 sm:px-4 py-2 sm:py-3 text-center">
              <Utensils className="w-4 h-4 sm:w-5 sm:h-5 text-primary-foreground mx-auto mb-1" />
              <span className="text-lg sm:text-2xl font-semibold text-primary-foreground">{productos.length}</span>
              <p className="text-primary-foreground/80 text-[10px] sm:text-xs">{t("total", language)}</p>
            </div>
            <div className="bg-primary-foreground/20 rounded-lg px-3 sm:px-4 py-2 sm:py-3 text-center">
              <Star className="w-4 h-4 sm:w-5 sm:h-5 text-primary-foreground mx-auto mb-1" />
              <span className="text-lg sm:text-2xl font-semibold text-primary-foreground">{productosEspeciales}</span>
              <p className="text-primary-foreground/80 text-[10px] sm:text-xs">{t("destacados", language)}</p>
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
            placeholder={t("searchProducts", language)}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            aria-label={t("searchProducts", language)}
            className="pl-10 w-full"
          />
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 w-full sm:w-auto justify-center outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[44px]"
        >
          <Plus className="h-4 w-4" />
          <span>{t("newProduct", language)}</span>
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-md">
          {error}
        </div>
      )}

      {categorias.length === 0 && (
        <div className="mb-4 p-4 bg-secondary border border-border text-secondary-foreground rounded-md">
          {t("noCategoriesWarning", language)}
        </div>
      )}

      <div className="bg-card rounded-lg shadow-elegant border border-border overflow-hidden">
        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-muted">
              <tr>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                  {t("image", language)}
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase" aria-sort={getAriaSortValue('titulo_es')}>
                  <button 
                    className="flex items-center gap-1 hover:bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm px-1"
                    onClick={() => handleSort('titulo_es')}
                  >
                    {t("nameES", language)}
                    <SortIndicator field="titulo_es" currentField={sortField} direction={sortDirection} />
                  </button>
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase" aria-sort={getAriaSortValue('precio')}>
                  <button 
                    className="flex items-center gap-1 hover:bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm px-1"
                    onClick={() => handleSort('precio')}
                  >
                    {t("price", language)}
                    <SortIndicator field="precio" currentField={sortField} direction={sortDirection} />
                  </button>
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase" aria-sort={getAriaSortValue('categoria')}>
                  <button 
                    className="flex items-center gap-1 hover:bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm px-1"
                    onClick={() => handleSort('categoria')}
                  >
                    {t("category", language)}
                    <SortIndicator field="categoria" currentField={sortField} direction={sortDirection} />
                  </button>
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase" aria-sort={getAriaSortValue('activo')}>
                  <button 
                    className="flex items-center gap-1 hover:bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm px-1"
                    onClick={() => handleSort('activo')}
                  >
                    {t("status", language)}
                    <SortIndicator field="activo" currentField={sortField} direction={sortDirection} />
                  </button>
                </th>
                <th scope="col" aria-sort="none" className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">
                  {t("actions", language)}
                </th>
              </tr>
            </thead>
            <tbody className="bg-card divide-y divide-border">
              {filteredProductos.map((prod) => (
                <tr key={prod.id} className="hover:bg-muted/50">
                  <td className="px-4 py-3 whitespace-nowrap">
                    {prod.foto_url ? (
                      <Image 
                        src={prod.foto_url} 
                        alt={prod.titulo_es}
                        width={40}
                        height={40}
                        className="h-10 w-10 rounded-md object-cover"
                        loading="lazy"
                        unoptimized
                      />
                    ) : (
                      <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center">
                        <ImageIcon className="h-5 w-5 text-muted-foreground" />
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm font-medium text-foreground">
                      {prod.titulo_es}
                      {prod.es_especial && (
                        <span className="ml-2 px-2 py-0.5 text-xs bg-accent/10 text-accent rounded-full">
                          {t("especial", language)}
                        </span>
                      )}
                    </div>
                    {prod.descripcion_es && (
                      <div className="text-xs text-muted-foreground truncate max-w-xs">
                        {prod.descripcion_es}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-foreground">
                    {formatPrice(prod.precio)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-muted-foreground">
                    {getCategoriaNombre(prod.categoria_id)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <button
                      onClick={() => toggleActivo(prod)}
                      aria-label={`${prod.activo ? t("inactive", language) : t("active", language)} ${prod.titulo_es}`}
                      className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                        prod.activo
                          ? 'bg-primary/10 text-primary hover:bg-primary/20'
                          : 'bg-muted text-foreground hover:bg-muted/80'
                      }`}
                    >
                      {prod.activo ? t("active", language) : t("inactive", language)}
                    </button>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-right text-sm">
                    <button
                      onClick={() => openEditModal(prod)}
                      className="p-2 text-primary hover:text-primary/80 mr-1 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm min-h-[44px] min-w-[44px] inline-flex items-center justify-center"
                      aria-label={`Editar ${prod.titulo_es}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteProduct(prod.id)}
                      className="p-2 text-destructive hover:text-destructive/80 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm min-h-[44px] min-w-[44px] inline-flex items-center justify-center"
                      aria-label={`Eliminar ${prod.titulo_es}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {filteredProductos.length === 0 && (
                <tr>
                  <td colSpan={6} aria-live="polite" className="px-6 py-8 text-center text-muted-foreground">
                    {searchTerm ? t("noProductsFound", language) : t("noProductsYet", language)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="md:hidden divide-y divide-border">
          {filteredProductos.map((prod) => (
            <div key={prod.id} className="p-4 hover:bg-muted/50">
              <div className="flex gap-3">
                  <div className="flex-shrink-0">
                    {prod.foto_url ? (
                      <Image 
                        src={prod.foto_url} 
                        alt={prod.titulo_es}
                        width={64}
                        height={64}
                        className="h-16 w-16 rounded-md object-cover"
                        loading="lazy"
                        unoptimized
                      />
                    ) : (
                      <div className="h-16 w-16 rounded-md bg-muted flex items-center justify-center">
                        <ImageIcon className="h-8 w-8 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {prod.titulo_es}
                        {prod.es_especial && (
                          <span className="ml-2 px-2 py-0.5 text-xs bg-accent/10 text-accent rounded-full">
                            {t("especial", language)}
                          </span>
                        )}
                      </p>
                      <p className="text-sm text-muted-foreground">{getCategoriaNombre(prod.categoria_id)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openEditModal(prod)}
                        className="p-1.5 min-h-[44px] min-w-[44px] flex items-center justify-center text-primary hover:bg-primary/10 dark:hover:bg-primary/20 rounded outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        aria-label={`Editar ${prod.titulo_es}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteProduct(prod.id)}
                        className="p-1.5 min-h-[44px] min-w-[44px] flex items-center justify-center text-destructive hover:bg-destructive/10 rounded outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        aria-label={`Eliminar ${prod.titulo_es}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground">{prod.precio.toFixed(2)} €</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleActivo(prod); }}
                      className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                        prod.activo
                          ? 'bg-primary/10 text-primary hover:bg-primary/20'
                          : 'bg-muted text-foreground hover:bg-muted/80'
                      }`}
                    >
                      {prod.activo ? t("active", language) : t("inactive", language)}
                    </button>
                  </div>
                  {prod.descripcion_es && (
                    <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{prod.descripcion_es}</p>
                  )}
                </div>
              </div>
            </div>
          ))}
          {filteredProductos.length === 0 && (
            <div className="p-8 text-center text-muted-foreground">
              {searchTerm ? t("noProductsFound", language) : t("noProductsYet", language)}
            </div>
          )}
        </div>
      </div>

      <ProductFormDialog
        open={isModalOpen}
        onOpenChange={(open) => { if (!open) closeModal(); }}
        editingId={editingId}
        formData={formData}
        onFormChange={setFormData}
        categorias={categorias}
        showTranslations={showTranslations}
        onToggleTranslations={() => setShowTranslations(!showTranslations)}
        saving={saving}
        onSubmit={handleSubmit}
        empresaSlug={empresaSlug}
      />

      <DeleteConfirmDialog
        open={deleteConfirm.show}
        onOpenChange={(open) => { if (!open) setDeleteConfirm({ show: false, id: null, nombre: null }); }}
        productName={deleteConfirm.nombre}
        onConfirm={confirmDeleteProduct}
      />
    </div>
  );
}
