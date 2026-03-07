import { SupabaseClient } from "@supabase/supabase-js";
import { IAdminRepository, AdminWithEmpresa } from "@/core/domain/repositories/IAdminRepository";
import { Empresa } from "@/core/domain/entities/types";

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

  private mapEmpresa(row: any): Empresa {
    const descripcion = row.descripcion_es || row.descripcion_en || row.descripcion_fr || row.descripcion_it || row.descripcion_de
      ? {
          es: row.descripcion_es || null,
          en: row.descripcion_en || null,
          fr: row.descripcion_fr || null,
          it: row.descripcion_it || null,
          de: row.descripcion_de || null,
        }
      : null;

    const colores = row.color_primary
      ? {
          primary: row.color_primary || '#008C45',
          primaryForeground: row.color_primary_foreground || '#FFFFFF',
          secondary: row.color_secondary || '#F7E7CE',
          secondaryForeground: row.color_secondary_foreground || '#3C2415',
          accent: row.color_accent || '#CF0921',
          accentForeground: row.color_accent_foreground || '#FFFFFF',
          background: row.color_background || '#FDFBF7',
          foreground: row.color_foreground || '#1A1612',
        }
      : null;

    return {
      id: row.id,
      nombre: row.nombre,
      dominio: row.dominio,
      logoUrl: row.logo_url,
      mostrarCarrito: row.mostrar_carrito ?? true,
      moneda: row.moneda ?? "EUR",
      emailNotification: row.email_notification ?? null,
      urlImage: row.url_image ?? null,
      descripcion,
      colores,
      fb: row.fb ?? null,
      instagram: row.instagram ?? null,
      urlMapa: row.url_mapa ?? null,
      direccion: row.direccion ?? null,
      telefonoWhatsapp: row.telefono_whatsapp ?? null,
    };
  }
}
