'use client';

import { useState, useEffect, useMemo } from 'react';
import Image from 'next/image';
import { Plus, Pencil, Trash2, Loader2, Image as ImageIcon, Search, ArrowUpDown, ArrowUp, ArrowDown, Languages, ChevronDown, ChevronRight } from 'lucide-react';
import { ImageUploader } from '@/components/ui/image-uploader';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useAdmin } from '@/lib/admin-context';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

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

interface ProductoFormData {
  titulo_es: string;
  titulo_en: string;
  titulo_fr: string;
  titulo_it: string;
  titulo_de: string;
  descripcion_es: string;
  descripcion_en: string;
  descripcion_fr: string;
  descripcion_it: string;
  descripcion_de: string;
  precio: string;
  foto_url: string;
  categoria_id: string;
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

const LANGUAGES = ['en', 'fr', 'it', 'de'] as const;

const SortIndicator = ({ field, currentField, direction }: { field: keyof Producto | 'categoria'; currentField: keyof Producto | 'categoria'; direction: 'asc' | 'desc' }) => {
  if (field !== currentField) {
    return <ArrowUpDown className="h-3 w-3 opacity-30" />;
  }
  return direction === 'asc' 
    ? <ArrowUp className="h-3 w-3" /> 
    : <ArrowDown className="h-3 w-3" />;
};

const TranslationFields = ({ formData, onChange, show }: { 
  formData: ProductoFormData; 
  onChange: (data: ProductoFormData) => void;
  show: boolean;
}) => {
  if (!show) return null;
  
  return (
    <>
      {LANGUAGES.map(lang => (
        <div key={lang} className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor={`titulo_${lang}`} className="block text-sm text-muted-foreground mb-1">Nombre ({lang.toUpperCase()})</label>
            <Input
              id={`titulo_${lang}`}
              type="text"
              value={formData[`titulo_${lang}` as keyof ProductoFormData] as string}
              onChange={(e) => onChange({ ...formData, [`titulo_${lang}`]: e.target.value })}
            />
          </div>
          <div className="col-span-2">
            <label htmlFor={`descripcion_${lang}`} className="block text-sm text-muted-foreground mb-1">Descripción ({lang.toUpperCase()})</label>
            <Textarea
              id={`descripcion_${lang}`}
              value={formData[`descripcion_${lang}` as keyof ProductoFormData] as string}
              onChange={(e) => onChange({ ...formData, [`descripcion_${lang}`]: e.target.value })}
              rows={2}
            />
          </div>
        </div>
      ))}
    </>
  );
};

export default function ProductosPage() {
  const { empresaSlug } = useAdmin();
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
      setError(err instanceof Error ? err.message : 'Error desconocido');
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

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Error al guardar');
      }

      await fetchData();
      closeModal();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
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
      const res = await fetch(`/api/admin/productos?id=${deleteConfirm.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Error al eliminar');
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
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

  return (
    <div className="pt-20 lg:pt-0 px-6 lg:px-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Productos</h1>
          <p className="text-muted-foreground">Gestiona los productos del menú</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Buscar productos..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              aria-label="Buscar productos"
              className="pl-10 w-full sm:w-64"
            />
          </div>
          <button
            onClick={openCreateModal}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            Nuevo Producto
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-md">
          {error}
        </div>
      )}

      {categorias.length === 0 && (
        <div className="mb-4 p-4 bg-secondary border border-border text-secondary-foreground rounded-md">
          No hay categorías creadas. Crea una primero en la sección de Categorías.
        </div>
      )}

      <div className="bg-card rounded-lg shadow-elegant border border-border overflow-hidden">
        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-muted">
              <tr>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                  Imagen
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase" aria-sort={getAriaSortValue('titulo_es')}>
                  <button 
                    className="flex items-center gap-1 hover:bg-muted"
                    onClick={() => handleSort('titulo_es')}
                  >
                    Nombre (ES)
                    <SortIndicator field="titulo_es" currentField={sortField} direction={sortDirection} />
                  </button>
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase" aria-sort={getAriaSortValue('precio')}>
                  <button 
                    className="flex items-center gap-1 hover:bg-muted"
                    onClick={() => handleSort('precio')}
                  >
                    Precio
                    <SortIndicator field="precio" currentField={sortField} direction={sortDirection} />
                  </button>
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase" aria-sort={getAriaSortValue('categoria')}>
                  <button 
                    className="flex items-center gap-1 hover:bg-muted"
                    onClick={() => handleSort('categoria')}
                  >
                    Categoría
                    <SortIndicator field="categoria" currentField={sortField} direction={sortDirection} />
                  </button>
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase" aria-sort={getAriaSortValue('activo')}>
                  <button 
                    className="flex items-center gap-1 hover:bg-muted"
                    onClick={() => handleSort('activo')}
                  >
                    Estado
                    <SortIndicator field="activo" currentField={sortField} direction={sortDirection} />
                  </button>
                </th>
                <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">
                  Acciones
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
                          Especial
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
                    {prod.precio.toFixed(2)} €
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-muted-foreground">
                    {getCategoriaNombre(prod.categoria_id)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      prod.activo 
                        ? 'bg-primary/10 text-primary' 
                        : 'bg-muted text-foreground'
                    }`}>
                      {prod.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-right text-sm">
                    <button
                      onClick={() => openEditModal(prod)}
                      className="text-primary hover:text-primary/80 mr-3"
                      aria-label={`Editar ${prod.titulo_es}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteProduct(prod.id)}
                      className="text-destructive hover:text-destructive/80"
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
                    {searchTerm ? 'No se encontraron productos con ese criterio.' : 'No hay productos. Crea el primero.'}
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
                            Especial
                          </span>
                        )}
                      </p>
                      <p className="text-sm text-muted-foreground">{getCategoriaNombre(prod.categoria_id)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openEditModal(prod)}
                        className="p-1.5 text-primary hover:bg-primary/10 dark:hover:bg-primary/20 rounded"
                        aria-label={`Editar ${prod.titulo_es}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteProduct(prod.id)}
                        className="p-1.5 text-destructive hover:bg-destructive/10 rounded"
                        aria-label={`Eliminar ${prod.titulo_es}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground">{prod.precio.toFixed(2)} €</span>
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      prod.activo 
                        ? 'bg-primary/10 text-primary' 
                        : 'bg-muted text-foreground'
                    }`}>
                      {prod.activo ? 'Activo' : 'Inactivo'}
                    </span>
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
              {searchTerm ? 'No se encontraron productos con ese criterio.' : 'No hay productos. Crea el primero.'}
            </div>
          )}
        </div>
      </div>

      <Dialog open={isModalOpen} onOpenChange={(open) => { if (!open) closeModal(); }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar Producto' : 'Nuevo Producto'}</DialogTitle>
            <DialogDescription>
              {editingId ? 'Modifica los datos del producto.' : 'Rellena los datos para crear un producto.'}
            </DialogDescription>
          </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label htmlFor="titulo_es" className="block text-sm font-medium text-foreground mb-1">
                    Nombre (Español) *
                  </label>
                  <Input
                    id="titulo_es"
                    type="text"
                    required
                    aria-required="true"
                    value={formData.titulo_es}
                    onChange={(e) => setFormData({ ...formData, titulo_es: e.target.value })}
                  />
                </div>

                <div className="col-span-2">
                  <label htmlFor="descripcion_es" className="block text-sm font-medium text-foreground mb-1">
                    Descripción (Español)
                  </label>
                  <Textarea
                    id="descripcion_es"
                    value={formData.descripcion_es}
                    onChange={(e) => setFormData({ ...formData, descripcion_es: e.target.value })}
                    rows={2}
                  />
                </div>

                <div>
                  <label htmlFor="precio" className="block text-sm font-medium text-foreground mb-1">
                    Precio (€) *
                  </label>
                  <Input
                    id="precio"
                    type="number"
                    step="0.01"
                    required
                    aria-required="true"
                    value={formData.precio}
                    onChange={(e) => setFormData({ ...formData, precio: e.target.value })}
                  />
                </div>

                <div>
                  <label htmlFor="categoria_id" className="block text-sm font-medium text-foreground mb-1">
                    Categoría
                  </label>
                  <select
                    id="categoria_id"
                    value={formData.categoria_id}
                    onChange={(e) => setFormData({ ...formData, categoria_id: e.target.value })}
                    className="w-full px-3 py-2 rounded-md border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background transition-colors cursor-pointer"
                    aria-label="Categoría del producto"
                  >
                    <option value="">Sin categoría</option>
                    {(() => {
                      const parents = categorias.filter(c => !c.categoria_padre_id);
                      const children = categorias.filter(c => c.categoria_padre_id);

                      return parents.map(parent => {
                        const childCats = children.filter(c => c.categoria_padre_id === parent.id);
                        if (childCats.length > 0) {
                          return (
                            <optgroup key={parent.id} label={parent.nombre_es}>
                              <option key={`${parent.id}-self`} value={parent.id}>
                                {parent.nombre_es} (principal)
                              </option>
                              {childCats.map(sub => (
                                <option key={sub.id} value={sub.id}>
                                  └─ {sub.nombre_es}
                                </option>
                              ))}
                            </optgroup>
                          );
                        }
                        return (
                          <option key={parent.id} value={parent.id}>
                            {parent.nombre_es}
                          </option>
                        );
                      });
                    })()}
                  </select>
                </div>

                <div className="col-span-2">
                  <ImageUploader
                    value={formData.foto_url}
                    onChange={(url) => setFormData({ ...formData, foto_url: url })}
                    label="Imagen del producto"
                    empresaSlug={empresaSlug}
                  />
                </div>

                <div className="col-span-2">
                  <button
                    type="button"
                    onClick={() => setShowTranslations(!showTranslations)}
                    className="flex items-center gap-2 text-sm font-medium text-foreground mt-4 hover:text-primary dark:hover:text-primary"
                  >
                    {showTranslations ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    <Languages className="h-4 w-4" />
                    Traducciones ({showTranslations ? 'ocultar' : 'mostrar'})
                  </button>
                </div>

                {showTranslations && (
                  <TranslationFields
                    formData={formData}
                    onChange={setFormData}
                    show={showTranslations}
                  />
                )}

                <div className="col-span-2 flex gap-6 mt-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.es_especial}
                      onChange={(e) => setFormData({ ...formData, es_especial: e.target.checked })}
                      className="w-4 h-4 rounded border-border text-primary focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background cursor-pointer accent-primary"
                    />
                    <span className="text-sm text-foreground">Producto especial</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.activo}
                      onChange={(e) => setFormData({ ...formData, activo: e.target.checked })}
                      className="w-4 h-4 rounded border-border text-primary focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background cursor-pointer accent-primary"
                    />
                    <span className="text-sm text-foreground">Activo</span>
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 border rounded-md hover:bg-muted/50 border-border text-foreground"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
                >
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                      Guardando...
                    </>
                  ) : (
                    'Guardar'
                  )}
                </button>
              </div>
            </form>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteConfirm.show} onOpenChange={(open) => { if (!open) setDeleteConfirm({ show: false, id: null, nombre: null }); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className="p-2 bg-destructive/10 rounded-full">
                <Trash2 className="w-5 h-5 text-destructive" />
              </div>
              Eliminar producto
            </DialogTitle>
            <DialogDescription>
              ¿Estás seguro de que quieres eliminar <strong>{deleteConfirm.nombre}</strong>? Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 justify-end">
            <button
              onClick={() => setDeleteConfirm({ show: false, id: null, nombre: null })}
              className="px-4 py-2 text-muted-foreground hover:bg-muted rounded-lg"
            >
              Cancelar
            </button>
            <button
              onClick={confirmDeleteProduct}
              className="px-4 py-2 bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-lg"
            >
              Eliminar
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
