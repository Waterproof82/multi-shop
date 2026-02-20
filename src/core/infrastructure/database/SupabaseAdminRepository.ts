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
      console.log('[Repo] Error fetching perfil:', error?.message);
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

  private mapEmpresa(row: any): Empresa {
    return {
      id: row.id,
      nombre: row.nombre,
      dominio: row.dominio,
      logoUrl: row.logo_url,
      mostrarCarrito: row.mostrar_carrito ?? true,
      moneda: row.moneda ?? "EUR",
      emailNotification: row.email_notification ?? null,
    };
  }
}

export const adminRepository = new SupabaseAdminRepository();
