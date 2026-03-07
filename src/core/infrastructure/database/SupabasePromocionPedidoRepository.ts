import { SupabaseClient } from "@supabase/supabase-js";
import { Promocion, Pedido, CartItem, PedidoItem } from "@/core/domain/entities/types";
import { IPromocionRepository } from "@/core/domain/repositories/IPromocionRepository";
import { IPedidoRepository } from "@/core/domain/repositories/IPedidoRepository";

export class SupabasePromocionRepository implements IPromocionRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async findAllByTenant(empresaId: string): Promise<Promocion[]> {
    const { data, error } = await this.supabase
      .from('promociones')
      .select('*')
      .eq('empresa_id', empresaId)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) throw new Error(`DB Error: ${error.message}`);
    return data || [];
  }

  async create(data: { empresaId: string; texto_promocion: string; imagen_url?: string; numero_envios: number }): Promise<Promocion> {
    const { data: promo, error } = await this.supabase
      .from('promociones')
      .insert({
        empresa_id: data.empresaId,
        fecha_hora: new Date().toISOString(),
        texto_promocion: data.texto_promocion,
        imagen_url: data.imagen_url || null,
        numero_envios: data.numero_envios,
      })
      .select()
      .single();

    if (error) throw new Error(`DB Error: ${error.message}`);
    return promo;
  }

  async deleteAllByTenant(empresaId: string): Promise<void> {
    const { error } = await this.supabase
      .from('promociones')
      .delete()
      .eq('empresa_id', empresaId);

    if (error) throw new Error(`DB Error: ${error.message}`);
  }
}

export class SupabasePedidoRepository implements IPedidoRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async findAllByTenant(empresaId: string): Promise<Pedido[]> {
    const { data, error } = await this.supabase
      .from('pedidos')
      .select(`
        *,
        clientes:cliente_id (nombre, email, telefono)
      `)
      .eq('empresa_id', empresaId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(`DB Error: ${error.message}`);
    return data || [];
  }

  async updateStatus(id: string, empresaId: string, estado: string): Promise<void> {
    const { error } = await this.supabase
      .from('pedidos')
      .update({ estado })
      .eq('id', id)
      .eq('empresa_id', empresaId);

    if (error) throw new Error(`DB Error: ${error.message}`);
  }

  async delete(id: string, empresaId: string): Promise<void> {
    const { error } = await this.supabase
      .from('pedidos')
      .delete()
      .eq('id', id)
      .eq('empresa_id', empresaId);

    if (error) throw new Error(`DB Error: ${error.message}`);
  }

  async create(empresaId: string, clienteId: string | null, items: CartItem[], total: number): Promise<{ id: string; numero_pedido: number }> {
    const { data: lastOrder } = await this.supabase
      .from('pedidos')
      .select('numero_pedido')
      .eq('empresa_id', empresaId)
      .order('numero_pedido', { ascending: false })
      .limit(1)
      .single();

    const nuevoNumeroPedido = (lastOrder?.numero_pedido || 0) + 1;

    const { data: pedido, error } = await this.supabase
      .from('pedidos')
      .insert({
        empresa_id: empresaId,
        numero_pedido: nuevoNumeroPedido,
        cliente_id: clienteId,
        detalle_pedido: items.map(ci => ({
          producto_id: ci.item?.id,
          nombre: ci.item?.name,
          precio: ci.item?.price,
          cantidad: ci.quantity,
          complementos: ci.selectedComplements || [],
        })),
        total: total,
        estado: 'pendiente',
      })
      .select('id, numero_pedido')
      .single();

    if (error) throw new Error(`DB Error: ${error.message}`);
    return { id: pedido.id, numero_pedido: pedido.numero_pedido };
  }

  async getStats(empresaId: string, mes: number, año: number): Promise<{
    pedidosHoy: number;
    pedidosMes: number;
    totalHoy: number;
    totalMes: number;
    totalAno: number;
    topPlatos: { nombre: string; cantidad: number; total: number }[];
    topPlatosAno: { nombre: string; cantidad: number; total: number }[];
  }> {
    const now = new Date();
    const todayStart = new Date(año, mes, now.getDate()).toISOString();
    const monthStart = new Date(año, mes, 1).toISOString();
    const monthEnd = new Date(año, mes + 1, 0, 23, 59, 59).toISOString();
    const yearStart = new Date(año, 0, 1).toISOString();

    // Filter in SQL to avoid loading all historical data
    const { data: pedidos } = await this.supabase
      .from('pedidos')
      .select('*')
      .eq('empresa_id', empresaId)
      .gte('created_at', yearStart);

    const pedidosFiltrados = pedidos || [];

    const pedidosHoy = pedidosFiltrados.filter(p => {
      const fecha = new Date(p.created_at);
      return fecha >= new Date(todayStart) && fecha <= new Date(monthEnd);
    });
    const pedidosMes = pedidosFiltrados.filter(p => new Date(p.created_at) >= new Date(monthStart) && new Date(p.created_at) <= new Date(monthEnd));

    const totalHoy = pedidosHoy.reduce((sum, p) => sum + (p.total || 0), 0);
    const totalMes = pedidosMes.reduce((sum, p) => sum + (p.total || 0), 0);
    const totalAno = pedidosFiltrados.reduce((sum, p) => sum + (p.total || 0), 0);

    const buildTopPlatos = (pedidosList: typeof pedidosFiltrados) => {
      const dishCount: Record<string, { nombre: string; cantidad: number; total: number }> = {};
      pedidosList.forEach(pedido => {
        if (pedido.detalle_pedido) {
          pedido.detalle_pedido.forEach((item: PedidoItem) => {
            const key = String(item.nombre);
            if (!dishCount[key]) {
              dishCount[key] = { nombre: key, cantidad: 0, total: 0 };
            }
            dishCount[key].cantidad += Number(item.cantidad) || 1;
            dishCount[key].total += (Number(item.precio) * (Number(item.cantidad) || 1));
          });
        }
      });
      return Object.values(dishCount).sort((a, b) => b.cantidad - a.cantidad).slice(0, 10);
    };

    return {
      pedidosHoy: pedidosHoy.length,
      pedidosMes: pedidosMes.length,
      totalHoy,
      totalMes,
      totalAno,
      topPlatos: buildTopPlatos(pedidosMes),
      topPlatosAno: buildTopPlatos(pedidosFiltrados),
    };
  }
}
