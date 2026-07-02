'use client';

import { useState } from 'react';
import Image from 'next/image';
import type { Product, Category } from '@/core/domain/entities/types';
import type { PedidoItem } from '@/core/domain/entities/types';

type TicketItem = Pick<PedidoItem, 'nombre' | 'precio' | 'cantidad'>;

interface Props {
  readonly products: Product[];
  readonly categories: Category[];
  readonly onAddItem: (item: TicketItem) => void;
}

const ALL_CAT_ID = '__all__';

function matchesSearch(product: Product, query: string): boolean {
  if (query === '') return true;
  return product.titulo_es.toLowerCase().includes(query.toLowerCase());
}

export function MenuPanel({ products, categories, onAddItem }: Props) {
  const [activeCatId, setActiveCatId] = useState<string>(ALL_CAT_ID);
  const [search, setSearch] = useState('');

  const activeProducts = products.filter(p => {
    if (!p.activo) return false;
    if (activeCatId !== ALL_CAT_ID && p.categoriaId !== activeCatId) return false;
    return matchesSearch(p, search);
  });

  function handleAdd(p: Product) {
    onAddItem({ nombre: p.titulo_es, precio: p.precio, cantidad: 1 });
  }

  return (
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
        {categories.map(cat => (
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
      <div className="flex-1 overflow-y-auto p-4">
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
  );
}
