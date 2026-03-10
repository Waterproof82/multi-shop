import { SupabaseClient } from "@supabase/supabase-js";
import { IAdminRepository, AdminWithEmpresa } from "@/core/domain/repositories/IAdminRepository";
import { Empresa } from "@/core/domain/entities/types";
import { DEFAULT_EMPRESA_COLORES } from "@/core/domain/constants/empresa-defaults";

export class SupabaseAdminRepository implements IAdminRepository {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly supabaseAnon: SupabaseClient,
  ) {}

  async loginWithPassword(email: string, password: string): Promise<string> {
    const { error, data } = await this.supabaseAnon.auth.signInWithPassword({ email, password });
    if (error || !data?.user) throw new Error("Credenciales inválidas");
    return data.user.id;
  }

  async findById(id: string): Promise<AdminWithEmpresa | null> {
    const { data: perfil, error } = await this.supabase
      .from("perfiles_admin")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !perfil) {
      console.error('[Repo] Error fetching perfil:', error?.message);
      return null;
    }

    const { data: empresa } = await this.supabase
      .from("empresas")
      .select("*")
      .eq("id", perfil.empresa_id)
      .single();

    if (!empresa) return null;

    return {
      id: perfil.id,
      empresaId: perfil.empresa_id,
      nombreCompleto: perfil.nombre_completo,
      rol: perfil.rol,
      email: "",
      empresa: this.mapEmpresa(empresa),
    };
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
      moneda: (row.moneda as string) ?? "EUR",
      emailNotification: (row.email_notification as string | null) ?? null,
      urlImage: (row.url_image as string | null) ?? null,
      descripcion,
      colores,
      fb: (row.fb as string | null) ?? null,
      instagram: (row.instagram as string | null) ?? null,
      urlMapa: (row.url_mapa as string | null) ?? null,
      direccion: (row.direccion as string | null) ?? null,
      telefonoWhatsapp: (row.telefono_whatsapp as string | null) ?? null,
    };
  }
}
