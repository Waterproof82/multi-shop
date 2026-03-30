import { Empresa, EmpresaColores, EmpresaPublic, Result } from "@/core/domain/entities/types";
import { DEFAULT_PEDIDOS_SUBDOMAIN } from "@/core/domain/constants/empresa-defaults";
import { IEmpresaRepository, UpdateEmpresaData } from "@/core/domain/repositories/IEmpresaRepository";
import { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "../logging/logger";

export class SupabaseEmpresaRepository implements IEmpresaRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async getById(empresaId: string): Promise<Result<Partial<Empresa> | null>> {
    try {
      const { data: empresa } = await this.supabase
        .from('empresas')
        .select('email_notification, telefono_whatsapp, nombre, logo_url, fb, instagram, url_mapa, direccion, dominio, slug, url_image, descripcion_es, descripcion_en, descripcion_fr, descripcion_it, descripcion_de, mostrar_carrito, moneda, subdomain_pedidos, color_primary, color_primary_foreground, color_secondary, color_secondary_foreground, color_accent, color_accent_foreground, color_background, color_foreground')
        .eq('id', empresaId)
        .single();

      if (!empresa) return { success: true, data: null };

      const colores: EmpresaColores | null = empresa.color_primary ? {
        primary: empresa.color_primary,
        primaryForeground: empresa.color_primary_foreground,
        secondary: empresa.color_secondary,
        secondaryForeground: empresa.color_secondary_foreground,
        accent: empresa.color_accent,
        accentForeground: empresa.color_accent_foreground,
        background: empresa.color_background,
        foreground: empresa.color_foreground,
      } : null;

      return {
        success: true,
        data: {
          id: empresaId,
          nombre: empresa.nombre,
          dominio: empresa.dominio || '',
          slug: (empresa.slug as string | null) ?? null,
          logoUrl: empresa.logo_url,
          mostrarCarrito: empresa.mostrar_carrito ?? false,
          moneda: empresa.moneda ?? 'EUR',
          emailNotification: empresa.email_notification,
          colores,
          fb: empresa.fb ?? null,
          instagram: empresa.instagram ?? null,
          urlMapa: empresa.url_mapa ?? null,
          direccion: empresa.direccion ?? null,
          telefonoWhatsapp: empresa.telefono_whatsapp ?? null,
          urlImage: empresa.url_image ?? null,
          descripcion: {
            es: empresa.descripcion_es as string | null,
            en: empresa.descripcion_en as string | null,
            fr: empresa.descripcion_fr as string | null,
            it: empresa.descripcion_it as string | null,
            de: empresa.descripcion_de as string | null,
          },
        }
      };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseEmpresaRepository.getById', { empresaId });
      return { success: false, error: appError };
    }
  }

  async update(empresaId: string, data: UpdateEmpresaData): Promise<Result<void>> {
    try {
      const updatePayload: Record<string, unknown> = {};
      if (data.email_notification !== undefined) updatePayload.email_notification = data.email_notification || null;
      if (data.telefono_whatsapp !== undefined) updatePayload.telefono_whatsapp = data.telefono_whatsapp || null;
      if (data.fb !== undefined) updatePayload.fb = data.fb || null;
      if (data.instagram !== undefined) updatePayload.instagram = data.instagram || null;
      if (data.url_mapa !== undefined) updatePayload.url_mapa = data.url_mapa || null;
      if (data.direccion !== undefined) updatePayload.direccion = data.direccion || null;
      if (data.logo_url !== undefined) updatePayload.logo_url = data.logo_url || null;
      if (data.url_image !== undefined) updatePayload.url_image = data.url_image || null;
      if (data.descripcion_es !== undefined) updatePayload.descripcion_es = data.descripcion_es || null;
      if (data.descripcion_en !== undefined) updatePayload.descripcion_en = data.descripcion_en || null;
      if (data.descripcion_fr !== undefined) updatePayload.descripcion_fr = data.descripcion_fr || null;
      if (data.descripcion_it !== undefined) updatePayload.descripcion_it = data.descripcion_it || null;
      if (data.descripcion_de !== undefined) updatePayload.descripcion_de = data.descripcion_de || null;

      const { error } = await this.supabase
        .from('empresas')
        .update(updatePayload)
        .eq('id', empresaId);

      if (error) {
        await logger.logAndReturnError(
          'DB_UPDATE_ERROR',
          error.message,
          'repository',
          'SupabaseEmpresaRepository.update',
          { empresaId, details: { code: error.code } }
        );
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al actualizar empresa', module: 'repository', method: 'update' } };
      }
      return { success: true, data: undefined };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseEmpresaRepository.update', { empresaId });
      return { success: false, error: appError };
    }
  }

  async findByDomain(dominio: string): Promise<Result<{ id: string; nombre: string; email_notification: string | null; telefono_whatsapp: string | null } | null>> {
    try {
      const { data: empresa } = await this.supabase
        .from('empresas')
        .select('id, nombre, email_notification, telefono_whatsapp')
        .eq('dominio', dominio)
        .single();

      if (empresa) return { success: true, data: empresa };

      const isPedidos = dominio.startsWith(`${DEFAULT_PEDIDOS_SUBDOMAIN}.`) || dominio.endsWith('-pedidos');

      if (isPedidos) {
        const mainDomainFromSubdomain = dominio.split('.').slice(1).join('.');
        const { data: empresaSubdomain } = await this.supabase
          .from('empresas')
          .select('id, nombre, email_notification, telefono_whatsapp')
          .eq('dominio', mainDomainFromSubdomain)
          .single();

        return { success: true, data: empresaSubdomain || null };
      }

      return { success: true, data: null };
    } catch (e) {
      // PGRST116 = no rows returned
      if (e instanceof Object && 'code' in e && e.code === 'PGRST116') {
        return { success: true, data: null };
      }
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseEmpresaRepository.findByDomain', { details: { dominio } });
      return { success: false, error: appError };
    }
  }

  private static readonly PUBLIC_SELECT = `
    id, nombre, dominio, mostrar_carrito, moneda, subdomain_pedidos,
    logo_url, url_image,
    color_primary, color_primary_foreground, color_secondary, color_secondary_foreground,
    color_accent, color_accent_foreground, color_background, color_foreground,
    descripcion_es, descripcion_en, descripcion_fr, descripcion_it, descripcion_de,
    titulo, subtitulo,
    subtitulo2_es, subtitulo2_en, subtitulo2_fr, subtitulo2_it, subtitulo2_de,
    footer1_es, footer1_en, footer1_fr, footer1_it, footer1_de,
    footer2_es, footer2_en, footer2_fr, footer2_it, footer2_de,
    fb, instagram, url_mapa,
    direccion, telefono_whatsapp, email_notification
  `;

  private static mapTranslations(data: Record<string, unknown>, prefix: string): { es?: string | null; en?: string | null; fr?: string | null; it?: string | null; de?: string | null } | null {
    const es = (data[`${prefix}_es`] as string | null) ?? null;
    const en = (data[`${prefix}_en`] as string | null) ?? null;
    const fr = (data[`${prefix}_fr`] as string | null) ?? null;
    const it = (data[`${prefix}_it`] as string | null) ?? null;
    const de = (data[`${prefix}_de`] as string | null) ?? null;
    return es || en || fr || it || de ? { es, en, fr, it, de } : null;
  }

  private static mapToEmpresaPublic(data: Record<string, unknown>): EmpresaPublic {
    const colores = data.color_primary
      ? {
          primary: data.color_primary as string,
          primaryForeground: data.color_primary_foreground as string,
          secondary: data.color_secondary as string,
          secondaryForeground: data.color_secondary_foreground as string,
          accent: data.color_accent as string,
          accentForeground: data.color_accent_foreground as string,
          background: data.color_background as string,
          foreground: data.color_foreground as string,
        }
      : null;

    return {
      id: data.id as string,
      nombre: data.nombre as string,
      dominio: data.dominio as string,
      mostrarCarrito: (data.mostrar_carrito as boolean) ?? false,
      moneda: (data.moneda as string) ?? 'EUR',
      subdomainPedidos: (data.subdomain_pedidos as string | null) ?? null,
      logoUrl: (data.logo_url as string | null) ?? null,
      urlImage: (data.url_image as string | null) ?? null,
      colores,
      descripcion: SupabaseEmpresaRepository.mapTranslations(data, 'descripcion'),
      titulo: (data.titulo as string | null) ?? null,
      subtitulo: (data.subtitulo as string | null) ?? null,
      subtitulo2: SupabaseEmpresaRepository.mapTranslations(data, 'subtitulo2'),
      footer1: SupabaseEmpresaRepository.mapTranslations(data, 'footer1'),
      footer2: SupabaseEmpresaRepository.mapTranslations(data, 'footer2'),
      fb: (data.fb as string | null) ?? null,
      instagram: (data.instagram as string | null) ?? null,
      urlMapa: (data.url_mapa as string | null) ?? null,
      direccion: (data.direccion as string | null) ?? null,
      telefono: (data.telefono_whatsapp as string | null) ?? null,
      emailNotification: (data.email_notification as string | null) ?? null,
    };
  }

  async findByDomainPublic(domain: string): Promise<Result<EmpresaPublic | null>> {
    try {
      const { data } = await this.supabase
        .from('empresas')
        .select(SupabaseEmpresaRepository.PUBLIC_SELECT)
        .eq('dominio', domain)
        .maybeSingle();

      if (data) return { success: true, data: SupabaseEmpresaRepository.mapToEmpresaPublic(data as Record<string, unknown>) };

      const isPedidos = domain.startsWith(`${DEFAULT_PEDIDOS_SUBDOMAIN}.`) || domain.endsWith('-pedidos');
      if (isPedidos) {
        const mainDomain = domain.split('.').slice(1).join('.');
        const { data: subdomainData } = await this.supabase
          .from('empresas')
          .select(SupabaseEmpresaRepository.PUBLIC_SELECT)
          .eq('dominio', mainDomain)
          .maybeSingle();

        if (subdomainData) return { success: true, data: SupabaseEmpresaRepository.mapToEmpresaPublic(subdomainData as Record<string, unknown>) };
      }

      return { success: true, data: null };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseEmpresaRepository.findByDomainPublic', { details: { domain } });
      return { success: false, error: appError };
    }
  }

  async updateColores(empresaId: string, colores: EmpresaColores): Promise<Result<boolean>> {
    try {
      const { error } = await this.supabase
        .from('empresas')
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
        .eq('id', empresaId);

      if (error) {
        await logger.logAndReturnError(
          'DB_UPDATE_ERROR',
          error.message,
          'repository',
          'SupabaseEmpresaRepository.updateColores',
          { empresaId, details: { code: error.code } }
        );
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al actualizar colores', module: 'repository', method: 'updateColores' } };
      }

      return { success: true, data: true };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseEmpresaRepository.updateColores', { empresaId });
      return { success: false, error: appError };
    }
  }
}
