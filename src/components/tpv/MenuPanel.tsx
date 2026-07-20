'use client';

import { useState } from 'react';
import Image from 'next/image';
import type { Product, Category } from '@/core/domain/entities/types';
import type { PendingItem } from '@/hooks/tpv/useMesaActiva';
import type { ComplementoGrupo } from '@/core/domain/entities/complemento-types';
import { useTpvCatalog } from '@/lib/tpv-catalog-ctx';

type AddItemPayload = Omit<PendingItem, 'cantidad'>;

interface Props {
  readonly products: Product[];
  readonly categories: Category[];
  readonly onAddItem: (item: AddItemPayload) => void;
  readonly mesaSeleccionada: boolean;
}

interface ComplementDialogState {
  product: Product;
  newGroups: ComplementoGrupo[];
  legacyOptions: Product[];
  legacyRequired: boolean;
}

const ALL_CAT_ID = '__all__';

function matchesSearch(product: Product, query: string): boolean {
  if (query === '') return true;
  return product.titulo_es.toLowerCase().includes(query.toLowerCase());
}

function buildComplementMaps(categories: Category[], products: Product[]) {
  const complementsByCatId = new Map<string, Product[]>();
  const requiredByCatId = new Map<string, boolean>();

  for (const cat of categories) {
    if (!cat.categoriaComplementoDe) continue;
    const parentId = cat.categoriaComplementoDe;
    const opts = products.filter(p => p.categoriaId === cat.id && p.activo);
    if (opts.length === 0) continue;
    const existing = complementsByCatId.get(parentId) ?? [];
    complementsByCatId.set(parentId, [...existing, ...opts]);
    if (cat.complementoObligatorio) {
      requiredByCatId.set(parentId, true);
    } else if (!requiredByCatId.has(parentId)) {
      requiredByCatId.set(parentId, false);
    }
  }
  return { complementsByCatId, requiredByCatId };
}

interface NormalizedGroup {
  id: string;
  name: string;
  tipo: 'radio' | 'checkbox';
  obligatorio: boolean;
  opciones: Array<{ id: string; name: string; precio: number }>;
}

function normalizeGroups(state: ComplementDialogState): NormalizedGroup[] {
  if (state.newGroups.length > 0) {
    return state.newGroups.map(g => ({
      id: g.id,
      name: g.nombre_es,
      tipo: g.tipo,
      obligatorio: g.obligatorio,
      opciones: g.opciones.map(o => ({ id: o.id, name: o.nombre_es, precio: o.precioAdicional })),
    }));
  }
  if (state.legacyOptions.length > 0) {
    return [{
      id: '__legacy__',
      name: 'Complementos',
      tipo: 'radio' as const,
      obligatorio: state.legacyRequired,
      opciones: state.legacyOptions.map(p => ({ id: p.titulo_es, name: p.titulo_es, precio: p.precio })),
    }];
  }
  return [];
}

interface ComplementDialogProps {
  state: ComplementDialogState;
  onConfirm: (complementos: { nombre: string; precio: number }[], precioTotal: number) => void;
  onClose: () => void;
}

function resolveConfirmClass(valid: boolean): string {
  return valid ? 'text-white' : 'text-[#64748b]';
}

function ComplementDialog({ state, onConfirm, onClose }: Readonly<ComplementDialogProps>) {
  const [selectedByGroup, setSelectedByGroup] = useState<Record<string, Set<string>>>({});

  const groups = normalizeGroups(state);
  const isValid = groups
    .filter(g => g.obligatorio)
    .every(g => (selectedByGroup[g.id]?.size ?? 0) > 0);

  const selectedOpciones = groups.flatMap(g =>
    g.opciones.filter(o => selectedByGroup[g.id]?.has(o.id))
  );
  const complementosExtra = selectedOpciones.reduce((s, o) => s + o.precio, 0);
  const precioTotal = state.product.precio + complementosExtra;

  function toggleRadio(grupoId: string, opcionId: string) {
    setSelectedByGroup(prev => {
      const already = prev[grupoId]?.has(opcionId) ?? false;
      return { ...prev, [grupoId]: already ? new Set() : new Set([opcionId]) };
    });
  }

  function toggleCheckbox(grupoId: string, opcionId: string) {
    setSelectedByGroup(prev => {
      const current = new Set(prev[grupoId] ?? []);
      if (current.has(opcionId)) { current.delete(opcionId); } else { current.add(opcionId); }
      return { ...prev, [grupoId]: current };
    });
  }

  function handleConfirm() {
    if (!isValid) return;
    const complementos = selectedOpciones.map(o => ({ nombre: o.name, precio: o.precio }));
    onConfirm(complementos, precioTotal);
  }

  function fmt(euros: number): string {
    return euros.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-[#e2e8f0] shrink-0">
        <div>
          <p className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider mb-0.5">Complementos</p>
          <p className="text-base font-bold text-[#0f172a]">{state.product.titulo_es}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="w-8 h-8 flex items-center justify-center rounded-lg text-[#64748b] hover:text-[#0f172a] hover:bg-[#f1f5f9] transition-colors"
        >
          ✕
        </button>
      </div>

      {/* Scrollable complement groups */}
      <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-5">
        {groups.map(grupo => {
          const selectedCount = selectedByGroup[grupo.id]?.size ?? 0;
          const isRequired = grupo.obligatorio;
          const isComplete = isRequired ? selectedCount > 0 : true;
          return (
            <div key={grupo.id}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold text-[#475569]">{grupo.name}</span>
                {isRequired && !isComplete && (
                  <span className="text-[10px] text-[#f59e0b]">Obligatorio</span>
                )}
              </div>
              <div className="h-0.5 rounded-full mb-2 overflow-hidden bg-[#e2e8f0]">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: isComplete ? '100%' : '0%',
                    background: isRequired ? (isComplete ? '#16a34a' : '#ef4444') : '#2563eb',
                  }}
                />
              </div>
              <div className="flex flex-col gap-2">
                {grupo.opciones.map(opt => {
                  const isSelected = selectedByGroup[grupo.id]?.has(opt.id) ?? false;
                  const toggle = grupo.tipo === 'radio'
                    ? () => toggleRadio(grupo.id, opt.id)
                    : () => toggleCheckbox(grupo.id, opt.id);
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      role={grupo.tipo === 'radio' ? 'radio' : 'checkbox'}
                      aria-checked={isSelected}
                      onClick={toggle}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all text-left"
                      style={{
                        background: isSelected ? '#eff6ff' : '#f8fafc',
                        borderColor: isSelected ? '#2563eb' : '#e2e8f0',
                      }}
                    >
                      <span
                        className="w-4 h-4 shrink-0 flex items-center justify-center border-2"
                        style={{
                          borderRadius: grupo.tipo === 'radio' ? '50%' : '4px',
                          borderColor: isSelected ? '#2563eb' : '#d1d5db',
                        }}
                      >
                        {isSelected && grupo.tipo === 'radio' && (
                          <span className="w-2 h-2 rounded-full bg-[#2563eb]" />
                        )}
                        {isSelected && grupo.tipo === 'checkbox' && (
                          <span className="text-[10px] font-bold leading-none text-[#2563eb]">✓</span>
                        )}
                      </span>
                      <span className="flex-1 text-sm text-[#0f172a] font-medium">{opt.name}</span>
                      {opt.precio > 0 && (
                        <span className="text-xs text-[#2563eb] shrink-0">+{fmt(opt.precio)}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-[#e2e8f0] shrink-0 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-[#64748b]">Total</span>
          <span className="text-base font-bold text-[#0f172a]">{fmt(precioTotal)}</span>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 rounded-xl border border-[#e2e8f0] text-sm text-[#64748b] hover:border-[#cbd5e1] transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!isValid}
            className={`flex-1 py-3 rounded-xl text-sm font-semibold transition-colors disabled:opacity-40 ${resolveConfirmClass(isValid)}`}
            style={{ background: isValid ? '#2563eb' : '#e2e8f0' }}
          >
            Añadir
          </button>
        </div>
      </div>
    </div>
  );
}

export function MenuPanel({ products, categories, onAddItem, mesaSeleccionada }: Readonly<Props>) {
  const [activeCatId, setActiveCatId] = useState<string>(ALL_CAT_ID);
  const [search, setSearch] = useState('');
  const [complementDialog, setComplementDialog] = useState<ComplementDialogState | null>(null);

  const { complementoGruposByProductId } = useTpvCatalog();
  const { complementsByCatId, requiredByCatId } = buildComplementMaps(categories, products);

  const mainCategories = categories.filter(c => !c.categoriaComplementoDe);

  const activeProducts = products.filter(p => {
    if (!p.activo) return false;
    if (!p.categoriaId) return false;
    const cat = categories.find(c => c.id === p.categoriaId);
    if (cat?.categoriaComplementoDe) return false; // hide complement products from grid
    if (activeCatId !== ALL_CAT_ID && p.categoriaId !== activeCatId) return false;
    return matchesSearch(p, search);
  });

  function handleProductClick(product: Product) {
    const newGroups = complementoGruposByProductId.get(product.id) ?? [];
    const legacyOpts = complementsByCatId.get(product.categoriaId ?? '') ?? [];
    const legacyRequired = requiredByCatId.get(product.categoriaId ?? '') ?? false;

    if (newGroups.length > 0 || legacyOpts.length > 0) {
      setComplementDialog({ product, newGroups, legacyOptions: legacyOpts, legacyRequired });
    } else {
      onAddItem({
        productId: product.id,
        nombre: product.titulo_es,
        precio: product.precio,
        precioTotal: product.precio,
        complementos: [],
      });
    }
  }

  return (
    <>
    {complementDialog !== null && (
      <ComplementDialog
        state={complementDialog}
        onClose={() => setComplementDialog(null)}
        onConfirm={(complementos, precioTotal) => {
          onAddItem({
            productId: complementDialog.product.id,
            nombre: complementDialog.product.titulo_es,
            precio: complementDialog.product.precio,
            precioTotal,
            complementos,
          });
          setComplementDialog(null);
        }}
      />
    )}
    <section className="flex-1 flex flex-col overflow-hidden bg-[#f1f5f9]">
      {/* Category tabs */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[#e2e8f0] overflow-x-auto shrink-0 bg-white">
        <button
          type="button"
          onClick={() => setActiveCatId(ALL_CAT_ID)}
          className={`shrink-0 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
            activeCatId === ALL_CAT_ID
              ? 'bg-[#2563eb] text-white'
              : 'bg-[#f1f5f9] text-[#475569] border border-[#e2e8f0] hover:text-[#0f172a]'
          }`}
        >
          Todo
        </button>
        {mainCategories.map(cat => (
          <button
            key={cat.id}
            type="button"
            onClick={() => setActiveCatId(cat.id)}
            className={`shrink-0 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              activeCatId === cat.id
                ? 'bg-[#2563eb] text-white'
                : 'bg-[#f1f5f9] text-[#475569] border border-[#e2e8f0] hover:text-[#0f172a]'
            }`}
          >
            {cat.nombre ?? cat.id}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="px-4 py-3 border-b border-[#e2e8f0] shrink-0 bg-white">
        <input
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="🔍 Buscar producto..."
          className="w-full bg-white border border-[#e2e8f0] rounded-lg px-3 py-2 text-sm text-[#0f172a] placeholder:text-[#94a3b8] focus:outline-none focus:border-[#2563eb]"
        />
      </div>

      {/* Product grid */}
      <div className="flex-1 overflow-y-auto p-4 relative">
        {!mesaSeleccionada && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#f1f5f9]/90 backdrop-blur-[2px]">
            <div className="flex flex-col items-center gap-2 text-center px-6">
              <span className="text-3xl">🪑</span>
              <p className="text-sm font-semibold text-[#0f172a]">Selecciona una mesa</p>
              <p className="text-xs text-[#64748b]">Elige una mesa en el panel izquierdo para añadir productos.</p>
            </div>
          </div>
        )}
        {activeProducts.length === 0 && (
          <p className="text-center text-sm text-[#94a3b8] py-12">Sin productos</p>
        )}
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
          {activeProducts.map(p => (
            <button
              key={p.id}
              type="button"
              onClick={() => handleProductClick(p)}
              className="bg-white border border-[#e2e8f0] rounded-xl overflow-hidden flex flex-col hover:border-[#2563eb] hover:bg-[#f8fafc] transition-all text-left active:scale-95 shadow-sm"
            >
              <div className="w-full aspect-square bg-[#f8fafc] relative">
                {p.fotoUrl !== null ? (
                  <Image
                    src={p.fotoUrl}
                    alt={p.titulo_es}
                    fill
                    className="object-contain"
                    sizes="(max-width: 640px) 50vw, 20vw"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-2xl text-[#cbd5e1]">
                    +
                  </div>
                )}
              </div>
              <div className="p-2.5 flex flex-col gap-1">
                <p className="text-xs font-semibold leading-tight line-clamp-2 text-[#0f172a] uppercase tracking-wide">{p.titulo_es}</p>
                <p className="text-base font-bold text-[#2563eb]">
                  {p.precio.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </section>
    </>
  );
}
