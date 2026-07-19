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
    <div className="fixed inset-0 z-50 flex flex-col bg-[#1a1d27]">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-[#2e3347] shrink-0">
        <div>
          <p className="text-[10px] font-bold text-[#6b7280] uppercase tracking-wider mb-0.5">Complementos</p>
          <p className="text-base font-bold text-[#e8eaf0]">{state.product.titulo_es}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="w-8 h-8 flex items-center justify-center rounded-lg text-[#6b7280] hover:text-[#e8eaf0] hover:bg-[#2e3347] transition-colors"
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
                <span className="text-xs font-semibold text-[#9ca3af]">{grupo.name}</span>
                {isRequired && !isComplete && (
                  <span className="text-[10px] text-[#f59e0b]">Obligatorio</span>
                )}
              </div>
              <div className="h-0.5 rounded-full mb-2 overflow-hidden bg-[#2e3347]">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: isComplete ? '100%' : '0%',
                    background: isRequired ? (isComplete ? '#22c55e' : '#ef4444') : '#4f72ff',
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
                        background: isSelected ? 'oklch(28% 0.10 260 / 0.5)' : 'oklch(20% 0.03 252 / 0.5)',
                        borderColor: isSelected ? 'oklch(60% 0.18 260)' : 'oklch(35% 0.04 252)',
                      }}
                    >
                      <span
                        className="w-4 h-4 shrink-0 flex items-center justify-center border-2"
                        style={{
                          borderRadius: grupo.tipo === 'radio' ? '50%' : '4px',
                          borderColor: isSelected ? 'oklch(60% 0.18 260)' : '#4b5563',
                        }}
                      >
                        {isSelected && grupo.tipo === 'radio' && (
                          <span className="w-2 h-2 rounded-full bg-[#4f72ff]" />
                        )}
                        {isSelected && grupo.tipo === 'checkbox' && (
                          <span className="text-[10px] font-bold leading-none text-[#4f72ff]">✓</span>
                        )}
                      </span>
                      <span className="flex-1 text-sm text-[#c8cad4] font-medium">{opt.name}</span>
                      {opt.precio > 0 && (
                        <span className="text-xs text-[#4f72ff] shrink-0">+{fmt(opt.precio)}</span>
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
      <div className="px-5 py-4 border-t border-[#2e3347] shrink-0 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-[#9ca3af]">Total</span>
          <span className="text-base font-bold text-[#e8eaf0]">{fmt(precioTotal)}</span>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 rounded-xl border border-[#2e3347] text-sm text-[#9ca3af] hover:border-[#4b5563] transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!isValid}
            className="flex-1 py-3 rounded-xl text-sm font-semibold text-white transition-colors disabled:opacity-40"
            style={{ background: isValid ? 'oklch(60% 0.18 260)' : '#374151' }}
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
    <section className="flex-1 flex flex-col overflow-hidden bg-[#0f1117]">
      {/* Category tabs */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[#2e3347] overflow-x-auto shrink-0">
        <button
          type="button"
          onClick={() => setActiveCatId(ALL_CAT_ID)}
          className={`shrink-0 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
            activeCatId === ALL_CAT_ID
              ? 'bg-[#4f72ff] text-white'
              : 'bg-[#1a1d27] text-[#6b7280] hover:text-white'
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
                ? 'bg-[#4f72ff] text-white'
                : 'bg-[#1a1d27] text-[#6b7280] hover:text-white'
            }`}
          >
            {cat.nombre ?? cat.id}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="px-4 py-3 border-b border-[#2e3347] shrink-0">
        <input
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="🔍 Buscar producto..."
          className="w-full bg-[#1a1d27] border border-[#2e3347] rounded-lg px-3 py-2 text-sm text-[#e8eaf0] placeholder:text-[#6b7280] focus:outline-none focus:border-[#4f72ff]"
        />
      </div>

      {/* Product grid */}
      <div className="flex-1 overflow-y-auto p-4 relative">
        {!mesaSeleccionada && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#0f1117]/80 backdrop-blur-[2px]">
            <div className="flex flex-col items-center gap-2 text-center px-6">
              <span className="text-3xl">🪑</span>
              <p className="text-sm font-semibold text-[#e8eaf0]">Selecciona una mesa</p>
              <p className="text-xs text-[#6b7280]">Elige una mesa en el panel izquierdo para añadir productos.</p>
            </div>
          </div>
        )}
        {activeProducts.length === 0 && (
          <p className="text-center text-sm text-[#6b7280] py-12">Sin productos</p>
        )}
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
          {activeProducts.map(p => (
            <button
              key={p.id}
              type="button"
              onClick={() => handleProductClick(p)}
              className="bg-[#1a1d27] border border-[#2e3347] rounded-xl overflow-hidden flex flex-col hover:border-[#4f72ff] hover:bg-[#22263a] transition-all text-left active:scale-95"
            >
              <div className="w-full aspect-square bg-[#0f1117] relative">
                {p.fotoUrl !== null ? (
                  <Image
                    src={p.fotoUrl}
                    alt={p.titulo_es}
                    fill
                    className="object-contain"
                    sizes="(max-width: 640px) 50vw, 20vw"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-2xl text-[#2e3347]">
                    +
                  </div>
                )}
              </div>
              <div className="p-2.5 flex flex-col gap-1">
                <p className="text-xs font-medium leading-tight line-clamp-2">{p.titulo_es}</p>
                <p className="text-base font-bold text-[#4f72ff]">
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
