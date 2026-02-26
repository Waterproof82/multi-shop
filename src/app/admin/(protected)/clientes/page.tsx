'use client';

import { useState, useEffect } from 'react';
import { Search, Mail, Phone, User, Users, Pencil, X, Plus, MapPin, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Cliente {
  id: string;
  nombre: string | null;
  email: string | null;
  telefono: string | null;
  direccion: string | null;
  aceptar_promociones: boolean | null;
  created_at: string;
}

export default function ClientesPage() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingCliente, setEditingCliente] = useState<Cliente | null>(null);
  const [creatingCliente, setCreatingCliente] = useState(false);
  const [editForm, setEditForm] = useState({ nombre: '', email: '', telefono: '', direccion: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function fetchClientes() {
      try {
        const res = await fetch('/api/admin/clientes');
        if (res.ok) {
          const data = await res.json();
          setClientes(data.clientes || []);
        }
      } catch (error) {
        console.error('Error fetching clientes:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchClientes();
  }, []);

  const filteredClientes = clientes.filter(c =>
    c.nombre?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.telefono?.includes(searchTerm)
  );

  const handleTogglePromociones = async (cliente: Cliente) => {
    const newValue = !cliente.aceptar_promociones;
    
    try {
      const res = await fetch('/api/admin/clientes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: cliente.id,
          aceptar_promociones: newValue,
        }),
      });
      
      if (res.ok) {
        setClientes(prev => prev.map(c => 
          c.id === cliente.id ? { ...c, aceptar_promociones: newValue } : c
        ));
      }
    } catch (error) {
      console.error('Error updating cliente:', error);
    }
  };

  const openEditModal = (cliente: Cliente) => {
    setEditingCliente(cliente);
    setEditForm({
      nombre: cliente.nombre || '',
      email: cliente.email || '',
      telefono: cliente.telefono || '',
      direccion: cliente.direccion || '',
    });
  };

  const closeEditModal = () => {
    setEditingCliente(null);
    setEditForm({ nombre: '', email: '', telefono: '', direccion: '' });
  };

  const openCreateModal = () => {
    setCreatingCliente(true);
    setEditForm({ nombre: '', email: '', telefono: '', direccion: '' });
  };

  const closeCreateModal = () => {
    setCreatingCliente(false);
    setEditForm({ nombre: '', email: '', telefono: '', direccion: '' });
  };

  const handleSaveEdit = async () => {
    if (!editingCliente) return;
    
    setSaving(true);
    try {
      const res = await fetch('/api/admin/clientes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingCliente.id,
          nombre: editForm.nombre || null,
          email: editForm.email || null,
          telefono: editForm.telefono || null,
          direccion: editForm.direccion || null,
        }),
      });
      
      if (res.ok) {
        setClientes(prev => prev.map(c => 
          c.id === editingCliente.id ? { 
            ...c, 
            nombre: editForm.nombre || null,
            email: editForm.email || null,
            telefono: editForm.telefono || null,
            direccion: editForm.direccion || null,
          } : c
        ));
        closeEditModal();
      }
    } catch (error) {
      console.error('Error saving cliente:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleCreateCliente = async () => {
    if (!editForm.nombre && !editForm.email && !editForm.telefono) return;
    
    setSaving(true);
    try {
      const res = await fetch('/api/admin/clientes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: editForm.nombre || null,
          email: editForm.email || null,
          telefono: editForm.telefono || null,
          direccion: editForm.direccion || null,
        }),
      });
      
      if (res.ok) {
        const data = await res.json();
        setClientes(prev => [data.cliente, ...prev]);
        closeCreateModal();
      }
    } catch (error) {
      console.error('Error creating cliente:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCliente = async (id: string) => {
    if (!confirm('¿Estás seguro de que quieres eliminar este cliente?')) return;
    
    setSaving(true);
    try {
      const res = await fetch('/api/admin/clientes', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      
      if (res.ok) {
        setClientes(prev => prev.filter(c => c.id !== id));
      }
    } catch (error) {
      console.error('Error deleting cliente:', error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header con contador */}
      <div className="bg-gradient-to-r from-primary to-primary/80 rounded-xl p-6 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-2xl font-bold text-white">Clientes</h1>
              <p className="text-white/80 text-sm mt-1">Gestiona tus clientes</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Button 
              onClick={openCreateModal}
              className="bg-white text-primary hover:bg-white/90 font-semibold"
            >
              <Plus className="w-4 h-4 mr-2" />
              Nuevo Cliente
            </Button>
            <div className="bg-white/20 rounded-lg px-6 py-4 text-center">
              <Users className="w-8 h-8 text-white mx-auto mb-1" />
              <span className="text-3xl font-bold text-white">{clientes.length}</span>
              <p className="text-white/80 text-xs">Total clientes</p>
            </div>
          </div>
        </div>
      </div>

      {/* Buscador */}
      <div className="mb-4">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar clientes..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          />
        </div>
      </div>

      {/* Tabla clientes */}
      {loading ? (
        <div className="text-center py-8 text-muted-foreground">Cargando...</div>
      ) : filteredClientes.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          {searchTerm ? 'No se encontraron clientes' : 'No hay clientes registrados'}
        </div>
      ) : (
        <div className="bg-card rounded-lg border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Nombre</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Email</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Teléfono</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Dirección</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Fecha</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground uppercase">Promociones</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredClientes.map((cliente) => (
                  <tr key={cliente.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <User className="size-4 text-muted-foreground" />
                        <span className="font-medium text-foreground">
                          {cliente.nombre || '-'}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Mail className="size-4 text-muted-foreground" />
                        <span className="text-foreground">
                          {cliente.email || '-'}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Phone className="size-4 text-muted-foreground" />
                        <span className="text-foreground">
                          {cliente.telefono || '-'}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <MapPin className="size-4 text-muted-foreground" />
                        <span className="text-foreground">
                          {cliente.direccion || '-'}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-sm">
                      {cliente.created_at ? new Date(cliente.created_at).toLocaleDateString('es-ES') : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-center">
                        <button
                          onClick={() => handleTogglePromociones(cliente)}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                            cliente.aceptar_promociones ? 'bg-green-600' : 'bg-gray-300 dark:bg-gray-600'
                          }`}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                              cliente.aceptar_promociones ? 'translate-x-6' : 'translate-x-1'
                            }`}
                          />
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => openEditModal(cliente)}
                        className="p-2 hover:bg-muted rounded-lg transition-colors"
                        title="Editar"
                      >
                        <Pencil className="size-4 text-muted-foreground" />
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleDeleteCliente(cliente.id)}
                        className="p-2 hover:bg-muted rounded-lg transition-colors text-red-500 hover:text-red-600"
                        title="Eliminar"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal de edición */}
      {editingCliente && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-background rounded-xl border shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold">Editar Cliente</h2>
              <button
                onClick={closeEditModal}
                className="p-1 hover:bg-muted rounded"
              >
                <X className="size-5" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                  Nombre
                </label>
                <input
                  type="text"
                  value={editForm.nombre}
                  onChange={(e) => setEditForm(prev => ({ ...prev, nombre: e.target.value }))}
                  placeholder="Nombre del cliente"
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="email@ejemplo.com"
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                  Teléfono
                </label>
                <input
                  type="tel"
                  value={editForm.telefono}
                  onChange={(e) => setEditForm(prev => ({ ...prev, telefono: e.target.value }))}
                  placeholder="Teléfono"
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                  Dirección <span className="text-muted-foreground font-normal">(opcional)</span>
                </label>
                <input
                  type="text"
                  value={editForm.direccion}
                  onChange={(e) => setEditForm(prev => ({ ...prev, direccion: e.target.value }))}
                  placeholder="Dirección del cliente"
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 p-4 border-t">
              <Button variant="outline" onClick={closeEditModal}>
                Cancelar
              </Button>
              <Button onClick={handleSaveEdit} disabled={saving}>
                {saving ? 'Guardando...' : 'Guardar'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de creación */}
      {creatingCliente && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-background rounded-xl border shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold">Nuevo Cliente</h2>
              <button
                onClick={closeCreateModal}
                className="p-1 hover:bg-muted rounded"
              >
                <X className="size-5" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                  Nombre
                </label>
                <input
                  type="text"
                  value={editForm.nombre}
                  onChange={(e) => setEditForm(prev => ({ ...prev, nombre: e.target.value }))}
                  placeholder="Nombre del cliente"
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="email@ejemplo.com"
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                  Teléfono
                </label>
                <input
                  type="tel"
                  value={editForm.telefono}
                  onChange={(e) => setEditForm(prev => ({ ...prev, telefono: e.target.value }))}
                  placeholder="Teléfono"
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                  Dirección <span className="text-muted-foreground font-normal">(opcional)</span>
                </label>
                <input
                  type="text"
                  value={editForm.direccion}
                  onChange={(e) => setEditForm(prev => ({ ...prev, direccion: e.target.value }))}
                  placeholder="Dirección del cliente"
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 p-4 border-t">
              <Button variant="outline" onClick={closeCreateModal}>
                Cancelar
              </Button>
              <Button onClick={handleCreateCliente} disabled={saving || (!editForm.nombre && !editForm.email && !editForm.telefono)}>
                {saving ? 'Creando...' : 'Crear Cliente'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
