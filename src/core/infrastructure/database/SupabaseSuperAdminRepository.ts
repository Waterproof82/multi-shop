import { SupabaseClient } from "@supabase/supabase-js";
import { ISuperAdminRepository, EmpresaWithStats, EmpresaStats, SuperAdminGlobalStats } from "@/core/domain/repositories/ISuperAdminRepository";
import { Result } from "@/core/domain/entities/types";
import { DEFAULT_EMPRESA_COLORES } from "@/core/domain/constants/empresa-defaults";
import { logger } from "@/core/infrastructure/logging/logger";

interface EmpresaRow {
  id: string;
  nombre: string;
  dominio: string;
  slug: string | null;
  logo_url: string | null;
  mostrar_carrito: boolean;
  mostrar_promociones: boolean;
  mostrar_tgtg: boolean;
  moneda: string;
  email_notification: string | null;
  url_image: string | null;
  descripcion_es: string | null;
  descripcion_en: string | null;
  descripcion_fr: string | null;
  descripcion_it: string | null;
  descripcion_de: string | null;
  color_primary: string | null;
  color_primary_foreground: string | null;
  color_secondary: string | null;
  color_secondary_foreground: string | null;
  color_accent: string | null;
  color_accent_foreground: string | null;
  color_background: string | null;
  color_foreground: string | null;
  fb: string | null;
  instagram: string | null;
  url_mapa: string | null;
  direccion: string | null;
  telefono_whatsapp: string | null;
  subdomain_pedidos: string | null;
  titulo: string | null;
  subtitulo: string | null;
  subtitulo2_es: string | null;
  subtitulo2_en: string | null;
  subtitulo2_fr: string | null;
  subtitulo2_it: string | null;
  subtitulo2_de: string | null;
  footer1_es: string | null;
  footer1_en: string | null;
  footer1_fr: string | null;
  footer1_it: string | null;
  footer1_de: string | null;
  footer2_es: string | null;
  footer2_en: string | null;
  footer2_fr: string | null;
  footer2_it: string | null;
  footer2_de: string | null;
  created_at: string;
}

export class SupabaseSuperAdminRepository implements ISuperAdminRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async findAllEmpresas(): Promise<Result<EmpresaWithStats[]>> {
    try {
      const { data: empresas, error } = await this.supabase
        .from("empresas")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        await logger.logAndReturnError(
          'DB_SELECT_ERROR',
          error.message,
          'repository',
          'SupabaseSuperAdminRepository.findAllEmpresas',
          { details: { code: error.code } }
        );
        return {
          success: false,
          error: {
            code: 'DB_ERROR',
            message: 'Error al obtener empresas',
            module: 'repository',
            method: 'findAllEmpresas'
          }
        };
      }

      const empresasWithStats: EmpresaWithStats[] = [];

      for (const empresa of (empresas as unknown as EmpresaRow[]) || []) {
        const statsResult = await this.getEmpresaStats(empresa.id);
        const stats: EmpresaStats = statsResult.success ? statsResult.data : {
          totalPedidos: 0,
          pedidosPendientes: 0,
          totalClientes: 0,
          totalProductos: 0,
          pedidosHoy: 0,
          pedidosMes: 0,
          cuponesPromoValidados: 0,
          cuponesTgtgValidados: 0,
          cuponesTgtgTotales: 0,
        };

        empresasWithStats.push(this.mapEmpresaToStats(empresa, stats));
      }

      return { success: true, data: empresasWithStats };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseSuperAdminRepository.findAllEmpresas');
      return { success: false, error: appError };
    }
  }

  async findEmpresaById(id: string): Promise<Result<EmpresaWithStats | null>> {
    try {
      const { data: empresa, error } = await this.supabase
        .from("empresas")
        .select("*")
        .eq("id", id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return { success: true, data: null };
        }
        await logger.logAndReturnError(
          'DB_SELECT_ERROR',
          error.message,
          'repository',
          'SupabaseSuperAdminRepository.findEmpresaById',
          { details: { id, code: error.code } }
        );
        return {
          success: false,
          error: {
            code: 'DB_ERROR',
            message: 'Error al obtener empresa',
            module: 'repository',
            method: 'findEmpresaById'
          }
        };
      }

      const statsResult = await this.getEmpresaStats(id);
      const stats: EmpresaStats = statsResult.success ? statsResult.data : {
        totalPedidos: 0,
        pedidosPendientes: 0,
        totalClientes: 0,
        totalProductos: 0,
        pedidosHoy: 0,
        pedidosMes: 0,
        cuponesPromoValidados: 0,
        cuponesTgtgValidados: 0,
        cuponesTgtgTotales: 0,
      };

      return {
        success: true,
        data: this.mapEmpresaToStats(empresa as unknown as EmpresaRow, stats)
      };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseSuperAdminRepository.findEmpresaById', { empresaId: id });
      return { success: false, error: appError };
    }
  }

  async updateEmpresa(id: string, data: Record<string, unknown>): Promise<Result<void>> {
    try {
      const { error } = await this.supabase
        .from("empresas")
        .update(data)
        .eq("id", id);

      if (error) {
        await logger.logAndReturnError(
          'DB_UPDATE_ERROR',
          error.message,
          'repository',
          'SupabaseSuperAdminRepository.updateEmpresa',
          { details: { id, code: error.code } }
        );
        return {
          success: false,
          error: {
            code: 'DB_ERROR',
            message: 'Error al actualizar empresa',
            module: 'repository',
            method: 'updateEmpresa'
          }
        };
      }

      return { success: true, data: undefined };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseSuperAdminRepository.updateEmpresa', { empresaId: id });
      return { success: false, error: appError };
    }
  }

  async getEmpresaStats(empresaId: string): Promise<Result<EmpresaStats>> {
    try {
      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      const [pedidosResult, clientesResult, productosResult, pedidosHoyResult, pedidosMesResult, promosResult, tgtgItemsResult] = await Promise.all([
        this.supabase.from("pedidos").select("id, estado", { count: 'exact' }).eq("empresa_id", empresaId),
        this.supabase.from("clientes").select("id", { count: 'exact' }).eq("empresa_id", empresaId),
        this.supabase.from("productos").select("id", { count: 'exact' }).eq("empresa_id", empresaId),
        this.supabase.from("pedidos").select("id", { count: 'exact' }).eq("empresa_id", empresaId).gte("created_at", startOfDay),
        this.supabase.from("pedidos").select("id", { count: 'exact' }).eq("empresa_id", empresaId).gte("created_at", startOfMonth),
        this.supabase.from("promociones").select("numero_envios").eq("empresa_id", empresaId),
        this.supabase.from("tgtg_items").select("cupones_total, cupones_disponibles").eq("empresa_id", empresaId),
      ]);

      const totalPedidos = pedidosResult.count || 0;
      const pedidosPendientes = (pedidosResult.data || []).filter(p => p.estado === 'pendiente').length;
      const totalClientes = clientesResult.count || 0;
      const totalProductos = productosResult.count || 0;
      const pedidosHoy = pedidosHoyResult.count || 0;
      const pedidosMes = pedidosMesResult.count || 0;

      const cuponesPromoValidados = (promosResult.data || []).reduce((sum, p) => sum + (p.numero_envios || 0), 0);
      const cuponesTgtgTotales = (tgtgItemsResult.data || []).reduce((sum, i) => sum + (i.cupones_total || 0), 0);
      const cuponesTgtgDisponibles = (tgtgItemsResult.data || []).reduce((sum, i) => sum + (i.cupones_disponibles || 0), 0);
      const cuponesTgtgValidados = cuponesTgtgTotales - cuponesTgtgDisponibles;

      return {
        success: true,
        data: {
          totalPedidos,
          pedidosPendientes,
          totalClientes,
          totalProductos,
          pedidosHoy,
          pedidosMes,
          cuponesPromoValidados,
          cuponesTgtgValidados,
          cuponesTgtgTotales,
        }
      };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseSuperAdminRepository.getEmpresaStats', { empresaId });
      return { success: false, error: appError };
    }
  }

  async getGlobalStats(): Promise<Result<SuperAdminGlobalStats>> {
    try {
      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      const [{ data: empresas, error: empresasError }, { count: totalClientes }, { count: totalProductos }] = await Promise.all([
        this.supabase.from("empresas").select("id, nombre, dominio, logo_url"),
        this.supabase.from("clientes").select("id", { count: 'exact' }),
        this.supabase.from("productos").select("id", { count: 'exact' }),
      ]);

      if (empresasError) {
        await logger.logAndReturnError(
          'DB_SELECT_ERROR',
          empresasError.message,
          'repository',
          'SupabaseSuperAdminRepository.getGlobalStats',
          { details: { code: empresasError.code } }
        );
        return {
          success: false,
          error: {
            code: 'DB_ERROR',
            message: 'Error al obtener estadísticas globales',
            module: 'repository',
            method: 'getGlobalStats'
          }
        };
      }

      const empresaIds = empresas?.map(e => e.id) || [];
      
      let pedidosData: { id: string; empresa_id: string; created_at: string }[] = [];
      let totalPedidosHoy = 0;
      let totalPedidosMes = 0;

      if (empresaIds.length > 0) {
        const [pedidosResult, pedidosHoyResult, pedidosMesResult] = await Promise.all([
          this.supabase.from("pedidos").select("id, empresa_id, created_at").in("empresa_id", empresaIds),
          this.supabase.from("pedidos").select("id", { count: 'exact' }).in("empresa_id", empresaIds).gte("created_at", startOfDay),
          this.supabase.from("pedidos").select("id", { count: 'exact' }).in("empresa_id", empresaIds).gte("created_at", startOfMonth),
        ]);

        pedidosData = pedidosResult.data || [];
        totalPedidosHoy = pedidosHoyResult.count || 0;
        totalPedidosMes = pedidosMesResult.count || 0;
      }

      const totalPedidos = pedidosData.length;

      const pedidosPorEmpresa: Record<string, number> = {};
      for (const pedido of pedidosData) {
        const mesMatch = new Date(pedido.created_at) >= new Date(startOfMonth);
        if (mesMatch) {
          pedidosPorEmpresa[pedido.empresa_id] = (pedidosPorEmpresa[pedido.empresa_id] || 0) + 1;
        }
      }

      const empresasRanking = empresas?.map((emp, index) => ({
        empresaId: emp.id,
        empresaNombre: emp.nombre,
        empresaDominio: emp.dominio,
        empresaLogoUrl: emp.logo_url,
        pedidosMes: pedidosPorEmpresa[emp.id] || 0,
        posicion: index + 1
      })).sort((a, b) => b.pedidosMes - a.pedidosMes).map((emp, index) => ({ ...emp, posicion: index + 1 })) || [];

      return {
        success: true,
        data: {
          totalEmpresas: empresas?.length || 0,
          totalPedidos,
          totalPedidosHoy,
          totalPedidosMes,
          totalClientes: totalClientes || 0,
          totalProductos: totalProductos || 0,
          empresasRanking
        }
      };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseSuperAdminRepository.getGlobalStats');
      return { success: false, error: appError };
    }
  }

  private mapEmpresaToStats(row: EmpresaRow, stats: EmpresaStats): EmpresaWithStats {
    const hasDescripcion = row.descripcion_es || row.descripcion_en || row.descripcion_fr || row.descripcion_it || row.descripcion_de;
    const descripcion = hasDescripcion
      ? {
          es: row.descripcion_es,
          en: row.descripcion_en,
          fr: row.descripcion_fr,
          it: row.descripcion_it,
          de: row.descripcion_de,
        }
      : null;

    const colores = row.color_primary
      ? {
          primary: row.color_primary || DEFAULT_EMPRESA_COLORES.primary,
          primaryForeground: row.color_primary_foreground || DEFAULT_EMPRESA_COLORES.primaryForeground,
          secondary: row.color_secondary || DEFAULT_EMPRESA_COLORES.secondary,
          secondaryForeground: row.color_secondary_foreground || DEFAULT_EMPRESA_COLORES.secondaryForeground,
          accent: row.color_accent || DEFAULT_EMPRESA_COLORES.accent,
          accentForeground: row.color_accent_foreground || DEFAULT_EMPRESA_COLORES.accentForeground,
          background: row.color_background || DEFAULT_EMPRESA_COLORES.background,
          foreground: row.color_foreground || DEFAULT_EMPRESA_COLORES.foreground,
        }
      : null;

    return {
      id: row.id,
      nombre: row.nombre,
      dominio: row.dominio,
      slug: row.slug,
      logoUrl: row.logo_url,
      mostrarCarrito: row.mostrar_carrito,
      mostrarPromociones: row.mostrar_promociones ?? true,
      mostrarTgtg: row.mostrar_tgtg ?? true,
      moneda: row.moneda,
      emailNotification: row.email_notification,
      urlImage: row.url_image,
      descripcion,
      colores,
      fb: row.fb,
      instagram: row.instagram,
      urlMapa: row.url_mapa,
      direccion: row.direccion,
      telefonoWhatsapp: row.telefono_whatsapp,
      subdomainPedidos: row.subdomain_pedidos,
      titulo: row.titulo,
      subtitulo: row.subtitulo,
      subtitulo2: {
        es: row.subtitulo2_es,
        en: row.subtitulo2_en,
        fr: row.subtitulo2_fr,
        it: row.subtitulo2_it,
        de: row.subtitulo2_de,
      },
      footer1: {
        es: row.footer1_es,
        en: row.footer1_en,
        fr: row.footer1_fr,
        it: row.footer1_it,
        de: row.footer1_de,
      },
      footer2: {
        es: row.footer2_es,
        en: row.footer2_en,
        fr: row.footer2_fr,
        it: row.footer2_it,
        de: row.footer2_de,
      },
      stats,
      createdAt: row.created_at,
      seoStatus: {
        hasDescription: !!(row.descripcion_es || row.descripcion_en),
        hasLogo: !!row.logo_url,
        hasUrlMapa: !!row.url_mapa,
        hasGeoCoordinates: this.hasGeoCoordinates(row.url_mapa),
        hasFb: !!row.fb,
        hasInstagram: !!row.instagram,
        hasMetaDescription: !!(row.descripcion_es && row.descripcion_es.length > 50),
      },
    };
  }

  private hasGeoCoordinates(urlMapa: string | null): boolean {
    if (!urlMapa) return false;
    
    // Decode URL-encoded characters first
    const decoded = decodeURIComponent(urlMapa);
    
    // Check for @lat,lng pattern in Google Maps URLs (most common)
    // Pattern: @37.4056789,-5.9854321,15z or similar
    if (/@(-?\d+\.?\d*),(-?\d+\.?\d*)/.test(decoded)) {
      return true;
    }
    
    // Check for explicit lat/lng params
    if (/[?&]lat=(-?\d+\.?\d*)/i.test(decoded) && /[?&]lng=(-?\d+\.?\d*)/i.test(decoded)) {
      return true;
    }
    
    // Check for Google Maps embed format: !2dlng!3dlat or !3dlat!2dlng
    // e.g., !2d-16.4126258!3d28.4774869
    if (/!2d(-?\d+\.?\d*).*!3d(-?\d+\.?\d*)/.test(decoded) || 
        /!3d(-?\d+\.?\d*).*!2d(-?\d+\.?\d*)/.test(decoded)) {
      return true;
    }
    
    // Check for data format: data=!4m2!3dlat!4dlng
    if (/!3d(-?\d+\.?\d*)!4d(-?\d+\.?\d*)/.test(decoded)) {
      return true;
    }
    
    // Check for place coordinates in various formats
    // e.g., 3d37.4056789!4d-5.9854321
    if (/3d(-?\d+\.?\d*).*4d(-?\d+\.?\d*)/.test(decoded)) {
      return true;
    }
    
    return false;
  }
}
