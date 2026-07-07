'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { InventarioFisicoClient } from '@/components/admin/stock/InventarioFisicoClient';

interface Ingrediente {
  id: string;
  nombre: string;
  unidad: string;
  cantidadActual: number;
}

type ApiResponse = { id: string; nombre: string; unidad: string; cantidadActual: number }[];

export default function InventarioFisicoPage() {
  const [ingredientes, setIngredientes] = useState<Ingrediente[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchIngredientes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/stock/ingredientes');
      if (!res.ok) throw new Error('Error al cargar ingredientes');
      const json = await res.json() as ApiResponse;
      setIngredientes(
        json.map(i => ({
          id: i.id,
          nombre: i.nombre,
          unidad: i.unidad,
          cantidadActual: i.cantidadActual,
        }))
      );
    } catch {
      setError('No se pudieron cargar los ingredientes. Intenta recargar la página.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchIngredientes();
  }, [fetchIngredientes]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-[#6b7280]" />
      </div>
    );
  }

  if (error !== null) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <p className="text-sm text-[#ef4444] bg-[#ef444415] border border-[#ef444430] rounded-xl px-4 py-3">{error}</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Inventario Físico</h1>
        <p className="text-sm text-[#6b7280] mt-1">
          Conteo real de almacén. El sistema calculará la desviación respecto al teórico.
        </p>
      </div>
      <InventarioFisicoClient
        ingredientes={ingredientes}
        operadorNombre="Operador"
      />
    </div>
  );
}
