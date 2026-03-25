'use client';

import { useState, useEffect } from 'react';
import { Search, Mail, Phone, User, Users, Pencil, Plus, MapPin, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { fetchWithCsrf } from '@/lib/csrf-client';
import { logClientError } from '@/lib/client-error';
import { useLanguage } from '@/lib/language-context';
import { t } from '@/lib/translations';

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
  const { language } = useLanguage();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingCliente, setEditingCliente] = useState<Cliente | null>(null);
  const [creatingCliente, setCreatingCliente] = useState(false);
  const [editForm, setEditForm] = useState({ nombre: '', email: '', telefono: '', direccion: '' });
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ show: boolean; id: string | null; nombre: string | null }>({ show: false, id: null, nombre: null });

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
          setError(t("errorLoadingClients", language));
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        logClientError(error, 'fetchClientes');
        setError(t("connectionErrorClients", language));
      } finally {
        setLoading(false);
      }
    }
    fetchClientes();
    return () => controller.abort();
  }, [language]);

  const filteredClientes = clientes.filter(c =>
    c.nombre?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.telefono?.includes(searchTerm)
  );

  const handleTogglePromociones = async (cliente: Cliente) => {
    const newValue = !cliente.aceptar_promociones;
    
    try {
      const res = await fetchWithCsrf('/api/admin/clientes', {
        method: 'PATCH',
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
      logClientError(error, 'handleTogglePromociones');
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
      const res = await fetchWithCsrf('/api/admin/clientes', {
        method: 'PATCH',
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
      logClientError(error, 'handleUpdateCliente');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateCliente = async () => {
    if (!editForm.nombre && !editForm.email && !editForm.telefono) return;
    
    setSaving(true);
    try {
      const res = await fetchWithCsrf('/api/admin/clientes', {
        method: 'POST',
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
      logClientError(error, 'handleCreateCliente');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCliente = (cliente: Cliente) => {
    setDeleteConfirm({ show: true, id: cliente.id, nombre: cliente.nombre });
  };

  const confirmDeleteCliente = async () => {
    if (!deleteConfirm.id) return;

    setSaving(true);
    try {
      const res = await fetchWithCsrf('/api/admin/clientes', {
        method: 'DELETE',
        body: JSON.stringify({ id: deleteConfirm.id }),
      });

      if (res.ok) {
        setClientes(prev => prev.filter(c => c.id !== deleteConfirm.id));
      }
    } catch (error) {
      logClientError(error, 'handleDeleteCliente');
    } finally {
      setSaving(false);
      setDeleteConfirm({ show: false, id: null, nombre: null });
    }
  };

  return (
    <div className="pt-16 lg:pt-0 px-6 py-6 space-y-6">
      {/* Header con contador */}
      <div className="bg-primary rounded-lg p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-xl sm:text-2xl font-semibold text-primary-foreground">{t("clientsTitle", language)}</h1>
              <p className="text-primary-foreground/80 text-sm mt-1">{t("clientsSubtitle", language)}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="bg-primary-foreground/20 rounded-lg px-4 py-3 text-center">
              <Users className="w-6 h-6 sm:w-8 sm:h-8 text-primary-foreground mx-auto mb-1" />
              <span className="text-xl sm:text-2xl font-semibold text-primary-foreground">{clientes.length}</span>
              <p className="text-primary-foreground/80 text-xs">{t("totalClients", language)}</p>
            </div>
            <Button 
              onClick={openCreateModal}
              className="bg-primary-foreground text-primary hover:bg-primary-foreground/90 font-semibold shrink-0"
            >
              <Plus className="w-4 h-4 mr-2" />
              <span className="hidden sm:inline">{t("newClient", language)}</span>
              <span className="sm:hidden">{t("new", language)}</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Buscador */}
      <div className="mb-4">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder={t("searchClients", language)}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            aria-label={t("searchClients", language)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Tabla clientes */}
      {loading && (
        <div className="text-center py-8 text-muted-foreground">{t("loading", language)}</div>
      )}
      {error && (
        <div className="mb-4 p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
          <p className="text-destructive text-sm font-medium">{error}</p>
          <Button 
            variant="outline" 
            size="sm" 
            className="mt-2"
            onClick={() => globalThis.location.reload()}
          >
            {t("retry", language)}
          </Button>
        </div>
      )}
      {!loading && !error && filteredClientes.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Users className="w-12 h-12 opacity-30 mb-3" />
          <p className="text-base font-medium text-foreground">
            {searchTerm ? t("noClientsFound", language) : t("noClientsYet", language)}
          </p>
          <p className="text-sm mt-1">
            {searchTerm ? t("noClientsFoundHint", language) : t("noClientsYetHint", language)}
          </p>
        </div>
      )}
      {!loading && filteredClientes.length > 0 && (
        <div className="bg-card rounded-lg border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">{t("name", language)}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">{t("email", language)}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">{t("phone", language)}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">{t("address", language)}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">{t("ordersLabel", language)}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">{t("date", language)}</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground uppercase">{t("promotionsLabel", language)}</th>
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
                          role="switch"
                          aria-checked={!!cliente.aceptar_promociones}
                          aria-label={t("promotionsLabel", language)}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
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
                        className="p-2 hover:bg-muted rounded-lg transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[44px] min-w-[44px] flex items-center justify-center"
                        title={t("edit", language)}
                      >
                        <Pencil className="size-4 text-muted-foreground" />
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleDeleteCliente(cliente)}
                        className="p-2 hover:bg-destructive/10 rounded-lg transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[44px] min-w-[44px] flex items-center justify-center"
                        title={t("delete", language)}
                      >
                        <Trash2 className="size-4 text-destructive" />
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
            <DialogTitle>{t("editClient", language)}</DialogTitle>
            <DialogDescription>
              {t("editClientDesc", language)}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label htmlFor="edit_nombre" className="block text-sm font-medium text-foreground mb-1">
                {t("name", language)}
              </label>
              <Input
                id="edit_nombre"
                type="text"
                value={editForm.nombre}
                onChange={(e) => setEditForm(prev => ({ ...prev, nombre: e.target.value }))}
                placeholder={t("clientNamePlaceholder", language)}
              />
            </div>
            <div>
              <label htmlFor="edit_email" className="block text-sm font-medium text-foreground mb-1">
                {t("email", language)}
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
                {t("phone", language)}
              </label>
              <Input
                id="edit_telefono"
                type="tel"
                value={editForm.telefono}
                onChange={(e) => setEditForm(prev => ({ ...prev, telefono: e.target.value }))}
                placeholder={t("phone", language)}
              />
            </div>
            <div>
              <label htmlFor="edit_direccion" className="block text-sm font-medium text-foreground mb-1">
                {t("address", language)} <span className="text-muted-foreground font-normal">({t("optional", language)})</span>
              </label>
              <Input
                id="edit_direccion"
                type="text"
                value={editForm.direccion}
                onChange={(e) => setEditForm(prev => ({ ...prev, direccion: e.target.value }))}
                placeholder={t("addressPlaceholder", language)}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={closeEditModal}>
              {t("cancel", language)}
            </Button>
            <Button onClick={handleSaveEdit} disabled={saving}>
              {saving ? t("savingProgress", language) : t("save", language)}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal de creación */}
      <Dialog open={creatingCliente} onOpenChange={(open) => { if (!open) closeCreateModal(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("newClient", language)}</DialogTitle>
            <DialogDescription>
              {t("newClientDesc", language)}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label htmlFor="create_nombre" className="block text-sm font-medium text-foreground mb-1">
                {t("name", language)}
              </label>
              <Input
                id="create_nombre"
                type="text"
                value={editForm.nombre}
                onChange={(e) => setEditForm(prev => ({ ...prev, nombre: e.target.value }))}
                placeholder={t("clientNamePlaceholder", language)}
              />
            </div>
            <div>
              <label htmlFor="create_email" className="block text-sm font-medium text-foreground mb-1">
                {t("email", language)}
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
                {t("phone", language)}
              </label>
              <Input
                id="create_telefono"
                type="tel"
                value={editForm.telefono}
                onChange={(e) => setEditForm(prev => ({ ...prev, telefono: e.target.value }))}
                placeholder={t("phone", language)}
              />
            </div>
            <div>
              <label htmlFor="create_direccion" className="block text-sm font-medium text-foreground mb-1">
                {t("address", language)} <span className="text-muted-foreground font-normal">({t("optional", language)})</span>
              </label>
              <Input
                id="create_direccion"
                type="text"
                value={editForm.direccion}
                onChange={(e) => setEditForm(prev => ({ ...prev, direccion: e.target.value }))}
                placeholder={t("addressPlaceholder", language)}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={closeCreateModal}>
              {t("cancel", language)}
            </Button>
            <Button onClick={handleCreateCliente} disabled={saving || (!editForm.nombre && !editForm.email && !editForm.telefono)}>
              {saving ? t("creatingProgress", language) : t("createClient", language)}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal de confirmación de eliminación */}
      <Dialog open={deleteConfirm.show} onOpenChange={(open) => { if (!open) setDeleteConfirm({ show: false, id: null, nombre: null }); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className="p-2 bg-destructive/10 rounded-full">
                <Trash2 className="w-5 h-5 text-destructive" />
              </div>
              {t("deleteClient", language)}
            </DialogTitle>
            <DialogDescription>
              {t("deleteClientConfirm", language)} <strong>{deleteConfirm.nombre || '-'}</strong>? {t("cannotUndo", language)}
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 justify-end">
            <button
              type="button"
              onClick={() => setDeleteConfirm({ show: false, id: null, nombre: null })}
              className="px-4 py-2 text-muted-foreground hover:bg-muted rounded-lg min-h-[44px] outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {t("cancel", language)}
            </button>
            <button
              type="button"
              onClick={confirmDeleteCliente}
              className="px-4 py-2 bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-lg min-h-[44px] outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {t("delete", language)}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
