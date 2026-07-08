'use client';

import { useEffect, useState } from 'react';
import { Users, Plus, Key, Power, Trash2, X } from 'lucide-react';
import { fetchWithCsrf } from '@/lib/csrf-client';

interface Empleado {
  id: string;
  nombre: string;
  rol: 'cajero' | 'encargado';
  activo: boolean;
  createdAt: string;
}

interface Props {
  readonly empresaId: string;
}

function RolBadge({ rol }: Readonly<{ rol: 'cajero' | 'encargado' }>) {
  const isEncargado = rol === 'encargado';
  return (
    <span
      className="text-[11px] font-bold uppercase px-2 py-0.5 rounded-full"
      style={isEncargado
        ? { background: 'oklch(28% 0.10 250 / 0.6)', color: 'oklch(82% 0.18 250)' }
        : { background: 'oklch(28% 0.10 148 / 0.6)', color: 'oklch(82% 0.18 148)' }}
    >
      {isEncargado ? 'Encargado' : 'Cajero'}
    </span>
  );
}

export function EmpleadosTpvPanel({ empresaId: _empresaId }: Props) {
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [pinModalId, setPinModalId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Create form state
  const [nombre, setNombre] = useState('');
  const [rol, setRol] = useState<'cajero' | 'encargado'>('cajero');
  const [pin, setPin] = useState('');
  const [saving, setSaving] = useState(false);

  // PIN change state
  const [newPin, setNewPin] = useState('');
  const [changingPin, setChangingPin] = useState(false);

  async function loadEmpleados() {
    setLoading(true);
    const res = await fetch('/api/admin/empleados-tpv');
    if (res.ok) {
      const data = await res.json() as Empleado[];
      setEmpleados(data);
    }
    setLoading(false);
  }

  useEffect(() => {
    void loadEmpleados();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    const res = await fetchWithCsrf('/api/admin/empleados-tpv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre, rol, pin }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json() as { error?: string };
      setError(data.error ?? 'Error al crear empleado');
      return;
    }
    setNombre('');
    setPin('');
    setRol('cajero');
    setShowCreate(false);
    await loadEmpleados();
  }

  async function handleToggleActivo(id: string, activo: boolean) {
    await fetchWithCsrf(`/api/admin/empleados-tpv/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activo: !activo }),
    });
    await loadEmpleados();
  }

  async function handleChangePin(id: string) {
    if (newPin.length < 4 || changingPin) return;
    setChangingPin(true);
    const res = await fetchWithCsrf(`/api/admin/empleados-tpv/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: newPin }),
    });
    setChangingPin(false);
    if (!res.ok) {
      const data = await res.json() as { error?: string };
      setError(data.error ?? 'Error al cambiar PIN');
      return;
    }
    setNewPin('');
    setPinModalId(null);
  }

  async function handleDelete(id: string) {
    await fetchWithCsrf(`/api/admin/empleados-tpv/${id}`, { method: 'DELETE' });
    await loadEmpleados();
  }

  if (loading) {
    return <p className="text-sm text-[#6b7280] py-8 text-center">Cargando empleados...</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-[#4f72ff]" />
          <h3 className="font-semibold text-[#e8eaf0]">Empleados TPV</h3>
          <span className="text-xs text-[#6b7280]">({empleados.length})</span>
        </div>
        <button
          type="button"
          onClick={() => { setShowCreate(o => !o); setError(null); }}
          className="flex items-center gap-1.5 text-sm bg-[#4f72ff] text-white px-3 py-1.5 rounded-lg hover:brightness-110 transition-all"
        >
          <Plus className="h-4 w-4" />
          Nuevo empleado
        </button>
      </div>

      {showCreate && (
        <form
          onSubmit={handleCreate}
          className="bg-[#1a1d27] border border-[#2e3347] rounded-xl p-5 flex flex-col gap-4"
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-semibold text-[#e8eaf0]">Nuevo empleado</span>
            <button type="button" onClick={() => setShowCreate(false)}>
              <X className="h-4 w-4 text-[#6b7280] hover:text-[#e8eaf0]" />
            </button>
          </div>
          <input
            type="text"
            value={nombre}
            onChange={e => setNombre(e.target.value)}
            placeholder="Nombre completo"
            maxLength={80}
            required
            className="bg-[#22263a] border border-[#2e3347] rounded-lg px-3 py-2 text-sm text-[#e8eaf0] outline-none focus:border-[#4f72ff] transition-colors"
          />
          <select
            value={rol}
            onChange={e => setRol(e.target.value as 'cajero' | 'encargado')}
            className="bg-[#22263a] border border-[#2e3347] rounded-lg px-3 py-2 text-sm text-[#e8eaf0] outline-none focus:border-[#4f72ff] transition-colors"
          >
            <option value="cajero">Cajero</option>
            <option value="encargado">Encargado</option>
          </select>
          <input
            type="password"
            inputMode="numeric"
            value={pin}
            onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
            placeholder="PIN (4-8 dígitos)"
            required
            className="bg-[#22263a] border border-[#2e3347] rounded-lg px-3 py-2 text-sm text-[#e8eaf0] outline-none focus:border-[#4f72ff] transition-colors tracking-widest"
          />
          {error !== null && (
            <p className="text-xs text-red-400">{error}</p>
          )}
          <button
            type="submit"
            disabled={nombre.length < 2 || pin.length < 4 || saving}
            className="bg-[#4f72ff] text-white rounded-lg py-2 text-sm font-bold disabled:opacity-40 hover:brightness-110 transition-all"
          >
            {saving ? 'Guardando...' : 'Crear empleado'}
          </button>
        </form>
      )}

      {empleados.length === 0 && !showCreate && (
        <p className="text-sm text-[#6b7280] py-4 text-center">No hay empleados creados aún.</p>
      )}

      <div className="flex flex-col gap-2">
        {empleados.map(emp => (
          <div
            key={emp.id}
            className="bg-[#1a1d27] border border-[#2e3347] rounded-xl px-4 py-3 flex items-center justify-between gap-4"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex flex-col gap-1 min-w-0">
                <span className={`text-sm font-medium truncate ${emp.activo ? 'text-[#e8eaf0]' : 'text-[#6b7280] line-through'}`}>
                  {emp.nombre}
                </span>
                <RolBadge rol={emp.rol} />
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {pinModalId === emp.id ? (
                <div className="flex items-center gap-2">
                  <input
                    type="password"
                    inputMode="numeric"
                    value={newPin}
                    onChange={e => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
                    placeholder="Nuevo PIN"
                    autoFocus
                    className="bg-[#22263a] border border-[#2e3347] rounded-lg px-2 py-1 text-xs text-[#e8eaf0] outline-none focus:border-[#4f72ff] w-24 tracking-widest"
                  />
                  <button
                    type="button"
                    onClick={() => handleChangePin(emp.id)}
                    disabled={newPin.length < 4 || changingPin}
                    className="text-xs bg-[#4f72ff] text-white px-2 py-1 rounded-lg disabled:opacity-40"
                  >
                    OK
                  </button>
                  <button type="button" onClick={() => { setPinModalId(null); setNewPin(''); }}>
                    <X className="h-4 w-4 text-[#6b7280]" />
                  </button>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => { setPinModalId(emp.id); setError(null); }}
                    title="Cambiar PIN"
                    className="p-1.5 rounded-lg text-[#6b7280] hover:text-[#4f72ff] transition-colors"
                  >
                    <Key className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleActivo(emp.id, emp.activo)}
                    title={emp.activo ? 'Desactivar' : 'Activar'}
                    className={`p-1.5 rounded-lg transition-colors ${emp.activo ? 'text-[#22c55e] hover:text-[#6b7280]' : 'text-[#6b7280] hover:text-[#22c55e]'}`}
                  >
                    <Power className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(emp.id)}
                    title="Eliminar"
                    className="p-1.5 rounded-lg text-[#6b7280] hover:text-[#ef4444] transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
      {error !== null && pinModalId === null && (
        <p className="text-xs text-red-400">{error}</p>
      )}
    </div>
  );
}
