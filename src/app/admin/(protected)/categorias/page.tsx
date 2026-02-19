'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2, X, Loader2, Search, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';

interface Category {
  id: string;
  nombre_es: string;
  nombre_en: string;
  nombre_fr: string;
  nombre_it: string;
  nombre_de: string;
  orden: number;
}

interface CategoryFormData {
  nombre_es: string;
  nombre_en: string;
  nombre_fr: string;
  nombre_it: string;
  nombre_de: string;
  orden: number;
}

const emptyForm: CategoryFormData = {
  nombre_es: '',
  nombre_en: '',
  nombre_fr: '',
  nombre_it: '',
  nombre_de: '',
  orden: 0,
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
      orden: categoria.orden,
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
    .sort((a, b) => {
      if (sortField === 'orden') {
        return sortDirection === 'asc' ? a.orden - b.orden : b.orden - a.orden;
      }
      const aVal = (a[sortField] || '').toLowerCase();
      const bVal = (b[sortField] || '').toLowerCase();
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
    <div className="pt-20 lg:pt-0 px-4 lg:px-0">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-serif font-bold text-gray-900">Categorías</h1>
          <p className="text-gray-600">Gestiona las categorías del menú</p>
        </div>
        <div className="flex items-center gap-4 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-initial">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 border rounded-lg w-full sm:w-48 focus:outline-none focus:ring-2 focus:ring-primary"
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
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-md">
          {error}
        </div>
      )}

      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th 
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100"
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
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('nombre_es')}
                >
                  <div className="flex items-center gap-1">
                    Nombre (ES)
                    {sortField === 'nombre_es' ? (
                      sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                    ) : <ArrowUpDown className="h-3 w-3 opacity-30" />}
                  </div>
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Traducciones
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredCategorias.map((cat) => (
                <tr key={cat.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                    {cat.orden}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                    {cat.nombre_es}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                    {getTraducciones(cat)}
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
                  <td colSpan={4} className="px-6 py-8 text-center text-gray-500">
                    {searchTerm ? 'No se encontraron categorías.' : 'No hay categorías. Crea la primera.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="md:hidden divide-y divide-gray-200">
          {filteredCategorias.map((cat) => (
            <div key={cat.id} className="p-4 hover:bg-gray-50">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">#{cat.orden}</span>
                    <p className="font-medium text-gray-900">{cat.nombre_es}</p>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">{getTraducciones(cat)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openEditModal(cat)}
                    className="p-1.5 text-primary hover:bg-primary/10 rounded"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(cat.id)}
                    className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
          {filteredCategorias.length === 0 && (
            <div className="p-8 text-center text-gray-500">
              {searchTerm ? 'No se encontraron categorías.' : 'No hay categorías. Crea la primera.'}
            </div>
          )}
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-6 border-b">
              <h2 className="text-xl font-semibold">
                {editingId ? 'Editar Categoría' : 'Nueva Categoría'}
              </h2>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nombre (Español) *
                </label>
                <input
                  type="text"
                  required
                  value={formData.nombre_es}
                  onChange={(e) => setFormData({ ...formData, nombre_es: e.target.value })}
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nombre (Inglés)
                  </label>
                  <input
                    type="text"
                    value={formData.nombre_en}
                    onChange={(e) => setFormData({ ...formData, nombre_en: e.target.value })}
                    className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nombre (Francés)
                  </label>
                  <input
                    type="text"
                    value={formData.nombre_fr}
                    onChange={(e) => setFormData({ ...formData, nombre_fr: e.target.value })}
                    className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nombre (Italiano)
                  </label>
                  <input
                    type="text"
                    value={formData.nombre_it}
                    onChange={(e) => setFormData({ ...formData, nombre_it: e.target.value })}
                    className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nombre (Alemán)
                  </label>
                  <input
                    type="text"
                    value={formData.nombre_de}
                    onChange={(e) => setFormData({ ...formData, nombre_de: e.target.value })}
                    className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Orden
                </label>
                <input
                  type="number"
                  value={formData.orden}
                  onChange={(e) => setFormData({ ...formData, orden: parseInt(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                />
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
