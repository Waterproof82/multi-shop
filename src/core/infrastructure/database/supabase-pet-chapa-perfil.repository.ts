// src/core/infrastructure/database/supabase-pet-chapa-perfil.repository.ts
// sdd pet-id-qr-profile (docs/sdd/pet-id-qr-profile/, kitemergenciacanarias),
// Fase 9 — service_role (getSupabaseClient() salta RLS); cada consulta
// filtra por empresa_id en el código, igual que
// supabase-pet-chapa-admin.repository.ts. DD1: repositorio independiente
// del admin — este `select` nunca trae `email` ni `gestion_token`.
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';
import type { IPetPerfilRepository } from '@/core/domain/repositories/IPetPerfilRepository';
import type { PerfilPublico } from '@/core/domain/entities/pet-chapa-types';
import type { Result, AppError } from '@/core/domain/entities/types';

interface PgErrorLike {
  message?: string;
}

function mapPerfilPgError(error: PgErrorLike, method: string): AppError {
  return { code: 'DB_ERROR', message: error.message ?? 'Error de base de datos', module: 'repository', method };
}

/**
 * R-QR.8.3/DD15 (fuera de alcance aquí): la clave se sirve desde
 * `NEXT_PUBLIC_R2_DOMAIN`, igual que `deleteImageFromR2`/`uploadToR2`
 * (`s3-client.ts`). Sin el dominio configurado, nunca lanza — simplemente no
 * hay foto que mostrar.
 */
function urlFotoDesdeClave(clave: string | null): string | null {
  if (!clave) return null;
  const dominio = process.env.NEXT_PUBLIC_R2_DOMAIN;
  if (!dominio) return null;
  const base = dominio.endsWith('/') ? dominio.slice(0, -1) : dominio;
  return `${base}/${clave}`;
}

function mapPerfilPublico(fila: Record<string, unknown>): PerfilPublico {
  // R-QR.7.1: el teléfono nunca sale sin el consentimiento marcado — lo
  // decide el repositorio, no el componente que lo pinta.
  const telefonoConsentido = Boolean(fila.telefono_consentido_at);
  return {
    nombre: fila.nombre as string,
    especie: fila.especie as 'perro' | 'gato',
    notas: (fila.notas_salud as string | null) ?? null,
    fotoUrl: urlFotoDesdeClave((fila.foto_clave as string | null) ?? null),
    telefono: telefonoConsentido ? ((fila.telefono as string | null) ?? null) : null,
  };
}

export class SupabasePetChapaPerfilRepository implements IPetPerfilRepository {
  async findPerfilActivo(empresaId: string, codigo: string): Promise<Result<PerfilPublico | null>> {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('pet_chapas')
        .select('nombre, especie, notas_salud, foto_clave, telefono, telefono_consentido_at')
        .eq('empresa_id', empresaId)
        .eq('codigo', codigo)
        .not('confirmado_at', 'is', null)
        .maybeSingle();

      if (error) {
        return { success: false, error: mapPerfilPgError(error, 'findPerfilActivo') };
      }
      if (!data) return { success: true, data: null };

      return { success: true, data: mapPerfilPublico(data as Record<string, unknown>) };
    } catch (e) {
      return { success: false, error: mapPerfilPgError(e as PgErrorLike, 'findPerfilActivo') };
    }
  }
}
