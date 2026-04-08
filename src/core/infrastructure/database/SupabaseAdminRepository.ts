import { SupabaseClient } from "@supabase/supabase-js";
import { IAdminRepository, AdminWithEmpresa, SUPERADMIN_ROLE } from "@/core/domain/repositories/IAdminRepository";
import { Empresa, Result } from "@/core/domain/entities/types";
import { DEFAULT_EMPRESA_COLORES } from "@/core/domain/constants/empresa-defaults";
import { logger } from "@/core/infrastructure/logging/logger";

function anonymizeEmail(email: string): string {
  const [local, domain] = email.split('@');
  return `${local.substring(0, 2)}***@${domain ?? '***'}`;
}

export class SupabaseAdminRepository implements IAdminRepository {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly supabaseAnon: SupabaseClient,
  ) {}

  async loginWithPassword(email: string, password: string): Promise<Result<string>> {
    try {
      const { error, data } = await this.supabaseAnon.auth.signInWithPassword({ email, password });
      
      if (error) {
        await logger.logAndReturnError(
          'AUTH_LOGIN_ERROR',
          error.message,
          'repository',
          'SupabaseAdminRepository.loginWithPassword',
          { details: { email: anonymizeEmail(email), code: error.code, status: error.status } }
        );
        return { 
          success: false, 
          error: { 
            code: 'AUTH_LOGIN_ERROR', 
            message: 'Credenciales inválidas', 
            module: 'repository', 
            method: 'loginWithPassword' 
          } 
        };
      }
      
      if (!data?.user) {
        return { 
          success: false, 
          error: { 
            code: 'AUTH_NO_USER', 
            message: 'Usuario no encontrado', 
            module: 'repository', 
            method: 'loginWithPassword' 
          } 
        };
      }
      
      return { success: true, data: data.user.id };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseAdminRepository.loginWithPassword', { details: { email: anonymizeEmail(email) } });
      return { success: false, error: appError };
    }
  }

  async findById(id: string): Promise<Result<AdminWithEmpresa | null>> {
    try {
      const { data: perfil, error } = await this.supabase
        .from("perfiles_admin")
        .select("*")
        .eq("id", id)
        .single();

      if (error) {
        await logger.logAndReturnError(
          'DB_SELECT_ERROR',
          error.message,
          'repository',
          'SupabaseAdminRepository.findById',
          { details: { id, code: error.code } }
        );
        return { 
          success: false, 
          error: { 
            code: 'DB_ERROR', 
            message: 'Error al obtener perfil de admin', 
            module: 'repository', 
            method: 'findById' 
          } 
        };
      }

      if (!perfil) {
        return { success: true, data: null };
      }

      const isSuperAdmin = perfil.rol === SUPERADMIN_ROLE;

      if (isSuperAdmin) {
        return {
          success: true,
          data: {
            id: perfil.id,
            empresaId: null,
            nombreCompleto: perfil.nombre_completo,
            rol: perfil.rol,
            email: "",
            empresa: null,
          },
        };
      }

      if (!perfil.empresa_id) {
        return { 
          success: false, 
          error: { 
            code: 'EMPRESA_NOT_FOUND', 
            message: 'Empresa no encontrada para el admin', 
            module: 'repository', 
            method: 'findById' 
          } 
        };
      }

      const { data: empresa } = await this.supabase
        .from("empresas")
        .select("*")
        .eq("id", perfil.empresa_id)
        .single();

      if (!empresa) {
        return { 
          success: false, 
          error: { 
            code: 'EMPRESA_NOT_FOUND', 
            message: 'Empresa no encontrada para el admin', 
            module: 'repository', 
            method: 'findById' 
          } 
        };
      }

      return {
        success: true,
        data: {
          id: perfil.id,
          empresaId: perfil.empresa_id,
          nombreCompleto: perfil.nombre_completo,
          rol: perfil.rol,
          email: "",
          empresa: this.mapEmpresa(empresa),
        },
      };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseAdminRepository.findById', { details: { id } });
      return { success: false, error: appError };
    }
  }

  private mapEmpresa(row: Record<string, unknown>): Empresa {
    const hasDescripcion = row.descripcion_es || row.descripcion_en || row.descripcion_fr || row.descripcion_it || row.descripcion_de;
    const descripcion: Empresa['descripcion'] = hasDescripcion
      ? {
          es: row.descripcion_es as string | null,
          en: row.descripcion_en as string | null,
          fr: row.descripcion_fr as string | null,
          it: row.descripcion_it as string | null,
          de: row.descripcion_de as string | null,
        }
      : null;

    const colores = row.color_primary
      ? {
          primary: (row.color_primary as string) || DEFAULT_EMPRESA_COLORES.primary,
          primaryForeground: (row.color_primary_foreground as string) || DEFAULT_EMPRESA_COLORES.primaryForeground,
          secondary: (row.color_secondary as string) || DEFAULT_EMPRESA_COLORES.secondary,
          secondaryForeground: (row.color_secondary_foreground as string) || DEFAULT_EMPRESA_COLORES.secondaryForeground,
          accent: (row.color_accent as string) || DEFAULT_EMPRESA_COLORES.accent,
          accentForeground: (row.color_accent_foreground as string) || DEFAULT_EMPRESA_COLORES.accentForeground,
          background: (row.color_background as string) || DEFAULT_EMPRESA_COLORES.background,
          foreground: (row.color_foreground as string) || DEFAULT_EMPRESA_COLORES.foreground,
        }
      : null;

    return {
      id: row.id as string,
      nombre: row.nombre as string,
      dominio: row.dominio as string,
      slug: (row.slug as string | null) ?? null,
      logoUrl: row.logo_url as string | null,
      mostrarCarrito: (row.mostrar_carrito as boolean) ?? true,
      mostrarPromociones: (row.mostrar_promociones as boolean) ?? true,
      mostrarTgtg: (row.mostrar_tgtg as boolean) ?? true,
      moneda: (row.moneda as string) ?? "EUR",
      emailNotification: (row.email_notification as string | null) ?? null,
      urlImage: (row.url_image as string | null) ?? null,
      bannerFit: (row.banner_fit as "contain" | "cover" | "fill" | null) ?? "contain",
      descripcion,
      colores,
      fb: (row.fb as string | null) ?? null,
      instagram: (row.instagram as string | null) ?? null,
      urlMapa: (row.url_mapa as string | null) ?? null,
      direccion: (row.direccion as string | null) ?? null,
      telefonoWhatsapp: (row.telefono_whatsapp as string | null) ?? null,
      descuentoBienvenidaActivo: (row.descuento_bienvenida_activo as boolean) ?? false,
      descuentoBienvenidaPorcentaje: Number(row.descuento_bienvenida_porcentaje ?? 5),
      descuentoBienvenidaDuracion: Number(row.descuento_bienvenida_duracion ?? 30),
    };
  }
}
