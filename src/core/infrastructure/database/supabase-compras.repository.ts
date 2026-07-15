import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';
import type { IComprasRepository, PedidoCompraFilters, AlbaranFilters, FacturaFilters } from '@/core/domain/repositories/IComprasRepository';
import type {
  Proveedor, CreateProveedorDTO, UpdateProveedorDTO,
  CatalogoCompraItem, CreateCatalogoItemDTO, UpdateCatalogoItemDTO,
  PedidoCompra, PedidoCompraItem, CreatePedidoCompraDTO, AddItemToPedidoDTO,
  AlbaranCompra, AlbaranCompraItem, CreateAlbaranDTO, AddItemToAlbaranDTO,
  FacturaProveedor, CreateFacturaProveedorDTO, RegistrarPagoDTO,
  PorcentajeIva, PedidoCompraEstado,
} from '@/core/domain/entities/compras-types';
import type { Result } from '@/core/domain/entities/types';
import { logger } from '../logging/logger';

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

function mapProveedor(row: Record<string, unknown>): Proveedor {
  return {
    id: row.id as string,
    empresaId: row.empresa_id as string,
    nombre: row.nombre as string,
    cif: (row.cif as string) ?? null,
    email: (row.email as string) ?? null,
    telefono: (row.telefono as string) ?? null,
    condicionesPago: (row.condiciones_pago as string) ?? null,
    direccionFiscal: (row.direccion_fiscal as string) ?? null,
    observaciones: (row.observaciones as string) ?? null,
    activo: row.activo as boolean,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function mapCatalogoItem(row: Record<string, unknown>): CatalogoCompraItem {
  const ingredientes = row.ingredientes as Record<string, unknown> | null | undefined;
  return {
    id: row.id as string,
    empresaId: row.empresa_id as string,
    proveedorId: row.proveedor_id as string,
    ingredienteId: row.ingrediente_id as string,
    referenciaProveedor: (row.referencia_proveedor as string) ?? null,
    descripcion: (row.descripcion as string) ?? null,
    precioCompraCents: row.precio_compra_cents as number,
    unidadCompra: row.unidad_compra as string,
    factorConversion: row.factor_conversion as number,
    porcentajeIva: row.porcentaje_iva as PorcentajeIva,
    activo: row.activo as boolean,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    ingredienteNombre: ingredientes?.nombre as string | undefined,
    esPerecedero: ingredientes?.es_perecedero as boolean | undefined,
  };
}

function mapPedidoItem(row: Record<string, unknown>): PedidoCompraItem {
  const catalogo = row.catalogo_compra as Record<string, unknown> | null | undefined;
  const ingredientes = catalogo?.ingredientes as Record<string, unknown> | null | undefined;
  return {
    id: row.id as string,
    pedidoCompraId: row.pedido_compra_id as string,
    catalogoCompraId: row.catalogo_compra_id as string,
    cantidad: row.cantidad as number,
    precioCompraCents: row.precio_compra_cents as number,
    porcentajeIva: row.porcentaje_iva as PorcentajeIva,
    createdAt: row.created_at as string,
    ingredienteNombre: ingredientes?.nombre as string | undefined,
    unidadCompra: catalogo?.unidad_compra as string | undefined,
  };
}

function mapPedido(row: Record<string, unknown>): PedidoCompra {
  const proveedores = row.proveedores as Record<string, unknown> | null | undefined;
  const rawItems = row.pedidos_compra_items as Record<string, unknown>[] | null | undefined;
  return {
    id: row.id as string,
    empresaId: row.empresa_id as string,
    proveedorId: row.proveedor_id as string,
    numeroPedido: row.numero_pedido as string,
    estado: row.estado as PedidoCompra['estado'],
    notas: (row.notas as string) ?? null,
    fechaPedido: row.fecha_pedido as string,
    fechaEntregaEstimada: (row.fecha_entrega_estimada as string) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    proveedorNombre: proveedores?.nombre as string | undefined,
    items: rawItems ? rawItems.map(mapPedidoItem) : undefined,
  };
}

function mapAlbaranItem(row: Record<string, unknown>): AlbaranCompraItem {
  const catalogo = row.catalogo_compra as Record<string, unknown> | null | undefined;
  const ingredientes = catalogo?.ingredientes as Record<string, unknown> | null | undefined;
  return {
    id: row.id as string,
    albaranCompraId: row.albaran_compra_id as string,
    catalogoCompraId: row.catalogo_compra_id as string,
    cantidadRecibida: row.cantidad_recibida as number,
    precioCompraCents: row.precio_compra_cents as number,
    porcentajeIva: row.porcentaje_iva as PorcentajeIva,
    numeroLote: (row.numero_lote as string) ?? null,
    fechaCaducidad: (row.fecha_caducidad as string) ?? null,
    movimientoStockId: (row.movimiento_stock_id as string) ?? null,
    createdAt: row.created_at as string,
    ingredienteNombre: ingredientes?.nombre as string | undefined,
    esPerecedero: ingredientes?.es_perecedero as boolean | undefined,
    unidadCompra: catalogo?.unidad_compra as string | undefined,
  };
}

function mapAlbaran(row: Record<string, unknown>): AlbaranCompra {
  const proveedores = row.proveedores as Record<string, unknown> | null | undefined;
  const rawItems = row.albaranes_compra_items as Record<string, unknown>[] | null | undefined;
  return {
    id: row.id as string,
    empresaId: row.empresa_id as string,
    proveedorId: row.proveedor_id as string,
    pedidoCompraId: (row.pedido_compra_id as string) ?? null,
    numeroAlbaran: row.numero_albaran as string,
    estado: row.estado as AlbaranCompra['estado'],
    fechaRecepcion: (row.fecha_recepcion as string) ?? null,
    notas: (row.notas as string) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    proveedorNombre: proveedores?.nombre as string | undefined,
    items: rawItems ? rawItems.map(mapAlbaranItem) : undefined,
  };
}

function mapFactura(row: Record<string, unknown>): FacturaProveedor {
  const proveedores = row.proveedores as Record<string, unknown> | null | undefined;
  const junctionRows = row.facturas_proveedor_albaranes as Record<string, unknown>[] | null | undefined;
  const albaranes = junctionRows
    ? junctionRows.map((j) => {
        const a = j.albaranes_compra as Record<string, unknown> | null | undefined;
        return a ? mapAlbaran(a) : null;
      }).filter((a): a is AlbaranCompra => a !== null)
    : undefined;

  return {
    id: row.id as string,
    empresaId: row.empresa_id as string,
    proveedorId: row.proveedor_id as string,
    numeroFactura: row.numero_factura as string,
    fechaFactura: row.fecha_factura as string,
    baseImponible0Cents: row.base_imponible_0_cents as number,
    baseImponible3Cents: (row.base_imponible_3_cents as number) ?? 0,
    baseImponible4Cents: row.base_imponible_4_cents as number,
    baseImponible7Cents: (row.base_imponible_7_cents as number) ?? 0,
    baseImponible10Cents: row.base_imponible_10_cents as number,
    baseImponible15Cents: (row.base_imponible_15_cents as number) ?? 0,
    baseImponible21Cents: row.base_imponible_21_cents as number,
    baseImponible95Cents: (row.base_imponible_95_cents as number) ?? 0,
    ivaSoportadoCents: row.iva_soportado_cents as number,
    totalFacturaCents: row.total_factura_cents as number,
    estadoPago: row.estado_pago as FacturaProveedor['estadoPago'],
    notas: (row.notas as string) ?? null,
    turnoId: (row.turno_id as string) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    proveedorNombre: proveedores?.nombre as string | undefined,
    albaranes,
  };
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export class SupabaseComprasRepository implements IComprasRepository {
  // ---- Proveedores ----

  async findProveedores(empresaId: string): Promise<Result<Proveedor[]>> {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('proveedores')
        .select('*')
        .eq('empresa_id', empresaId)
        .eq('activo', true)
        .order('nombre');

      if (error) {
        return { success: false, error: await logger.logFromCatch(error, 'repository', 'findProveedores') };
      }
      return { success: true, data: (data as Record<string, unknown>[]).map(mapProveedor) };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'repository', 'findProveedores') };
    }
  }

  async findProveedorById(empresaId: string, id: string): Promise<Result<Proveedor>> {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('proveedores')
        .select('*')
        .eq('empresa_id', empresaId)
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return {
            success: false,
            error: { code: 'COMPRAS_PROVEEDOR_NOT_FOUND', message: 'Proveedor no encontrado', module: 'repository' },
          };
        }
        return { success: false, error: await logger.logFromCatch(error, 'repository', 'findProveedorById') };
      }
      return { success: true, data: mapProveedor(data as Record<string, unknown>) };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'repository', 'findProveedorById') };
    }
  }

  async createProveedor(empresaId: string, data: CreateProveedorDTO): Promise<Result<Proveedor>> {
    try {
      const supabase = getSupabaseClient();
      const { data: row, error } = await supabase
        .from('proveedores')
        .insert({
          empresa_id: empresaId,
          nombre: data.nombre,
          cif: data.cif ?? null,
          email: data.email ?? null,
          telefono: data.telefono ?? null,
          condiciones_pago: data.condicionesPago ?? null,
          direccion_fiscal: data.direccionFiscal ?? null,
          observaciones: data.observaciones ?? null,
        })
        .select()
        .single();

      if (error) {
        return { success: false, error: await logger.logFromCatch(error, 'repository', 'createProveedor') };
      }
      return { success: true, data: mapProveedor(row as Record<string, unknown>) };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'repository', 'createProveedor') };
    }
  }

  async updateProveedor(empresaId: string, id: string, data: UpdateProveedorDTO): Promise<Result<Proveedor>> {
    try {
      const supabase = getSupabaseClient();
      const patch: Record<string, unknown> = {};
      if (data.nombre !== undefined) patch.nombre = data.nombre;
      if (data.cif !== undefined) patch.cif = data.cif;
      if (data.email !== undefined) patch.email = data.email;
      if (data.telefono !== undefined) patch.telefono = data.telefono;
      if (data.condicionesPago !== undefined) patch.condiciones_pago = data.condicionesPago;
      if (data.direccionFiscal !== undefined) patch.direccion_fiscal = data.direccionFiscal;
      if (data.observaciones !== undefined) patch.observaciones = data.observaciones;
      if (data.activo !== undefined) patch.activo = data.activo;
      patch.updated_at = new Date().toISOString();

      const { data: row, error } = await supabase
        .from('proveedores')
        .update(patch)
        .eq('id', id)
        .eq('empresa_id', empresaId)
        .select()
        .single();

      if (error) {
        return { success: false, error: await logger.logFromCatch(error, 'repository', 'updateProveedor') };
      }
      return { success: true, data: mapProveedor(row as Record<string, unknown>) };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'repository', 'updateProveedor') };
    }
  }

  async softDeleteProveedor(empresaId: string, id: string): Promise<Result<void>> {
    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase
        .from('proveedores')
        .update({ activo: false, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('empresa_id', empresaId);

      if (error) {
        return { success: false, error: await logger.logFromCatch(error, 'repository', 'softDeleteProveedor') };
      }
      return { success: true, data: undefined };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'repository', 'softDeleteProveedor') };
    }
  }

  async hasActiveTransactions(empresaId: string, proveedorId: string): Promise<Result<boolean>> {
    try {
      const supabase = getSupabaseClient();

      const { count: pedidoCount, error: pedidoError } = await supabase
        .from('pedidos_compra')
        .select('id', { count: 'exact', head: true })
        .eq('empresa_id', empresaId)
        .eq('proveedor_id', proveedorId)
        .not('estado', 'in', '(cancelado,recibido)');

      if (pedidoError) {
        return { success: false, error: await logger.logFromCatch(pedidoError, 'repository', 'hasActiveTransactions') };
      }
      if ((pedidoCount ?? 0) > 0) {
        return { success: true, data: true };
      }

      const { count: albaranCount, error: albaranError } = await supabase
        .from('albaranes_compra')
        .select('id', { count: 'exact', head: true })
        .eq('empresa_id', empresaId)
        .eq('proveedor_id', proveedorId)
        .not('estado', 'in', '(recibido)');

      if (albaranError) {
        return { success: false, error: await logger.logFromCatch(albaranError, 'repository', 'hasActiveTransactions') };
      }

      return { success: true, data: (albaranCount ?? 0) > 0 };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'repository', 'hasActiveTransactions') };
    }
  }

  // ---- Catalogo ----

  async findCatalogoByProveedor(empresaId: string, proveedorId: string): Promise<Result<CatalogoCompraItem[]>> {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('catalogo_compra')
        .select('*, ingredientes(nombre, es_perecedero)')
        .eq('empresa_id', empresaId)
        .eq('proveedor_id', proveedorId)
        .eq('activo', true);

      if (error) {
        return { success: false, error: await logger.logFromCatch(error, 'repository', 'findCatalogoByProveedor') };
      }
      return { success: true, data: (data as Record<string, unknown>[]).map(mapCatalogoItem) };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'repository', 'findCatalogoByProveedor') };
    }
  }

  async findCatalogoItemById(empresaId: string, id: string): Promise<Result<CatalogoCompraItem>> {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('catalogo_compra')
        .select('*, ingredientes(nombre, es_perecedero)')
        .eq('empresa_id', empresaId)
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return {
            success: false,
            error: { code: 'COMPRAS_CATALOGO_NOT_FOUND', message: 'Ítem de catálogo no encontrado', module: 'repository' },
          };
        }
        return { success: false, error: await logger.logFromCatch(error, 'repository', 'findCatalogoItemById') };
      }
      return { success: true, data: mapCatalogoItem(data as Record<string, unknown>) };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'repository', 'findCatalogoItemById') };
    }
  }

  async createCatalogoItem(empresaId: string, data: CreateCatalogoItemDTO): Promise<Result<CatalogoCompraItem>> {
    try {
      const supabase = getSupabaseClient();
      const { data: row, error } = await supabase
        .from('catalogo_compra')
        .insert({
          empresa_id: empresaId,
          proveedor_id: data.proveedorId,
          ingrediente_id: data.ingredienteId,
          referencia_proveedor: data.referenciaProveedor ?? null,
          descripcion: data.descripcion ?? null,
          precio_compra_cents: data.precioCompraCents,
          unidad_compra: data.unidadCompra,
          factor_conversion: data.factorConversion,
          porcentaje_iva: data.porcentajeIva,
        })
        .select('*, ingredientes(nombre, es_perecedero)')
        .single();

      if (error) {
        return { success: false, error: await logger.logFromCatch(error, 'repository', 'createCatalogoItem') };
      }
      return { success: true, data: mapCatalogoItem(row as Record<string, unknown>) };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'repository', 'createCatalogoItem') };
    }
  }

  async updateCatalogoItem(empresaId: string, id: string, data: UpdateCatalogoItemDTO): Promise<Result<CatalogoCompraItem>> {
    try {
      const supabase = getSupabaseClient();
      const patch: Record<string, unknown> = {};
      if (data.referenciaProveedor !== undefined) patch.referencia_proveedor = data.referenciaProveedor;
      if (data.descripcion !== undefined) patch.descripcion = data.descripcion;
      if (data.precioCompraCents !== undefined) patch.precio_compra_cents = data.precioCompraCents;
      if (data.unidadCompra !== undefined) patch.unidad_compra = data.unidadCompra;
      if (data.factorConversion !== undefined) patch.factor_conversion = data.factorConversion;
      if (data.porcentajeIva !== undefined) patch.porcentaje_iva = data.porcentajeIva;
      if (data.activo !== undefined) patch.activo = data.activo;
      patch.updated_at = new Date().toISOString();

      const { data: row, error } = await supabase
        .from('catalogo_compra')
        .update(patch)
        .eq('id', id)
        .eq('empresa_id', empresaId)
        .select('*, ingredientes(nombre, es_perecedero)')
        .single();

      if (error) {
        return { success: false, error: await logger.logFromCatch(error, 'repository', 'updateCatalogoItem') };
      }
      return { success: true, data: mapCatalogoItem(row as Record<string, unknown>) };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'repository', 'updateCatalogoItem') };
    }
  }

  async softDeleteCatalogoItem(empresaId: string, id: string): Promise<Result<void>> {
    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase
        .from('catalogo_compra')
        .update({ activo: false, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('empresa_id', empresaId);

      if (error) {
        return { success: false, error: await logger.logFromCatch(error, 'repository', 'softDeleteCatalogoItem') };
      }
      return { success: true, data: undefined };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'repository', 'softDeleteCatalogoItem') };
    }
  }

  // ---- Pedidos ----

  async findPedidos(empresaId: string, filters?: PedidoCompraFilters): Promise<Result<PedidoCompra[]>> {
    try {
      const supabase = getSupabaseClient();
      let query = supabase
        .from('pedidos_compra')
        .select('*, proveedores(nombre)')
        .eq('empresa_id', empresaId)
        .order('created_at', { ascending: false });

      if (filters?.estado) query = query.eq('estado', filters.estado);
      if (filters?.proveedorId) query = query.eq('proveedor_id', filters.proveedorId);

      const { data, error } = await query;
      if (error) {
        return { success: false, error: await logger.logFromCatch(error, 'repository', 'findPedidos') };
      }
      return { success: true, data: (data as Record<string, unknown>[]).map(mapPedido) };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'repository', 'findPedidos') };
    }
  }

  async findPedidoById(empresaId: string, id: string): Promise<Result<PedidoCompra>> {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('pedidos_compra')
        .select('*, proveedores(nombre), pedidos_compra_items(*, catalogo_compra(unidad_compra, ingredientes(nombre)))')
        .eq('empresa_id', empresaId)
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return {
            success: false,
            error: { code: 'COMPRAS_PEDIDO_NOT_FOUND', message: 'Pedido no encontrado', module: 'repository' },
          };
        }
        return { success: false, error: await logger.logFromCatch(error, 'repository', 'findPedidoById') };
      }
      return { success: true, data: mapPedido(data as Record<string, unknown>) };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'repository', 'findPedidoById') };
    }
  }

  async createPedido(empresaId: string, data: CreatePedidoCompraDTO, numeroPedido: string): Promise<Result<PedidoCompra>> {
    try {
      const supabase = getSupabaseClient();
      const { data: row, error } = await supabase
        .from('pedidos_compra')
        .insert({
          empresa_id: empresaId,
          proveedor_id: data.proveedorId,
          numero_pedido: numeroPedido,
          estado: 'borrador',
          notas: data.notas ?? null,
          fecha_pedido: new Date().toISOString().split('T')[0],
          fecha_entrega_estimada: data.fechaEntregaEstimada ?? null,
        })
        .select('*, proveedores(nombre)')
        .single();

      if (error) {
        return { success: false, error: await logger.logFromCatch(error, 'repository', 'createPedido') };
      }
      return { success: true, data: mapPedido(row as Record<string, unknown>) };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'repository', 'createPedido') };
    }
  }

  async updatePedidoEstado(empresaId: string, id: string, estado: PedidoCompraEstado): Promise<Result<PedidoCompra>> {
    try {
      const supabase = getSupabaseClient();
      const { data: row, error } = await supabase
        .from('pedidos_compra')
        .update({ estado, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('empresa_id', empresaId)
        .select('*, proveedores(nombre)')
        .single();

      if (error) {
        return { success: false, error: await logger.logFromCatch(error, 'repository', 'updatePedidoEstado') };
      }
      return { success: true, data: mapPedido(row as Record<string, unknown>) };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'repository', 'updatePedidoEstado') };
    }
  }

  async addItemToPedido(
    _empresaId: string,
    pedidoId: string,
    item: AddItemToPedidoDTO & { precioCompraCents: number; porcentajeIva: number },
  ): Promise<Result<PedidoCompraItem>> {
    try {
      const supabase = getSupabaseClient();
      const { data: row, error } = await supabase
        .from('pedidos_compra_items')
        .insert({
          pedido_compra_id: pedidoId,
          catalogo_compra_id: item.catalogoCompraId,
          cantidad: item.cantidad,
          precio_compra_cents: item.precioCompraCents,
          porcentaje_iva: item.porcentajeIva,
        })
        .select('*, catalogo_compra(unidad_compra, ingredientes(nombre))')
        .single();

      if (error) {
        return { success: false, error: await logger.logFromCatch(error, 'repository', 'addItemToPedido') };
      }
      return { success: true, data: mapPedidoItem(row as Record<string, unknown>) };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'repository', 'addItemToPedido') };
    }
  }

  async updatePedidoItem(
    _empresaId: string,
    _pedidoId: string,
    itemId: string,
    cantidad: number,
  ): Promise<Result<PedidoCompraItem>> {
    try {
      const supabase = getSupabaseClient();
      const { data: row, error } = await supabase
        .from('pedidos_compra_items')
        .update({ cantidad })
        .eq('id', itemId)
        .select('*, catalogo_compra(unidad_compra, ingredientes(nombre))')
        .single();

      if (error) {
        return { success: false, error: await logger.logFromCatch(error, 'repository', 'updatePedidoItem') };
      }
      return { success: true, data: mapPedidoItem(row as Record<string, unknown>) };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'repository', 'updatePedidoItem') };
    }
  }

  async removePedidoItem(_empresaId: string, _pedidoId: string, itemId: string): Promise<Result<void>> {
    try {
      const supabase = getSupabaseClient();
      // Item tables don't have empresa_id — tenant isolation enforced by RLS via parent FK
      // and by the use case verifying parent ownership before calling this method
      const { error } = await supabase
        .from('pedidos_compra_items')
        .delete()
        .eq('id', itemId);

      if (error) {
        return { success: false, error: await logger.logFromCatch(error, 'repository', 'removePedidoItem') };
      }
      return { success: true, data: undefined };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'repository', 'removePedidoItem') };
    }
  }

  // ---- Albaranes ----

  async findAlbaranes(empresaId: string, filters?: AlbaranFilters): Promise<Result<AlbaranCompra[]>> {
    try {
      const supabase = getSupabaseClient();
      let query = supabase
        .from('albaranes_compra')
        .select('*, proveedores(nombre)')
        .eq('empresa_id', empresaId)
        .order('created_at', { ascending: false });

      if (filters?.estado) query = query.eq('estado', filters.estado);
      if (filters?.proveedorId) query = query.eq('proveedor_id', filters.proveedorId);
      if (filters?.fechaDesde) query = query.gte('created_at', filters.fechaDesde);
      if (filters?.fechaHasta) query = query.lte('created_at', filters.fechaHasta);

      const { data, error } = await query;
      if (error) {
        return { success: false, error: await logger.logFromCatch(error, 'repository', 'findAlbaranes') };
      }
      return { success: true, data: (data as Record<string, unknown>[]).map(mapAlbaran) };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'repository', 'findAlbaranes') };
    }
  }

  async findAlbaranById(empresaId: string, id: string): Promise<Result<AlbaranCompra>> {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('albaranes_compra')
        .select('*, proveedores(nombre), albaranes_compra_items(*, catalogo_compra(unidad_compra, ingredientes(nombre, es_perecedero)))')
        .eq('empresa_id', empresaId)
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return {
            success: false,
            error: { code: 'COMPRAS_ALBARAN_NOT_FOUND', message: 'Albarán no encontrado', module: 'repository' },
          };
        }
        return { success: false, error: await logger.logFromCatch(error, 'repository', 'findAlbaranById') };
      }
      return { success: true, data: mapAlbaran(data as Record<string, unknown>) };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'repository', 'findAlbaranById') };
    }
  }

  async createAlbaran(empresaId: string, data: CreateAlbaranDTO): Promise<Result<AlbaranCompra>> {
    try {
      const supabase = getSupabaseClient();
      const { data: row, error } = await supabase
        .from('albaranes_compra')
        .insert({
          empresa_id: empresaId,
          proveedor_id: data.proveedorId,
          pedido_compra_id: data.pedidoCompraId ?? null,
          numero_albaran: data.numeroAlbaran,
          estado: 'borrador',
          notas: data.notas ?? null,
        })
        .select('*, proveedores(nombre)')
        .single();

      if (error) {
        return { success: false, error: await logger.logFromCatch(error, 'repository', 'createAlbaran') };
      }
      return { success: true, data: mapAlbaran(row as Record<string, unknown>) };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'repository', 'createAlbaran') };
    }
  }

  async addItemToAlbaran(_empresaId: string, albaranId: string, item: AddItemToAlbaranDTO): Promise<Result<AlbaranCompraItem>> {
    try {
      const supabase = getSupabaseClient();
      const { data: row, error } = await supabase
        .from('albaranes_compra_items')
        .insert({
          albaran_compra_id: albaranId,
          catalogo_compra_id: item.catalogoCompraId,
          cantidad_recibida: item.cantidadRecibida,
          precio_compra_cents: item.precioCompraCents,
          porcentaje_iva: item.porcentajeIva,
          numero_lote: item.numeroLote ?? null,
          fecha_caducidad: item.fechaCaducidad ?? null,
        })
        .select('*, catalogo_compra(unidad_compra, ingredientes(nombre, es_perecedero))')
        .single();

      if (error) {
        return { success: false, error: await logger.logFromCatch(error, 'repository', 'addItemToAlbaran') };
      }
      return { success: true, data: mapAlbaranItem(row as Record<string, unknown>) };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'repository', 'addItemToAlbaran') };
    }
  }

  async updateAlbaranItem(
    _empresaId: string,
    _albaranId: string,
    itemId: string,
    data: Partial<AddItemToAlbaranDTO>,
  ): Promise<Result<AlbaranCompraItem>> {
    try {
      const supabase = getSupabaseClient();
      const patch: Record<string, unknown> = {};
      if (data.cantidadRecibida !== undefined) patch.cantidad_recibida = data.cantidadRecibida;
      if (data.precioCompraCents !== undefined) patch.precio_compra_cents = data.precioCompraCents;
      if (data.porcentajeIva !== undefined) patch.porcentaje_iva = data.porcentajeIva;
      if (data.numeroLote !== undefined) patch.numero_lote = data.numeroLote;
      if (data.fechaCaducidad !== undefined) patch.fecha_caducidad = data.fechaCaducidad;

      const { data: row, error } = await supabase
        .from('albaranes_compra_items')
        .update(patch)
        .eq('id', itemId)
        .select('*, catalogo_compra(unidad_compra, ingredientes(nombre, es_perecedero))')
        .single();

      if (error) {
        return { success: false, error: await logger.logFromCatch(error, 'repository', 'updateAlbaranItem') };
      }
      return { success: true, data: mapAlbaranItem(row as Record<string, unknown>) };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'repository', 'updateAlbaranItem') };
    }
  }

  async removeAlbaranItem(_empresaId: string, _albaranId: string, itemId: string): Promise<Result<void>> {
    try {
      const supabase = getSupabaseClient();
      // Item tables don't have empresa_id — tenant isolation enforced by RLS via parent FK
      // and by the use case verifying parent ownership before calling this method
      const { error } = await supabase
        .from('albaranes_compra_items')
        .delete()
        .eq('id', itemId);

      if (error) {
        return { success: false, error: await logger.logFromCatch(error, 'repository', 'removeAlbaranItem') };
      }
      return { success: true, data: undefined };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'repository', 'removeAlbaranItem') };
    }
  }

  async marcarAlbaranRecibido(empresaId: string, albaranId: string, empleadoId: string): Promise<Result<AlbaranCompra>> {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.rpc('recibir_albaran_transaccional', {
        p_albaran_id: albaranId,
        p_empresa_id: empresaId,
        p_empleado_id: empleadoId,
      });

      if (error) {
        return { success: false, error: await logger.logFromCatch(error, 'repository', 'marcarAlbaranRecibido') };
      }

      const rpcResult = data as { success: boolean; error?: string };
      if (!rpcResult.success) {
        return {
          success: false,
          error: { code: 'COMPRAS_ALBARAN_RPC_ERROR', message: rpcResult.error ?? 'Error al recibir albarán', module: 'repository' },
        };
      }

      // RPC returns { success: true } — re-fetch the full albaran row
      return this.findAlbaranById(empresaId, albaranId);
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'repository', 'marcarAlbaranRecibido') };
    }
  }

  // ---- Facturas ----

  async findFacturas(empresaId: string, filters?: FacturaFilters): Promise<Result<FacturaProveedor[]>> {
    try {
      const supabase = getSupabaseClient();
      let query = supabase
        .from('facturas_proveedor')
        .select('*, proveedores(nombre)')
        .eq('empresa_id', empresaId)
        .order('created_at', { ascending: false });

      if (filters?.estadoPago) query = query.eq('estado_pago', filters.estadoPago);
      if (filters?.proveedorId) query = query.eq('proveedor_id', filters.proveedorId);
      if (filters?.fechaDesde) query = query.gte('fecha_factura', filters.fechaDesde);
      if (filters?.fechaHasta) query = query.lte('fecha_factura', filters.fechaHasta);

      const { data, error } = await query;
      if (error) {
        return { success: false, error: await logger.logFromCatch(error, 'repository', 'findFacturas') };
      }
      return { success: true, data: (data as Record<string, unknown>[]).map(mapFactura) };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'repository', 'findFacturas') };
    }
  }

  async findFacturaById(empresaId: string, id: string): Promise<Result<FacturaProveedor>> {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('facturas_proveedor')
        .select('*, proveedores(nombre), facturas_proveedor_albaranes(albaran_compra_id, albaranes_compra(*))')
        .eq('empresa_id', empresaId)
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return {
            success: false,
            error: { code: 'COMPRAS_FACTURA_NOT_FOUND', message: 'Factura no encontrada', module: 'repository' },
          };
        }
        return { success: false, error: await logger.logFromCatch(error, 'repository', 'findFacturaById') };
      }
      return { success: true, data: mapFactura(data as Record<string, unknown>) };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'repository', 'findFacturaById') };
    }
  }

  async createFactura(empresaId: string, data: CreateFacturaProveedorDTO): Promise<Result<FacturaProveedor>> {
    try {
      const supabase = getSupabaseClient();

      const { data: row, error: insertError } = await supabase
        .from('facturas_proveedor')
        .insert({
          empresa_id: empresaId,
          proveedor_id: data.proveedorId,
          numero_factura: data.numeroFactura,
          fecha_factura: data.fechaFactura,
          base_imponible_0_cents: data.baseImponible0Cents,
          base_imponible_3_cents: data.baseImponible3Cents ?? 0,
          base_imponible_4_cents: data.baseImponible4Cents,
          base_imponible_7_cents: data.baseImponible7Cents ?? 0,
          base_imponible_10_cents: data.baseImponible10Cents,
          base_imponible_15_cents: data.baseImponible15Cents ?? 0,
          base_imponible_21_cents: data.baseImponible21Cents,
          base_imponible_95_cents: data.baseImponible95Cents ?? 0,
          iva_soportado_cents: data.ivaSoportadoCents,
          total_factura_cents: data.totalFacturaCents,
          estado_pago: 'pendiente',
          notas: data.notas ?? null,
        })
        .select('*, proveedores(nombre)')
        .single();

      if (insertError) {
        return { success: false, error: await logger.logFromCatch(insertError, 'repository', 'createFactura') };
      }

      const factura = mapFactura(row as Record<string, unknown>);

      if (data.albaranIds.length > 0) {
        const junctionRows = data.albaranIds.map((albaranId) => ({
          factura_proveedor_id: factura.id,
          albaran_compra_id: albaranId,
        }));

        const { error: junctionError } = await supabase
          .from('facturas_proveedor_albaranes')
          .insert(junctionRows);

        if (junctionError) {
          return { success: false, error: await logger.logFromCatch(junctionError, 'repository', 'createFactura') };
        }
      }

      return { success: true, data: factura };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'repository', 'createFactura') };
    }
  }

  async registrarPagoFactura(empresaId: string, id: string, data: RegistrarPagoDTO): Promise<Result<FacturaProveedor>> {
    try {
      const supabase = getSupabaseClient();

      // Load factura to get total and numero for the turno event description
      const facturaResult = await this.findFacturaById(empresaId, id);
      if (!facturaResult.success) return facturaResult;
      const { totalFacturaCents, numeroFactura } = facturaResult.data;

      // For pagado_caja: INSERT the turno event FIRST so that if it fails,
      // the factura remains pendiente (safe). If the UPDATE fails after, we get
      // an orphan turno event — far less harmful than a paid factura with no event.
      if (data.metodoPago === 'pagado_caja' && data.turnoId) {
        const { error: eventoError } = await supabase
          .from('tpv_turno_eventos')
          .insert({
            turno_id: data.turnoId,
            empresa_id: empresaId,
            tipo_evento: 'compra_proveedor',
            monto_cents: totalFacturaCents,
            descripcion: `Pago factura ${numeroFactura}`,
          });

        if (eventoError) {
          return { success: false, error: await logger.logFromCatch(eventoError, 'repository', 'registrarPagoFactura') };
        }
      }

      const patch: Record<string, unknown> = {
        estado_pago: data.metodoPago,
        updated_at: new Date().toISOString(),
      };

      if (data.metodoPago === 'pagado_caja' && data.turnoId) {
        patch.turno_id = data.turnoId;
      }

      const { data: row, error: updateError } = await supabase
        .from('facturas_proveedor')
        .update(patch)
        .eq('id', id)
        .eq('empresa_id', empresaId)
        .select('*, proveedores(nombre)')
        .single();

      if (updateError) {
        return { success: false, error: await logger.logFromCatch(updateError, 'repository', 'registrarPagoFactura') };
      }

      return { success: true, data: mapFactura(row as Record<string, unknown>) };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'repository', 'registrarPagoFactura') };
    }
  }
}
