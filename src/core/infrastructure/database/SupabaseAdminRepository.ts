import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { IAdminRepository, AdminProfile, AdminWithEmpresa } from "@/core/domain/repositories/IAdminRepository";
import { Empresa } from "@/core/domain/entities/types";

function getSupabaseAdmin(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export class SupabaseAdminRepository implements IAdminRepository {
  async findById(id: string): Promise<AdminWithEmpresa | null> {
    const supabaseAdmin = getSupabaseAdmin();
    
    const { data: perfil, error } = await supabaseAdmin
      .from("perfiles_admin")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !perfil) {
      console.error('[Repo] Error fetching perfil:', error?.message);
      return null;
    }

    const { data: empresa } = await supabaseAdmin
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

  async findByEmail(email: string): Promise<AdminProfile | null> {
    const supabaseAdmin = getSupabaseAdmin();
    
    const { data: users, error } = await supabaseAdmin.auth.admin.listUsers();

    if (error || !users) return null;

    const user = users.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());

    if (!user) return null;

    const { data: perfil } = await supabaseAdmin
      .from("perfiles_admin")
      .select("*")
      .eq("id", user.id)
      .single();

    if (!perfil) return null;

    return {
      id: perfil.id,
      empresaId: perfil.empresa_id,
      nombreCompleto: perfil.nombre_completo,
      rol: perfil.rol,
      email: user.email || "",
    };
  }

  async getEmpresaByAdminId(adminId: string): Promise<Empresa | null> {
    const supabaseAdmin = getSupabaseAdmin();
    
    const { data: perfil, error } = await supabaseAdmin
      .from("perfiles_admin")
      .select("empresa_id")
      .eq("id", adminId)
      .single();

    if (error || !perfil) return null;

    const { data: empresa } = await supabaseAdmin
      .from("empresas")
      .select("*")
      .eq("id", perfil.empresa_id)
      .single();

    if (!empresa) return null;

    return this.mapEmpresa(empresa);
  }

  async updateColores(empresaId: string, colores: {
    primary: string;
    primaryForeground: string;
    secondary: string;
    secondaryForeground: string;
    accent: string;
    accentForeground: string;
    background: string;
    foreground: string;
  }): Promise<boolean> {
    const supabaseAdmin = getSupabaseAdmin();

    const { error } = await supabaseAdmin
      .from("empresas")
      .update({
        color_primary: colores.primary,
        color_primary_foreground: colores.primaryForeground,
        color_secondary: colores.secondary,
        color_secondary_foreground: colores.secondaryForeground,
        color_accent: colores.accent,
        color_accent_foreground: colores.accentForeground,
        color_background: colores.background,
        color_foreground: colores.foreground,
      })
      .eq("id", empresaId);

    if (error) {
      console.error('[Repo] Error updating colores:', error.message);
      return false;
    }

    return true;
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
    };
  }
}

export const adminRepository = new SupabaseAdminRepository();
