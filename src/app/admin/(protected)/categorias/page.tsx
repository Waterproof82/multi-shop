'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2, X, Loader2, Search, ArrowUpDown, ArrowUp, ArrowDown, Languages, ChevronDown, ChevronRight } from 'lucide-react';

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
  const router = useRouter();
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
      if (!res.ok) throw new Error('Error al cargar categorías');
      const data = await res.json();
      setCategorias(data);
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
        ? `/api/admin/categorias?id=${editingId}` 
        : '/api/admin/categorias';
      
      const method = editingId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Error al guardar');
      }

      await fetchCategorias();
      closeModal();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar esta categoría?')) return;

    try {
      const res = await fetch(`/api/admin/categorias?id=${id}`, {
        method: 'DELETE',
      });

      if (!res.ok) throw new Error('Error al eliminar');
      await fetchCategorias();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
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
      const aVal = (a[sortField as keyof Category] || '').toLowerCase();
      const bVal = (b[sortField as keyof Category] || '').toLowerCase();
      return sortDirection === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    });

  const getTraducciones = (cat: Category) => {
    return [cat.nombre_en && 'EN', cat.nombre_fr && 'FR', cat.nombre_it && 'IT', cat.nombre_de && 'DE']
      .filter(Boolean)
      .join(', ') || '—';
  };

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
          <h1 className="text-2xl font-serif font-bold text-gray-900 dark:text-white">Categorías</h1>
          <p className="text-gray-600 dark:text-gray-400">Gestiona las categorías del menú</p>
        </div>
        <div className="flex items-center gap-4 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-initial">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 border rounded-lg w-full sm:w-48 focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-800 dark:border-gray-600 dark:text-white"
            />
          </div>
          <button
            onClick={openCreateModal}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            <span className="sm:hidden">Nueva</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 rounded-md">
          {error}
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border dark:border-gray-700 overflow-hidden">
        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th 
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                  onClick={() => handleSort('orden')}
                >
                  <div className="flex items-center gap-1">
                    Orden
                    {sortField === 'orden' ? (
                      sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                    ) : <ArrowUpDown className="h-3 w-3 opacity-30" />}
                  </div>
                </th>
                <th 
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                  onClick={() => handleSort('nombre_es')}
                >
                  <div className="flex items-center gap-1">
                    Nombre (ES)
                    {sortField === 'nombre_es' ? (
                      sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                    ) : <ArrowUpDown className="h-3 w-3 opacity-30" />}
                  </div>
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                  Traducciones
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                  Tipo
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                  Subcategorías
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                  Complemento de
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {filteredCategorias.map((cat) => (
                <tr key={cat.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                    {cat.orden}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">
                    {cat.nombre_es}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {getTraducciones(cat)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm">
                    {cat.categoria_padre_id ? (
                      <div className="flex flex-col gap-1">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-xs font-medium">
                          Subcategoría
                        </span>
                        {cat.parentName && (
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            → {cat.parentName}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 text-xs font-medium">
                        Principal
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
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {cat.categoria_complemento_de 
                      ? categorias.find(c => c.id === cat.categoria_complemento_de)?.nombre_es || '—'
                      : '—'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-right text-sm">
                    <button
                      onClick={() => openEditModal(cat)}
                      className="text-primary hover:text-primary/80 mr-3"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(cat.id)}
                      className="text-red-600 hover:text-red-80"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {filteredCategorias.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
                    {searchTerm ? 'No se encontraron categorías.' : 'No hay categorías. Crea la primera.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="md:hidden divide-y divide-gray-200 dark:divide-gray-700">
          {filteredCategorias.map((cat) => (
            <div key={cat.id} className="p-4 hover:bg-gray-50 dark:hover:bg-gray-700">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 dark:text-gray-500">#{cat.orden}</span>
                    <p className="font-medium text-gray-900 dark:text-gray-100">{cat.nombre_es}</p>
                    {cat.categoria_padre_id ? (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-[10px] font-medium">
                        Sub
                      </span>
                    ) : cat.hasSubcategories ? (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-medium">
                        Principal
                      </span>
                    ) : null}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {cat.categoria_padre_id && cat.parentName ? `Subcategoría de ${cat.parentName}` : getTraducciones(cat)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openEditModal(cat)}
                    className="p-1.5 text-primary hover:bg-primary/10 dark:hover:bg-primary/20 rounded"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(cat.id)}
                    className="p-1.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
          {filteredCategorias.length === 0 && (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">
              {searchTerm ? 'No se encontraron categorías.' : 'No hay categorías. Crea la primera.'}
            </div>
          )}
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-6 border-b dark:border-gray-700">
              <h2 className="text-xl font-semibold dark:text-white">
                {editingId ? 'Editar Categoría' : 'Nueva Categoría'}
              </h2>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                  Nombre (Español) *
                </label>
                <input
                  type="text"
                  required
                  value={formData.nombre_es}
                  onChange={(e) => setFormData({ ...formData, nombre_es: e.target.value })}
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                />
              </div>

              {showTranslations && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                      Nombre (Inglés)
                    </label>
                    <input
                      type="text"
                      value={formData.nombre_en}
                      onChange={(e) => setFormData({ ...formData, nombre_en: e.target.value })}
                      className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    />
                  </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                    Nombre (Francés)
                  </label>
                  <input
                    type="text"
                    value={formData.nombre_fr}
                    onChange={(e) => setFormData({ ...formData, nombre_fr: e.target.value })}
                    className="w-full px-3 py-2 border rounded-ui focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                    Nombre (Italiano)
                  </label>
                  <input
                    type="text"
                    value={formData.nombre_it}
                    onChange={(e) => setFormData({ ...formData, nombre_it: e.target.value })}
                    className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                    Nombre (Alemán)
                  </label>
                  <input
                    type="text"
                    value={formData.nombre_de}
                    onChange={(e) => setFormData({ ...formData, nombre_de: e.target.value })}
                    className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  />
                </div>
              </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                  Descripción (Español)
                </label>
                <textarea
                  value={formData.descripcion_es}
                  onChange={(e) => setFormData({ ...formData, descripcion_es: e.target.value })}
                  rows={2}
                  placeholder="Texto que se mostrará encima de los productos..."
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                />
              </div>

              {showTranslations && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                      Descripción (Inglés)
                    </label>
                  <textarea
                    value={formData.descripcion_en}
                    onChange={(e) => setFormData({ ...formData, descripcion_en: e.target.value })}
                    rows={2}
                    className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                    Descripción (Francés)
                  </label>
                  <textarea
                    value={formData.descripcion_fr}
                    onChange={(e) => setFormData({ ...formData, descripcion_fr: e.target.value })}
                    rows={2}
                    className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                    Descripción (Italiano)
                  </label>
                  <textarea
                    value={formData.descripcion_it}
                    onChange={(e) => setFormData({ ...formData, descripcion_it: e.target.value })}
                    rows={2}
                    className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                    Descripción (Alemán)
                  </label>
                  <textarea
                    value={formData.descripcion_de}
                    onChange={(e) => setFormData({ ...formData, descripcion_de: e.target.value })}
                    rows={2}
                    className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  />
                </div>
              </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                  Orden
                </label>
                <input
                  type="number"
                  value={formData.orden}
                  onChange={(e) => setFormData({ ...formData, orden: parseInt(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                  Categoría Padre (para subcategorías)
                </label>
                <select
                  value={formData.categoria_padre_id || ''}
                  onChange={(e) => setFormData({ ...formData, categoria_padre_id: e.target.value || null })}
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                >
                  <option value="">Ninguna (categoría principal)</option>
                  {categorias
                    .filter((c) => !c.categoria_padre_id && c.id !== editingId)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre_es}
                      </option>
                    ))}
                </select>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Selecciona una categoría padre para crear una subcategoría.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                  Complemento de categoría
                </label>
                <select
                  value={formData.categoria_complemento_de || ''}
                  onChange={(e) => setFormData({ ...formData, categoria_complemento_de: e.target.value || null })}
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                >
                  <option value="">Ninguna (categoría principal)</option>
                  {categorias
                    .filter((c) => c.id !== editingId)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre_es}
                      </option>
                    ))}
                </select>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Los productos de esta categoría aparecerán como complemento al añadir productos de la categoría seleccionada.
                </p>
              </div>

              {formData.categoria_complemento_de && (
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="complemento_obligatorio"
                    checked={formData.complemento_obligatorio}
                    onChange={(e) => setFormData({ ...formData, complemento_obligatorio: e.target.checked })}
                    className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <label htmlFor="complemento_obligatorio" className="text-sm text-gray-700 dark:text-gray-200">
                    Seleccionar complemento obligatorio
                  </label>
                </div>
              )}

              <div className="col-span-2">
                <button
                  type="button"
                  onClick={() => setShowTranslations(!showTranslations)}
                  className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:text-primary dark:hover:text-primary"
                >
                  {showTranslations ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  <Languages className="h-4 w-4" />
                  Traducciones ({showTranslations ? 'ocultar' : 'mostrar'})
                </button>
              </div>

              <div className="flex justify-end gap-3 pt-4 col-span-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 border rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 dark:border-gray-600 dark:text-gray-200"
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
