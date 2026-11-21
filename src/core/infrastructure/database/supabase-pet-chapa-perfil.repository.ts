// src/core/infrastructure/database/supabase-pet-chapa-perfil.repository.ts
// sdd pet-id-qr-profile (docs/sdd/pet-id-qr-profile/, kitemergenciacanarias),
// Fase 9 — service_role (getSupabaseClient() salta RLS); cada consulta
// filtra por empresa_id en el código, igual que
// supabase-pet-chapa-admin.repository.ts. DD1: repositorio independiente
// del admin — este `select` nunca trae `email` ni `gestion_token`.
//
// Fase 10 (DD5): `reservarAlta`/`findContacto` SÍ leen `email`/`gestion_token`
// (son del dueño, no PII del admin) — calco de
// `supabase-kit-avisos.repository.ts` (M2b), adaptado a `pet_chapas`.
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';
import type { IPetPerfilRepository } from '@/core/domain/repositories/IPetPerfilRepository';
import type { PerfilPublico, AltaChapaInput, ContactoDueno, EstadoChapa } from '@/core/domain/entities/pet-chapa-types';
import type { Language } from '@/lib/language-context';
import type { Result, AppError } from '@/core/domain/entities/types';

const TABLA = 'pet_chapas';

interface PgErrorLike {
  message?: string;
}

function mapPerfilPgError(error: PgErrorLike, method: string): AppError {
  return { code: 'DB_ERROR', message: error.message ?? 'Error de base de datos', module: 'repository', method };
}

function mapContactoDueno(fila: Record<string, unknown>): ContactoDueno & { estado: EstadoChapa } {
  return {
    estado: fila.confirmado_at ? 'activa' : 'pendiente',
    email: fila.email as string,
    idioma: fila.idioma as Language,
    nombre: fila.nombre as string,
    token: fila.gestion_token as string,
  };
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

  // DD5: una sola `update()` con la actualización condicional atómica — la
  // fila se reserva SOLO si está libre (`email IS NULL`) o si es un
  // pendiente ya caducado. El ISO va ENTRE COMILLAS dentro de `or()`, igual
  // que `SupabaseKitAvisosRepository.reservarAlta` (M2b): sin las comillas,
  // los dos puntos del ISO rompen el parseo del filtro de PostgREST.
  async reservarAlta(empresaId: string, input: AltaChapaInput): Promise<Result<boolean>> {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from(TABLA)
        .update({
          email: input.email,
          nombre: input.nombre,
          especie: input.especie,
          notas_salud: input.notas,
          idioma: input.idioma,
          gestion_token: input.token,
          consiente_perfil_at: input.ahora,
          texto_consentimiento_version: input.version,
          confirmado_at: null,
        })
        .eq('empresa_id', empresaId)
        .eq('codigo', input.codigo)
        .or(`email.is.null,and(confirmado_at.is.null,consiente_perfil_at.lt."${input.pendienteCaducaAntesDe}")`)
        .select('codigo');

      if (error) {
        return { success: false, error: mapPerfilPgError(error, 'reservarAlta') };
      }
      return { success: true, data: ((data ?? []) as unknown[]).length === 1 };
    } catch (e) {
      return { success: false, error: mapPerfilPgError(e as PgErrorLike, 'reservarAlta') };
    }
  }

  // R-QR.4.4/R-QR.10: SOLO estas 5 columnas — nunca `*`, nunca
  // notas_salud/foto_clave/telefono (eso es `findPerfilActivo`, para el
  // perfil PÚBLICO; esto es el contacto del DUEÑO, para el alta y el relay).
  async findContacto(empresaId: string, codigo: string): Promise<Result<(ContactoDueno & { estado: EstadoChapa }) | null>> {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from(TABLA)
        .select('email, idioma, nombre, gestion_token, confirmado_at')
        .eq('empresa_id', empresaId)
        .eq('codigo', codigo)
        .maybeSingle();

      if (error) {
        return { success: false, error: mapPerfilPgError(error, 'findContacto') };
      }
      const fila = data as Record<string, unknown> | null;
      if (!fila || !fila.email) {
        return { success: true, data: null };
      }
      return { success: true, data: mapContactoDueno(fila) };
    } catch (e) {
      return { success: false, error: mapPerfilPgError(e as PgErrorLike, 'findContacto') };
    }
  }
}
