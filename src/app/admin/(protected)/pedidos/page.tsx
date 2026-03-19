'use client';

import { useState, useEffect, useCallback, useMemo, Fragment } from 'react';
import { Search, ChevronDown, ChevronUp, Check, Clock, Trash2, ShoppingCart, Calendar } from 'lucide-react';
import { Input } from '@/components/ui/input';
import type { PedidoItem, PedidoComplemento } from '@/core/domain/entities/types';
import { PEDIDO_ESTADOS, PEDIDO_ESTADO_LABELS, PEDIDO_ESTADO_COLORS, type PedidoEstado } from '@/core/domain/constants/pedido';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { fetchWithCsrf } from '@/lib/csrf-client';

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
  detalle_pedido: PedidoItem[];
  estado: string;
  created_at: string;
}

export default function PedidosPage() {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<keyof Pedido>('created_at');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [expandedPedido, setExpandedPedido] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ show: boolean; id: string | null; numero: number | null }>({ show: false, id: null, numero: null });

  useEffect(() => {
    const controller = new AbortController();
    async function fetchPedidos() {
      try {
        const res = await fetch('/api/admin/pedidos', { signal: controller.signal });
        if (res.ok) {
          const data = await res.json();
          setPedidos(data.pedidos || []);
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        console.error('Error fetching pedidos:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchPedidos();
    return () => controller.abort();
  }, []);

  const filteredPedidos = useMemo(() => pedidos
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
    }), [pedidos, searchTerm, sortField, sortDirection]);

  const handleSort = useCallback((field: keyof Pedido) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  }, [sortField, sortDirection]);

  const getEstadoBadge = (estado: string, pedidoId: string) => {
    const estadoIndex = PEDIDO_ESTADOS.indexOf(estado as PedidoEstado);
    const isPendiente = estadoIndex <= 0;
    const siguienteEstado = isPendiente ? 'aceptado' : 'pendiente';

    return (
      <button
        onClick={(e) => { e.stopPropagation(); updateEstado(pedidoId, siguienteEstado); }}
        className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
          PEDIDO_ESTADO_COLORS[estado as PedidoEstado] || 'bg-muted text-foreground hover:bg-muted/80'
        }`}
      >
        {estado === 'pendiente' || estado === 'cancelado' ? <Clock className="w-3 h-3" /> : <Check className="w-3 h-3" />}
        {PEDIDO_ESTADO_LABELS[estado as PedidoEstado] || estado}
      </button>
    );
  };

  const toggleExpand = (id: string) => {
    setExpandedPedido(expandedPedido === id ? null : id);
  };

  const updateEstado = useCallback(async (id: string, nuevoEstado: string) => {
    try {
      const res = await fetchWithCsrf('/api/admin/pedidos', {
        method: 'PATCH',
        body: JSON.stringify({ id, estado: nuevoEstado }),
      });
      if (res.ok) {
        setPedidos(prev => prev.map(p => p.id === id ? { ...p, estado: nuevoEstado } : p));
      }
    } catch (error) {
      console.error('Error updating estado:', error);
    }
  }, []);

  const deletePedido = useCallback((id: string, orderNum: number | null) => {
    setDeleteConfirm({ show: true, id, numero: orderNum });
  }, []);

  const confirmDelete = async () => {
    if (!deleteConfirm.id) return;
    try {
      const res = await fetchWithCsrf('/api/admin/pedidos', {
        method: 'DELETE',
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

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(amount);
  };

  const stats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    
    const pedidosHoy = pedidos.filter(p => new Date(p.created_at) >= today);
    const pedidosMes = pedidos.filter(p => new Date(p.created_at) >= monthStart);
    
    return {
      pedidosHoy: pedidosHoy.length,
      totalHoy: pedidosHoy.reduce((sum, p) => sum + p.total, 0),
      pedidosMes: pedidosMes.length,
      totalMes: pedidosMes.reduce((sum, p) => sum + p.total, 0),
    };
  }, [pedidos]);

  if (loading) {
    return (
      <div className="pt-16 lg:pt-0 px-6 lg:px-8 flex items-center justify-center min-h-[50vh]">
        <div className="text-muted-foreground">Cargando...</div>
      </div>
    );
  }

  return (
    <div className="pt-16 lg:pt-0 px-6 py-6 space-y-6">
      {/* Header con stats */}
      <div className="bg-primary rounded-lg p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold text-primary-foreground">Pedidos</h1>
            <p className="text-primary-foreground/80 text-sm mt-1">Gestiona los pedidos de tus clientes</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            <div className="bg-primary-foreground/20 rounded-lg px-3 sm:px-4 py-2 sm:py-3 text-center">
              <ShoppingCart className="w-4 h-4 sm:w-5 sm:h-5 text-primary-foreground mx-auto mb-1" />
              <span className="text-lg sm:text-2xl font-semibold text-primary-foreground">{stats.pedidosHoy}</span>
              <p className="text-primary-foreground/80 text-[10px] sm:text-xs">Hoy</p>
            </div>
            <div className="bg-primary-foreground/20 rounded-lg px-3 sm:px-4 py-2 sm:py-3 text-center">
              <span className="text-lg sm:text-2xl font-semibold text-primary-foreground">{formatCurrency(stats.totalHoy)}</span>
              <p className="text-primary-foreground/80 text-[10px] sm:text-xs">Ventas hoy</p>
            </div>
            <div className="bg-primary-foreground/20 rounded-lg px-3 sm:px-4 py-2 sm:py-3 text-center">
              <Calendar className="w-4 h-4 sm:w-5 sm:h-5 text-primary-foreground mx-auto mb-1" />
              <span className="text-lg sm:text-2xl font-semibold text-primary-foreground">{stats.pedidosMes}</span>
              <p className="text-primary-foreground/80 text-[10px] sm:text-xs">Este mes</p>
            </div>
            <div className="bg-primary-foreground/20 rounded-lg px-3 sm:px-4 py-2 sm:py-3 text-center">
              <span className="text-lg sm:text-2xl font-semibold text-primary-foreground">{formatCurrency(stats.totalMes)}</span>
              <p className="text-primary-foreground/80 text-[10px] sm:text-xs">Ventas mes</p>
            </div>
          </div>
        </div>
      </div>

      {/* Buscador */}
      <div className="bg-card rounded-lg shadow-elegant border border-border">
        <div className="p-4 border-b border-border">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Buscar por número, cliente o teléfono..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              aria-label="Buscar pedidos"
              className="pl-10"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted">
              <tr>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider" aria-sort={sortField === 'numero_pedido' ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}>
                  <button 
                    onClick={() => handleSort('numero_pedido')} 
                    className="flex items-center gap-1"
                  >
                    #
                    {sortField === 'numero_pedido' && (sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                  </button>
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Cliente
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Teléfono
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider" aria-sort={sortField === 'total' ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}>
                  <button 
                    onClick={() => handleSort('total')} 
                    className="flex items-center gap-1"
                  >
                    Total
                    {sortField === 'total' && (sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                  </button>
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider" aria-sort={sortField === 'estado' ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}>
                  <button 
                    onClick={() => handleSort('estado')} 
                    className="flex items-center gap-1"
                  >
                    Estado
                    {sortField === 'estado' && (sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                  </button>
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider" aria-sort={sortField === 'created_at' ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}>
                  <button 
                    onClick={() => handleSort('created_at')} 
                    className="flex items-center gap-1"
                  >
                    Fecha
                    {sortField === 'created_at' && (sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                  </button>
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredPedidos.length === 0 ? (
                <tr>
                  <td colSpan={7} aria-live="polite" className="px-4 py-8 text-center text-muted-foreground">
                    {searchTerm ? 'No se encontraron pedidos con ese criterio.' : 'No hay pedidos.'}
                  </td>
                </tr>
              ) : (
                filteredPedidos.map((pedido) => (
                  <Fragment key={pedido.id}>
                    <tr
                      className="hover:bg-muted/50 cursor-pointer"
                      role="button"
                      tabIndex={0}
                      aria-expanded={expandedPedido === pedido.id}
                      onClick={() => toggleExpand(pedido.id)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleExpand(pedido.id); } }}
                    >
                      <td className="px-4 py-3 whitespace-nowrap font-medium text-foreground">
                        #{pedido.numero_pedido}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                        {pedido.clientes?.nombre || '-'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                        {pedido.clientes?.telefono || '-'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap font-medium text-foreground">
                        {pedido.total.toFixed(2)} {pedido.moneda || '€'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {getEstadoBadge(pedido.estado, pedido.id)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-muted-foreground text-sm">
                        {new Date(pedido.created_at).toLocaleDateString('es-ES', { 
                          day: '2-digit', month: '2-digit', year: 'numeric',
                          hour: '2-digit', minute: '2-digit'
                        })}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <button
                          onClick={(e) => { e.stopPropagation(); deletePedido(pedido.id, pedido.numero_pedido); }}
                          className="p-2.5 text-destructive hover:bg-destructive/10 rounded"
                          aria-label="Eliminar pedido"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                    {expandedPedido === pedido.id && (
                      <tr>
                        <td colSpan={7} className="px-4 py-4 bg-muted/30">
                          <div className="max-w-2xl">
                            <h4 className="font-medium mb-2 text-foreground">Detalles del pedido:</h4>
                            <ul className="space-y-2 text-sm text-foreground">
                              {pedido.detalle_pedido?.map((item: PedidoItem) => {
                                const complementoTotal = item.complementos?.reduce((sum: number, comp: PedidoComplemento) => sum + (comp.precio || comp.price || 0), 0) || 0;
                                const itemTotal = (item.precio * item.cantidad) + (complementoTotal * item.cantidad);
                                return (
                                  <li key={item.nombre + '-' + item.cantidad} className="flex flex-col">
                                    <div className="flex justify-between">
                                      <span>{item.cantidad}x {item.nombre}</span>
                                      <span className="font-medium">{itemTotal.toFixed(2)}€</span>
                                    </div>
                                    {item.complementos && item.complementos.length > 0 && (
                                      <ul className="ml-4 mt-1 text-xs text-muted-foreground">
                                        {item.complementos.map((comp: PedidoComplemento) => (
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

      <Dialog open={deleteConfirm.show} onOpenChange={(open) => { if (!open) setDeleteConfirm({ show: false, id: null, numero: null }); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className="p-2 bg-destructive/10 rounded-full">
                <Trash2 className="w-5 h-5 text-destructive" />
              </div>
              Eliminar pedido
            </DialogTitle>
            <DialogDescription>
              ¿Estás seguro de que quieres eliminar el pedido <strong>#{deleteConfirm.numero}</strong>? Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 justify-end">
            <button
              onClick={() => setDeleteConfirm({ show: false, id: null, numero: null })}
              className="px-4 py-2 text-muted-foreground hover:bg-muted rounded-lg"
            >
              Cancelar
            </button>
            <button
              onClick={confirmDelete}
              className="px-4 py-2 bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-lg"
            >
              Eliminar
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
