'use client';

import { useState } from 'react';
import Image from 'next/image';
import type { Product, Category } from '@/core/domain/entities/types';
import type { PendingItem } from '@/hooks/tpv/useMesaActiva';

type AddItemPayload = Omit<PendingItem, 'cantidad'>;

interface Props {
  readonly products: Product[];
  readonly categories: Category[];
  readonly onAddItem: (item: AddItemPayload) => void;
  readonly mesaSeleccionada: boolean;
}

interface ComplementDialogState {
  product: Product;
  options: Product[];
  required: boolean;
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

interface ComplementDialogProps {
  state: ComplementDialogState;
  onConfirm: (complementos: string[]) => void;
  onClose: () => void;
}

function ComplementDialog({ state, onConfirm, onClose }: Readonly<ComplementDialogProps>) {
  const [selected, setSelected] = useState<string | null>(null);
  const canConfirm = !state.required || selected !== null;

  function handleConfirm() {
    if (!canConfirm) return;
    onConfirm(selected !== null ? [selected] : []);
  }

  function fmt(euros: number): string {
    return euros.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <button
        type="button"
        className="absolute inset-0 bg-black/60"
        aria-label="Cerrar"
        onClick={onClose}
      />
      <div className="relative bg-[#1a1d27] border border-[#2e3347] rounded-2xl p-5 w-80 flex flex-col gap-4 shadow-2xl">
        <div>
          <p className="text-[10px] font-bold text-[#6b7280] uppercase tracking-wider mb-0.5">Complementos</p>
          <p className="text-base font-bold text-[#e8eaf0]">{state.product.titulo_es}</p>
          {state.required && (
            <p className="text-[11px] text-[#f59e0b] mt-0.5">Selección obligatoria</p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          {state.options.map(opt => {
            const isSelected = selected === opt.titulo_es;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setSelected(isSelected ? null : opt.titulo_es)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all text-left"
                style={{
                  background: isSelected ? 'oklch(28% 0.10 260 / 0.5)' : 'oklch(20% 0.03 252 / 0.5)',
                  borderColor: isSelected ? 'oklch(60% 0.18 260)' : 'oklch(35% 0.04 252)',
                }}
              >
                <span
                  className="w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center"
                  style={{ borderColor: isSelected ? 'oklch(60% 0.18 260)' : '#4b5563' }}
                >
                  {isSelected && (
                    <span className="w-2 h-2 rounded-full bg-[#4f72ff]" />
                  )}
                </span>
                <span className="flex-1 text-sm text-[#c8cad4] font-medium">{opt.titulo_es}</span>
                {opt.precio > 0 && (
                  <span className="text-xs text-[#4f72ff] shrink-0">+{fmt(opt.precio)}</span>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-[#2e3347] text-sm text-[#6b7280] hover:text-white transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="flex-1 py-2.5 rounded-xl bg-[#4f72ff] text-white text-sm font-bold hover:brightness-110 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Añadir
          </button>
        </div>
      </div>
    </div>
  );
}

export function MenuPanel({ products, categories, onAddItem, mesaSeleccionada }: Props) {
  const [activeCatId, setActiveCatId] = useState<string>(ALL_CAT_ID);
  const [search, setSearch] = useState('');
  const [complementDialog, setComplementDialog] = useState<ComplementDialogState | null>(null);

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

  function handleAdd(p: Product) {
    const options = p.categoriaId ? (complementsByCatId.get(p.categoriaId) ?? []) : [];
    if (options.length > 0) {
      setComplementDialog({
        product: p,
        options,
        required: p.categoriaId ? (requiredByCatId.get(p.categoriaId) ?? false) : false,
      });
    } else {
      onAddItem({ productId: p.id, nombre: p.titulo_es, precio: p.precio, complementos: [] });
    }
  }

  function handleComplementConfirm(complementos: string[]) {
    if (!complementDialog) return;
    const p = complementDialog.product;
    onAddItem({ productId: p.id, nombre: p.titulo_es, precio: p.precio, complementos });
    setComplementDialog(null);
  }

  return (
    <>
    {complementDialog !== null && (
      <ComplementDialog
        state={complementDialog}
        onConfirm={handleComplementConfirm}
        onClose={() => setComplementDialog(null)}
      />
    )}
    <section className="flex-1 flex flex-col overflow-hidden bg-[#0f1117]">
      {/* Category tabs */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[#2e3347] overflow-x-auto shrink-0">
        <button
          type="button"
          onClick={() => setActiveCatId(ALL_CAT_ID)}
          className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
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
            className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
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
          placeholder="Buscar producto..."
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
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {activeProducts.map(p => (
            <button
              key={p.id}
              type="button"
              onClick={() => handleAdd(p)}
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
                <p className="text-sm font-bold text-[#4f72ff]">
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
