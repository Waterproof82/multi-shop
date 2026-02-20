'use client';

import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, X, Loader2, Image as ImageIcon, Search, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { ImageUploader } from '@/components/ui/image-uploader';
import { useAdmin } from '@/lib/admin-context';

interface Categoria {
  id: string;
  nombre_es: string;
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

  const handleSubmit = async (e: React.FormEvent) => {
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
        precio: parseFloat(formData.precio) || 0,
        categoria_id: formData.categoria_id || null,
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

  const handleDelete = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar este producto?')) return;

    try {
      const res = await fetch(`/api/admin/productos?id=${id}`, {
        method: 'DELETE',
      });

      if (!res.ok) throw new Error('Error al eliminar');
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
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

  const handleSort = (field: keyof Producto | 'categoria') => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const filteredProductos = productos
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
      let aVal: string | number = '';
      let bVal: string | number = '';

      if (sortField === 'categoria') {
        aVal = getCategoriaNombre(a.categoria_id);
        bVal = getCategoriaNombre(b.categoria_id);
      } else if (sortField === 'precio') {
        aVal = a.precio;
        bVal = b.precio;
      } else if (sortField === 'es_especial') {
        aVal = a.es_especial ? 1 : 0;
        bVal = b.es_especial ? 1 : 0;
      } else if (sortField === 'activo') {
        aVal = a.activo ? 1 : 0;
        bVal = b.activo ? 1 : 0;
      } else {
        aVal = (a[sortField as keyof Producto] as string) || '';
        bVal = (b[sortField as keyof Producto] as string) || '';
      }

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
      }

      const aStr = String(aVal).toLowerCase();
      const bStr = String(bVal).toLowerCase();
      return sortDirection === 'asc' 
        ? aStr.localeCompare(bStr) 
        : bStr.localeCompare(aStr);
    });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="pt-20 lg:pt-0 px-4 lg:px-0">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-serif font-bold text-gray-900">Productos</h1>
          <p className="text-gray-600">Gestiona los productos del menú</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar productos..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 border rounded-lg w-64 focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <button
            onClick={openCreateModal}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            Nuevo Producto
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-md">
          {error}
        </div>
      )}

      {categorias.length === 0 && (
        <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-md">
          No hay categorías creadas. Crea una primero en la sección de Categorías.
        </div>
      )}

      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Imagen
                </th>
                <th 
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('titulo_es')}
                >
                  <div className="flex items-center gap-1">
                    Nombre (ES)
                    {sortField === 'titulo_es' ? (
                      sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                    ) : <ArrowUpDown className="h-3 w-3 opacity-30" />}
                  </div>
                </th>
                <th 
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('precio')}
                >
                  <div className="flex items-center gap-1">
                    Precio
                    {sortField === 'precio' ? (
                      sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                    ) : <ArrowUpDown className="h-3 w-3 opacity-30" />}
                  </div>
                </th>
                <th 
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('categoria')}
                >
                  <div className="flex items-center gap-1">
                    Categoría
                    {sortField === 'categoria' ? (
                      sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                    ) : <ArrowUpDown className="h-3 w-3 opacity-30" />}
                  </div>
                </th>
                <th 
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('activo')}
                >
                  <div className="flex items-center gap-1">
                    Estado
                    {sortField === 'activo' ? (
                      sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                    ) : <ArrowUpDown className="h-3 w-3 opacity-30" />}
                  </div>
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredProductos.map((prod) => (
                <tr key={prod.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 whitespace-nowrap">
                    {prod.foto_url ? (
                      <img 
                        src={prod.foto_url} 
                        alt={prod.titulo_es}
                        className="h-10 w-10 rounded-md object-cover"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded-md bg-gray-100 flex items-center justify-center">
                        <ImageIcon className="h-5 w-5 text-gray-400" />
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm font-medium text-gray-900">
                      {prod.titulo_es}
                      {prod.es_especial && (
                        <span className="ml-2 px-2 py-0.5 text-xs bg-accent/10 text-accent rounded-full">
                          Especial
                        </span>
                      )}
                    </div>
                    {prod.descripcion_es && (
                      <div className="text-xs text-gray-500 truncate max-w-xs">
                        {prod.descripcion_es}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                    {prod.precio.toFixed(2)} €
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                    {getCategoriaNombre(prod.categoria_id)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      prod.activo 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-gray-100 text-gray-800'
                    }`}>
                      {prod.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-right text-sm">
                    <button
                      onClick={() => openEditModal(prod)}
                      className="text-primary hover:text-primary/80 mr-3"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(prod.id)}
                      className="text-red-600 hover:text-red-80"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {filteredProductos.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                    {searchTerm ? 'No se encontraron productos con ese criterio.' : 'No hay productos. Crea el primero.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="md:hidden divide-y divide-gray-200">
          {filteredProductos.map((prod) => (
            <div key={prod.id} className="p-4 hover:bg-gray-50">
              <div className="flex gap-3">
                <div className="flex-shrink-0">
                  {prod.foto_url ? (
                    <img 
                      src={prod.foto_url} 
                      alt={prod.titulo_es}
                      className="h-16 w-16 rounded-md object-cover"
                    />
                  ) : (
                    <div className="h-16 w-16 rounded-md bg-gray-100 flex items-center justify-center">
                      <ImageIcon className="h-8 w-8 text-gray-400" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {prod.titulo_es}
                        {prod.es_especial && (
                          <span className="ml-2 px-2 py-0.5 text-xs bg-accent/10 text-accent rounded-full">
                            Especial
                          </span>
                        )}
                      </p>
                      <p className="text-sm text-gray-500">{getCategoriaNombre(prod.categoria_id)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openEditModal(prod)}
                        className="p-1.5 text-primary hover:bg-primary/10 rounded"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(prod.id)}
                        className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-900">{prod.precio.toFixed(2)} €</span>
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      prod.activo 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-gray-100 text-gray-800'
                    }`}>
                      {prod.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </div>
                  {prod.descripcion_es && (
                    <p className="mt-1 text-xs text-gray-500 line-clamp-2">{prod.descripcion_es}</p>
                  )}
                </div>
              </div>
            </div>
          ))}
          {filteredProductos.length === 0 && (
            <div className="p-8 text-center text-gray-500">
              {searchTerm ? 'No se encontraron productos con ese criterio.' : 'No hay productos. Crea el primero.'}
            </div>
          )}
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-6 border-b">
              <h2 className="text-xl font-semibold">
                {editingId ? 'Editar Producto' : 'Nuevo Producto'}
              </h2>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nombre (Español) *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.titulo_es}
                    onChange={(e) => setFormData({ ...formData, titulo_es: e.target.value })}
                    className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Descripción (Español)
                  </label>
                  <textarea
                    value={formData.descripcion_es}
                    onChange={(e) => setFormData({ ...formData, descripcion_es: e.target.value })}
                    rows={2}
                    className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Precio (€) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={formData.precio}
                    onChange={(e) => setFormData({ ...formData, precio: e.target.value })}
                    className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Categoría
                  </label>
                  <select
                    value={formData.categoria_id}
                    onChange={(e) => setFormData({ ...formData, categoria_id: e.target.value })}
                    className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="">Sin categoría</option>
                    {categorias.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.nombre_es}
                      </option>
                    ))}
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
                  <h3 className="text-sm font-medium text-gray-700 mt-4 mb-2">Traducciones</h3>
                </div>

                <div>
                  <label className="block text-sm text-gray-600 mb-1">Nombre (EN)</label>
                  <input
                    type="text"
                    value={formData.titulo_en}
                    onChange={(e) => setFormData({ ...formData, titulo_en: e.target.value })}
                    className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Nombre (FR)</label>
                  <input
                    type="text"
                    value={formData.titulo_fr}
                    onChange={(e) => setFormData({ ...formData, titulo_fr: e.target.value })}
                    className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Nombre (IT)</label>
                  <input
                    type="text"
                    value={formData.titulo_it}
                    onChange={(e) => setFormData({ ...formData, titulo_it: e.target.value })}
                    className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Nombre (DE)</label>
                  <input
                    type="text"
                    value={formData.titulo_de}
                    onChange={(e) => setFormData({ ...formData, titulo_de: e.target.value })}
                    className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-sm text-gray-600 mb-1">Descripción (EN)</label>
                  <input
                    type="text"
                    value={formData.descripcion_en}
                    onChange={(e) => setFormData({ ...formData, descripcion_en: e.target.value })}
                    className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                <div className="col-span-2 flex gap-6 mt-4">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formData.es_especial}
                      onChange={(e) => setFormData({ ...formData, es_especial: e.target.checked })}
                      className="rounded border-gray-300"
                    />
                    <span className="text-sm text-gray-700">Producto especial</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formData.activo}
                      onChange={(e) => setFormData({ ...formData, activo: e.target.checked })}
                      className="rounded border-gray-300"
                    />
                    <span className="text-sm text-gray-700">Activo</span>
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 border rounded-md hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90 disabled:opacity-50"
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
          </div>
        </div>
      )}
    </div>
  );
}
