'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Save, Loader2, ListChecks, ToggleLeft, ToggleRight, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { fetchWithCsrf } from '@/lib/csrf-client';
import { useAdmin } from '@/lib/admin-context';
import type { ComplementoGrupo } from '@/core/domain/entities/complemento-types';

export default function ComplementosPage() {
  const { empresaId } = useAdmin();
  const [grupos, setGrupos] = useState<ComplementoGrupo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedGrupoId, setSelectedGrupoId] = useState<string | null>(null);
  const [editNombre, setEditNombre] = useState('');
  const [editTipo, setEditTipo] = useState<'radio' | 'checkbox'>('radio');
  const [editObligatorio, setEditObligatorio] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newOpcionNombre, setNewOpcionNombre] = useState('');
  const [newOpcionPrecio, setNewOpcionPrecio] = useState(0);
  const [addingOpcion, setAddingOpcion] = useState(false);

  const fetchGrupos = useCallback(async () => {
    const res = await fetch('/api/admin/complementos/grupos');
    if (!res.ok) return;
    const data = await res.json() as ComplementoGrupo[];
    setGrupos(data);
  }, []);

  useEffect(() => {
    void fetchGrupos().finally(() => setLoading(false));
  }, [fetchGrupos]);

  const selectedGrupo = grupos.find(g => g.id === selectedGrupoId) ?? null;

  function handleSelectGrupo(grupo: ComplementoGrupo) {
    setSelectedGrupoId(grupo.id);
    setEditNombre(grupo.nombre_es);
    setEditTipo(grupo.tipo);
    setEditObligatorio(grupo.obligatorio);
    setNewOpcionNombre('');
    setNewOpcionPrecio(0);
  }

  async function handleNuevoGrupo() {
    if (!empresaId) return;
    const res = await fetchWithCsrf('/api/admin/complementos/grupos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre_es: 'Nuevo grupo', tipo: 'radio', obligatorio: false, empresaId }),
    });
    if (!res.ok) return;
    const created = await res.json() as ComplementoGrupo;
    setGrupos(prev => [created, ...prev]);
    handleSelectGrupo(created);
  }

  async function handleSaveGrupo() {
    if (!selectedGrupoId) return;
    setSaving(true);
    try {
      const res = await fetchWithCsrf(`/api/admin/complementos/grupos/${selectedGrupoId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre_es: editNombre, tipo: editTipo, obligatorio: editObligatorio }),
      });
      if (res.ok) {
        const updated = await res.json() as ComplementoGrupo;
        setGrupos(prev => prev.map(g => g.id === selectedGrupoId ? updated : g));
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteGrupo() {
    if (!selectedGrupoId) return;
    if (!confirm('¿Eliminar este grupo y todas sus opciones?')) return;
    const res = await fetchWithCsrf(`/api/admin/complementos/grupos/${selectedGrupoId}`, { method: 'DELETE' });
    if (res.ok) {
      setGrupos(prev => prev.filter(g => g.id !== selectedGrupoId));
      setSelectedGrupoId(null);
    }
  }

  async function handleAddOpcion() {
    if (!selectedGrupoId || !newOpcionNombre.trim()) return;
    setAddingOpcion(true);
    try {
      const res = await fetchWithCsrf(`/api/admin/complementos/grupos/${selectedGrupoId}/opciones`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre_es: newOpcionNombre.trim(), precio_adicional: newOpcionPrecio }),
      });
      if (res.ok) {
        setNewOpcionNombre('');
        setNewOpcionPrecio(0);
        await fetchGrupos();
      }
    } finally {
      setAddingOpcion(false);
    }
  }

  async function handleDeleteOpcion(opcionId: string) {
    if (!selectedGrupoId) return;
    const res = await fetchWithCsrf(`/api/admin/complementos/grupos/${selectedGrupoId}/opciones/${opcionId}`, { method: 'DELETE' });
    if (res.ok) await fetchGrupos();
  }

  function fmtPrecio(euros: number) {
    return euros > 0 ? `+${euros.toFixed(2)} €` : 'Gratis';
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="pt-16 lg:pt-0 min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="flex h-[calc(100vh-4rem)] lg:h-screen">

        {/* Left panel — group list */}
        <div className="w-72 flex-shrink-0 border-r border-white/10 flex flex-col bg-slate-900/50">
          <div className="p-4 border-b border-white/10">
            <h1 className="text-white font-semibold text-lg mb-3">Complementos</h1>
            <Button
              onClick={() => void handleNuevoGrupo()}
              className="w-full gap-2 bg-primary hover:bg-primary/90 text-primary-foreground"
              size="sm"
            >
              <Plus className="w-4 h-4" />
              Nuevo grupo
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto py-2">
            {grupos.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-2 py-12 px-4 text-center">
                <ListChecks className="w-8 h-8 text-slate-500" />
                <p className="text-sm text-slate-400">Sin grupos creados</p>
                <p className="text-xs text-slate-500">Crea un grupo para empezar</p>
              </div>
            )}
            {grupos.map(grupo => {
              const isSelected = selectedGrupoId === grupo.id;
              return (
                <button
                  key={grupo.id}
                  type="button"
                  onClick={() => handleSelectGrupo(grupo)}
                  className={`w-full text-left px-4 py-3 transition-all ${
                    isSelected
                      ? 'bg-white/10 border-l-2 border-primary'
                      : 'border-l-2 border-transparent hover:bg-white/5'
                  }`}
                >
                  <p className="text-sm font-medium text-white truncate">{grupo.nombre_es}</p>
                  <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-white/10 text-slate-300">
                      {grupo.tipo === 'radio' ? <ToggleLeft className="w-3 h-3" /> : <ToggleRight className="w-3 h-3" />}
                      {grupo.tipo === 'radio' ? 'Elige 1' : 'Múltiple'}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      grupo.obligatorio
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-400/20'
                        : 'bg-white/10 text-slate-400'
                    }`}>
                      {grupo.obligatorio ? 'Obligatorio' : 'Opcional'}
                    </span>
                    <span className="text-xs text-slate-500">{grupo.opciones.length} opc.</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right panel */}
        {selectedGrupo === null ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center">
            <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
              <ListChecks className="w-7 h-7 text-slate-500" />
            </div>
            <p className="text-slate-300 font-medium">Selecciona un grupo</p>
            <p className="text-sm text-slate-500">Elige uno de la lista para editarlo</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-6 space-y-6">

            {/* Header */}
            <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-5">
              <h2 className="text-white font-semibold text-base mb-4">Detalles del grupo</h2>

              <div className="space-y-4 max-w-lg">
                {/* Name */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-400 uppercase tracking-wider" htmlFor="edit-nombre">
                    Nombre
                  </label>
                  <Input
                    id="edit-nombre"
                    type="text"
                    value={editNombre}
                    onChange={e => setEditNombre(e.target.value)}
                    maxLength={200}
                    className="bg-white/5 border-white/15 text-white placeholder:text-slate-500 focus:border-primary focus:ring-primary/20"
                  />
                </div>

                {/* Type toggle */}
                <div className="space-y-1.5">
                  <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Tipo de selección</span>
                  <div className="flex gap-2 p-1 bg-white/5 rounded-xl border border-white/10 w-fit">
                    {(['radio', 'checkbox'] as const).map(tipo => (
                      <button
                        key={tipo}
                        type="button"
                        onClick={() => setEditTipo(tipo)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                          editTipo === tipo
                            ? 'bg-primary text-primary-foreground shadow-sm'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {tipo === 'radio' ? <ToggleLeft className="w-4 h-4" /> : <ToggleRight className="w-4 h-4" />}
                        {tipo === 'radio' ? 'Elige 1' : 'Múltiple'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Required toggle */}
                <button
                  type="button"
                  onClick={() => setEditObligatorio(prev => !prev)}
                  className={`flex items-center gap-3 w-fit px-4 py-2.5 rounded-xl border transition-all text-sm font-medium ${
                    editObligatorio
                      ? 'bg-amber-500/15 border-amber-400/30 text-amber-300'
                      : 'bg-white/5 border-white/10 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div className={`w-8 h-4 rounded-full transition-colors relative ${editObligatorio ? 'bg-amber-400' : 'bg-slate-600'}`}>
                    <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${editObligatorio ? 'translate-x-4' : 'translate-x-0.5'}`} />
                  </div>
                  Selección obligatoria
                </button>

                {/* Actions */}
                <div className="flex gap-3 pt-1">
                  <Button
                    onClick={() => void handleSaveGrupo()}
                    disabled={saving}
                    size="sm"
                    className="gap-2"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {saving ? 'Guardando...' : 'Guardar cambios'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void handleDeleteGrupo()}
                    className="gap-2 border-red-400/30 text-red-400 hover:bg-red-500/10 hover:text-red-300 bg-transparent"
                  >
                    <Trash2 className="w-4 h-4" />
                    Eliminar grupo
                  </Button>
                </div>
              </div>
            </div>

            {/* Options */}
            <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <Tag className="w-4 h-4 text-slate-400" />
                <h2 className="text-white font-semibold text-base">Opciones</h2>
                {selectedGrupo.opciones.length > 0 && (
                  <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-white/10 text-slate-400">
                    {selectedGrupo.opciones.length}
                  </span>
                )}
              </div>

              <div className="max-w-lg space-y-2">
                {selectedGrupo.opciones.length === 0 && (
                  <p className="text-sm text-slate-500 py-3 text-center">Sin opciones. Añade una abajo.</p>
                )}
                {selectedGrupo.opciones.map(opcion => (
                  <div
                    key={opcion.id}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 group"
                  >
                    <span className="flex-1 text-sm text-slate-200">{opcion.nombre_es}</span>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                      opcion.precioAdicional > 0
                        ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-400/20'
                        : 'bg-white/10 text-slate-400'
                    }`}>
                      {fmtPrecio(opcion.precioAdicional)}
                    </span>
                    <button
                      type="button"
                      onClick={() => void handleDeleteOpcion(opcion.id)}
                      className="text-slate-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                      aria-label="Eliminar opción"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}

                {/* Add option */}
                <div className="flex items-center gap-2 pt-3 mt-1 border-t border-white/10">
                  <Input
                    type="text"
                    value={newOpcionNombre}
                    onChange={e => setNewOpcionNombre(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') void handleAddOpcion(); }}
                    placeholder="Nombre de la opción"
                    maxLength={200}
                    className="flex-1 bg-white/5 border-white/15 text-white placeholder:text-slate-500 focus:border-primary h-9 text-sm"
                  />
                  <Input
                    type="number"
                    value={newOpcionPrecio}
                    onChange={e => setNewOpcionPrecio(Number(e.target.value))}
                    placeholder="€"
                    min={0}
                    step={0.01}
                    className="w-20 bg-white/5 border-white/15 text-white placeholder:text-slate-500 focus:border-primary h-9 text-sm"
                  />
                  <Button
                    size="sm"
                    onClick={() => void handleAddOpcion()}
                    disabled={addingOpcion || !newOpcionNombre.trim()}
                    className="gap-1.5 h-9 shrink-0"
                  >
                    {addingOpcion ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                    Añadir
                  </Button>
                </div>
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
