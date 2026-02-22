'use client';

import { useState, useEffect, Fragment } from 'react';
// Removed unused import 'useAdmin'
import { Search, ChevronDown, ChevronUp, Check, Clock, Trash2 } from 'lucide-react';

interface Cliente {
  nombre: string | null;
  email: string | null;
  telefono: string | null;
}

interface Pedido {
  id: string;
  numero_pedido: number;
  cliente_id: string | null;
  clientes: Cliente | null;
  total: number;
  moneda: string;
  detalle_pedido: any[];
  estado: string;
  created_at: string;
}

export default function PedidosPage() {
  // Removed unused empresaId assignment
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<keyof Pedido>('created_at');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [expandedPedido, setExpandedPedido] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ show: boolean; id: string | null; numero: number | null }>({ show: false, id: null, numero: null });

  useEffect(() => {
    async function fetchPedidos() {
      try {
        const res = await fetch('/api/admin/pedidos');
        if (res.ok) {
          const data = await res.json();
          setPedidos(data.pedidos || []);
        }
      } catch (error) {
        console.error('Error fetching pedidos:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchPedidos();
  }, []);

  const filteredPedidos = pedidos
    .filter(p => 
      p.numero_pedido.toString().includes(searchTerm) ||
      p.clientes?.nombre?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.clientes?.telefono?.includes(searchTerm) ||
      p.clientes?.email?.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

  const handleSort = (field: keyof Pedido) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const getEstadoBadge = (estado: string, pedidoId: string) => {
    const isListo = estado === 'listo';
    return (
      <button
        onClick={(e) => { e.stopPropagation(); updateEstado(pedidoId, isListo ? 'pendiente' : 'listo'); }}
        className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
          isListo 
            ? 'bg-green-100 text-green-800 hover:bg-green-200' 
            : 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200'
        }`}
      >
        {isListo ? <Check className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
        {isListo ? 'Listo' : 'Pendiente'}
      </button>
    );
  };

  const toggleExpand = (id: string) => {
    setExpandedPedido(expandedPedido === id ? null : id);
  };

  const updateEstado = async (id: string, nuevoEstado: string) => {
    try {
      const res = await fetch('/api/admin/pedidos', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, estado: nuevoEstado }),
      });
      if (res.ok) {
        setPedidos(pedidos.map(p => p.id === id ? { ...p, estado: nuevoEstado } : p));
      }
    } catch (error) {
      console.error('Error updating estado:', error);
    }
  };

  const deletePedido = async (id: string) => {
    const orderNum = pedidos.find(p => p.id === id)?.numero_pedido ?? null;
    setDeleteConfirm({ show: true, id, numero: orderNum });
  };

  const confirmDelete = async () => {
    if (!deleteConfirm.id) return;
    try {
      const res = await fetch('/api/admin/pedidos', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: deleteConfirm.id }),
      });
      if (res.ok) {
        setPedidos(pedidos.filter(p => p.id !== deleteConfirm.id));
      }
    } catch (error) {
      console.error('Error deleting pedido:', error);
    } finally {
      setDeleteConfirm({ show: false, id: null, numero: null });
    }
  };

  if (loading) {
    return (
      <div className="pt-20 lg:pt-0 px-6 lg:px-8 flex items-center justify-center min-h-[50vh]">
        <div className="text-gray-500">Cargando...</div>
      </div>
    );
  }

  return (
    <div className="pt-20 lg:pt-0 px-6 lg:px-8">
      <h1 className="text-2xl font-serif font-bold text-gray-900 dark:text-white mb-2">
        Pedidos
      </h1>
      <p className="text-gray-600 dark:text-gray-400 mb-6">
        Gestiona los pedidos de tus clientes
      </p>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border dark:border-gray-700">
        <div className="p-4 border-b dark:border-gray-700">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por número, cliente o teléfono..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  <button onClick={() => handleSort('numero_pedido')} className="flex items-center gap-1">
                    #
                    {sortField === 'numero_pedido' && (sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                  </button>
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Cliente
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Teléfono
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  <button onClick={() => handleSort('total')} className="flex items-center gap-1">
                    Total
                    {sortField === 'total' && (sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                  </button>
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  <button onClick={() => handleSort('estado')} className="flex items-center gap-1">
                    Estado
                    {sortField === 'estado' && (sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                  </button>
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  <button onClick={() => handleSort('created_at')} className="flex items-center gap-1">
                    Fecha
                    {sortField === 'created_at' && (sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                  </button>
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {filteredPedidos.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                    No hay pedidos
                  </td>
                </tr>
              ) : (
                filteredPedidos.map((pedido) => (
                  <Fragment key={pedido.id}>
                    <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-3 whitespace-nowrap font-medium text-gray-900 dark:text-white" onClick={() => toggleExpand(pedido.id)}>
                        #{pedido.numero_pedido}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-600 dark:text-gray-300" onClick={() => toggleExpand(pedido.id)}>
                        {pedido.clientes?.nombre || '-'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-600 dark:text-gray-300" onClick={() => toggleExpand(pedido.id)}>
                        {pedido.clientes?.telefono || '-'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap font-medium text-gray-900 dark:text-white" onClick={() => toggleExpand(pedido.id)}>
                        {pedido.total.toFixed(2)} {pedido.moneda || '€'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {getEstadoBadge(pedido.estado, pedido.id)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-500 dark:text-gray-400 text-sm">
                        {new Date(pedido.created_at).toLocaleDateString('es-ES', { 
                          day: '2-digit', month: '2-digit', year: 'numeric',
                          hour: '2-digit', minute: '2-digit'
                        })}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <button
                          onClick={(e) => { e.stopPropagation(); deletePedido(pedido.id); }}
                          className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                          title="Eliminar pedido"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                    {expandedPedido === pedido.id && (
                      <tr>
                        <td colSpan={7} className="px-4 py-4 bg-gray-50 dark:bg-gray-700/30">
                          <div className="max-w-2xl">
                            <h4 className="font-medium mb-2 dark:text-white">Detalles del pedido:</h4>
                            <ul className="space-y-2 text-sm dark:text-gray-300">
                              {pedido.detalle_pedido?.map((item: any) => {
                                const complementoTotal = item.complementos?.reduce((sum: number, comp: any) => sum + (comp.precio || comp.price || 0), 0) || 0;
                                const itemTotal = (item.precio * item.cantidad) + (complementoTotal * item.cantidad);
                                return (
                                  <li key={item.nombre + '-' + item.cantidad} className="flex flex-col">
                                    <div className="flex justify-between">
                                      <span>{item.cantidad}x {item.nombre}</span>
                                      <span className="font-medium">{itemTotal.toFixed(2)}€</span>
                                    </div>
                                    {item.complementos && item.complementos.length > 0 && (
                                      <ul className="ml-4 mt-1 text-xs text-gray-500">
                                        {item.complementos.map((comp: any) => (
                                          <li key={comp.nombre || comp.name}>+ {comp.nombre || comp.name} ({(comp.precio || comp.price || 0).toFixed(2)}€)</li>
                                        ))}
                                      </ul>
                                    )}
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {deleteConfirm.show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-sm mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-full">
                <Trash2 className="w-5 h-5 text-red-600 dark:text-red-400" />
              </div>
              <h3 className="text-lg font-semibold dark:text-white">Eliminar pedido</h3>
            </div>
            <p className="text-gray-600 dark:text-gray-300 mb-6">
              ¿Estás seguro de que quieres eliminar el pedido <strong>#{deleteConfirm.numero}</strong>? Esta acción no se puede deshacer.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteConfirm({ show: false, id: null, numero: null })}
                className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              >
                Cancelar
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 bg-red-600 text-white hover:bg-red-700 rounded-lg"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
