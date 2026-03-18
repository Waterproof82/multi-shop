'use client';

import { useState, useEffect } from 'react';
import { Search, Mail, Phone, User, Users, Pencil, X, Plus, MapPin, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

interface Cliente {
  id: string;
  nombre: string | null;
  email: string | null;
  telefono: string | null;
  direccion: string | null;
  aceptar_promociones: boolean | null;
  numero_pedidos?: number;
  created_at: string;
}

export default function ClientesPage() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingCliente, setEditingCliente] = useState<Cliente | null>(null);
  const [creatingCliente, setCreatingCliente] = useState(false);
  const [editForm, setEditForm] = useState({ nombre: '', email: '', telefono: '', direccion: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    async function fetchClientes() {
      try {
        setError(null);
        const res = await fetch('/api/admin/clientes', { signal: controller.signal });
        if (res.ok) {
          const data = await res.json();
          setClientes(data.clientes || []);
        } else {
          setError('Error al cargar clientes. Por favor, inténtalo de nuevo.');
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        console.error('Error fetching clientes:', error);
        setError('Error de conexión. Verifica tu conexión a internet.');
      } finally {
        setLoading(false);
      }
    }
    fetchClientes();
    return () => controller.abort();
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
      <div className="bg-primary rounded-lg p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-2xl font-semibold text-primary-foreground">Clientes</h1>
              <p className="text-primary-foreground/80 text-sm mt-1">Gestiona tus clientes</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Button 
              onClick={openCreateModal}
              className="bg-primary-foreground text-primary hover:bg-primary-foreground/90 font-semibold"
            >
              <Plus className="w-4 h-4 mr-2" />
              Nuevo Cliente
            </Button>
            <div className="bg-primary-foreground/20 rounded-lg px-6 py-4 text-center">
              <Users className="w-8 h-8 text-primary-foreground mx-auto mb-1" />
              <span className="text-2xl font-semibold text-primary-foreground">{clientes.length}</span>
              <p className="text-primary-foreground/80 text-xs">Total clientes</p>
            </div>
          </div>
        </div>
      </div>

      {/* Buscador */}
      <div className="mb-4">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Buscar clientes..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            aria-label="Buscar clientes"
            className="pl-10"
          />
        </div>
      </div>

      {/* Tabla clientes */}
      {loading && (
        <div className="text-center py-8 text-muted-foreground">Cargando...</div>
      )}
      {error && (
        <div className="mb-4 p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
          <p className="text-destructive text-sm font-medium">{error}</p>
          <Button 
            variant="outline" 
            size="sm" 
            className="mt-2"
            onClick={() => window.location.reload()}
          >
            Reintentar
          </Button>
        </div>
      )}
      {!loading && !error && filteredClientes.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Users className="w-12 h-12 opacity-30 mb-3" />
          <p className="text-base font-medium text-foreground">
            {searchTerm ? 'No se encontraron clientes' : 'No hay clientes registrados'}
          </p>
          <p className="text-sm mt-1">
            {searchTerm ? 'Prueba con otros términos de búsqueda' : 'Los clientes aparecerán aquí cuando realicen pedidos'}
          </p>
        </div>
      )}
      {!loading && filteredClientes.length > 0 && (
        <div className="bg-card rounded-lg border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Nombre</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Email</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Teléfono</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Dirección</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Pedidos</th>
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
                        <User className="size-4 text-muted-foreground shrink-0" />
                        <span className="font-medium text-foreground truncate max-w-[150px]">
                          {cliente.nombre || '-'}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Mail className="size-4 text-muted-foreground shrink-0" />
                        <span className="text-foreground truncate max-w-[180px]">
                          {cliente.email || '-'}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Phone className="size-4 text-muted-foreground shrink-0" />
                        <span className="text-foreground truncate max-w-[120px]">
                          {cliente.telefono || '-'}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <MapPin className="size-4 text-muted-foreground shrink-0" />
                        <span className="text-foreground truncate max-w-[150px]">
                          {cliente.direccion || '-'}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center justify-center px-2 py-1 bg-primary/10 text-primary rounded-full text-sm font-medium">
                        {cliente.numero_pedidos || 0}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-sm">
                      {cliente.created_at ? new Date(cliente.created_at).toLocaleDateString('es-ES') : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-center">
                        <button
                          onClick={() => handleTogglePromociones(cliente)}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                            cliente.aceptar_promociones ? 'bg-primary' : 'bg-muted'
                          }`}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-primary-foreground transition-transform ${
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
                        className="p-2 hover:bg-muted rounded-lg transition-colors text-destructive hover:text-destructive/80"
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
      <Dialog open={!!editingCliente} onOpenChange={(open) => { if (!open) closeEditModal(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Cliente</DialogTitle>
            <DialogDescription>
              Modifica los datos del cliente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label htmlFor="edit_nombre" className="block text-sm font-medium text-foreground mb-1">
                Nombre
              </label>
              <Input
                id="edit_nombre"
                type="text"
                value={editForm.nombre}
                onChange={(e) => setEditForm(prev => ({ ...prev, nombre: e.target.value }))}
                placeholder="Nombre del cliente"
              />
            </div>
            <div>
              <label htmlFor="edit_email" className="block text-sm font-medium text-foreground mb-1">
                Email
              </label>
              <Input
                id="edit_email"
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm(prev => ({ ...prev, email: e.target.value }))}
                placeholder="email@ejemplo.com"
              />
            </div>
            <div>
              <label htmlFor="edit_telefono" className="block text-sm font-medium text-foreground mb-1">
                Teléfono
              </label>
              <Input
                id="edit_telefono"
                type="tel"
                value={editForm.telefono}
                onChange={(e) => setEditForm(prev => ({ ...prev, telefono: e.target.value }))}
                placeholder="Teléfono"
              />
            </div>
            <div>
              <label htmlFor="edit_direccion" className="block text-sm font-medium text-foreground mb-1">
                Dirección <span className="text-muted-foreground font-normal">(opcional)</span>
              </label>
              <Input
                id="edit_direccion"
                type="text"
                value={editForm.direccion}
                onChange={(e) => setEditForm(prev => ({ ...prev, direccion: e.target.value }))}
                placeholder="Dirección del cliente"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={closeEditModal}>
              Cancelar
            </Button>
            <Button onClick={handleSaveEdit} disabled={saving}>
              {saving ? 'Guardando...' : 'Guardar'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal de creación */}
      <Dialog open={creatingCliente} onOpenChange={(open) => { if (!open) closeCreateModal(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nuevo Cliente</DialogTitle>
            <DialogDescription>
              Crea un nuevo cliente en el sistema.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label htmlFor="create_nombre" className="block text-sm font-medium text-foreground mb-1">
                Nombre
              </label>
              <Input
                id="create_nombre"
                type="text"
                value={editForm.nombre}
                onChange={(e) => setEditForm(prev => ({ ...prev, nombre: e.target.value }))}
                placeholder="Nombre del cliente"
              />
            </div>
            <div>
              <label htmlFor="create_email" className="block text-sm font-medium text-foreground mb-1">
                Email
              </label>
              <Input
                id="create_email"
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm(prev => ({ ...prev, email: e.target.value }))}
                placeholder="email@ejemplo.com"
              />
            </div>
            <div>
              <label htmlFor="create_telefono" className="block text-sm font-medium text-foreground mb-1">
                Teléfono
              </label>
              <Input
                id="create_telefono"
                type="tel"
                value={editForm.telefono}
                onChange={(e) => setEditForm(prev => ({ ...prev, telefono: e.target.value }))}
                placeholder="Teléfono"
              />
            </div>
            <div>
              <label htmlFor="create_direccion" className="block text-sm font-medium text-foreground mb-1">
                Dirección <span className="text-muted-foreground font-normal">(opcional)</span>
              </label>
              <Input
                id="create_direccion"
                type="text"
                value={editForm.direccion}
                onChange={(e) => setEditForm(prev => ({ ...prev, direccion: e.target.value }))}
                placeholder="Dirección del cliente"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={closeCreateModal}>
              Cancelar
            </Button>
            <Button onClick={handleCreateCliente} disabled={saving || (!editForm.nombre && !editForm.email && !editForm.telefono)}>
              {saving ? 'Creando...' : 'Crear Cliente'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
