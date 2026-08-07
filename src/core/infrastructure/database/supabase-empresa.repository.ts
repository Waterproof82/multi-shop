import { Empresa, EmpresaColores, EmpresaPublic, Result } from "@/core/domain/entities/types";
import { DEFAULT_PEDIDOS_SUBDOMAIN } from "@/core/domain/constants/empresa-defaults";
import { IEmpresaRepository, UpdateEmpresaData } from "@/core/domain/repositories/IEmpresaRepository";
import { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "../logging/logger";
import { extractSlugFromBaseDomain, isBaseDomain } from "@/lib/domain-utils";
import { camposPresentes, camposTextoPresentes } from "./update-payload";

/**
 * Campos de texto: una cadena vacía se guarda como NULL.
 *
 * El formulario de admin manda `''` cuando el usuario borra un campo, y guardar
 * la cadena vacía dejaría `fb: ''` en vez de "sin Facebook" — que luego pinta un
 * enlace roto en el pie de la web pública.
 */
const CAMPOS_TEXTO = [
  'email_notification', 'telefono_whatsapp', 'fb', 'instagram', 'url_mapa',
  'direccion', 'nif', 'razon_social', 'logo_url', 'url_image', 'banner_fit',
  'descripcion_es', 'descripcion_en', 'descripcion_fr', 'descripcion_it', 'descripcion_de',
] as const satisfies ReadonlyArray<keyof UpdateEmpresaData>;

/**
 * Campos que viajan TAL CUAL, sin convertir lo falsy a NULL.
 *
 * Esta es la distinción que importa de toda la función: `false` y `0` son
 * valores legítimos aquí. Un `|| null` sobre `mostrar_promociones: false` lo
 * convertiría en NULL, y la columna volvería a su DEFAULT — es decir, apagar el
 * interruptor lo dejaría encendido. Lo mismo con un descuento del 0%.
 */
const CAMPOS_DIRECTOS = [
  'tipo_impuesto', 'porcentaje_impuesto', 'mostrar_logo', 'validacion_pedidos_habilitada',
  'mostrar_promociones', 'mostrar_tgtg', 'descuento_bienvenida_activo',
  'descuento_bienvenida_porcentaje', 'descuento_bienvenida_duracion', 'tipo',
] as const satisfies ReadonlyArray<keyof UpdateEmpresaData>;

/**
 * Payload de UPDATE con solo los campos presentes.
 *
 * `undefined` significa "no lo toques": una actualización parcial no puede
 * borrar lo que no venía en el formulario.
 */
export function construirPayloadEmpresa(data: UpdateEmpresaData): Record<string, unknown> {
  return {
    ...camposTextoPresentes(data, CAMPOS_TEXTO),
    ...camposPresentes(data, CAMPOS_DIRECTOS),
  };
}

export class SupabaseEmpresaRepository implements IEmpresaRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async getById(empresaId: string): Promise<Result<Partial<Empresa> | null>> {
    try {
      const { data: empresa } = await this.supabase
        .from('empresas')
        .select('email_notification, telefono_whatsapp, nombre, logo_url, mostrar_logo, fb, instagram, url_mapa, direccion, nif, tipo_impuesto, porcentaje_impuesto, dominio, slug, url_image, banner_fit, descripcion_es, descripcion_en, descripcion_fr, descripcion_it, descripcion_de, mostrar_carrito, mostrar_promociones, mostrar_tgtg, mesas_habilitadas, moneda, subdomain_pedidos, tipo, color_primary, color_primary_foreground, color_secondary, color_secondary_foreground, color_accent, color_accent_foreground, color_background, color_foreground, descuento_bienvenida_activo, descuento_bienvenida_porcentaje, descuento_bienvenida_duracion, delivery_habilitado, razon_social')
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
          tipo: (empresa.tipo as 'tienda' | 'restaurante' | null) ?? null,
          slug: (empresa.slug as string | null) ?? null,
          logoUrl: empresa.logo_url,
          mostrarLogo: empresa.mostrar_logo ?? true,
          mostrarCarrito: empresa.mostrar_carrito ?? false,
          mostrarPromociones: empresa.mostrar_promociones ?? true,
          mostrarTgtg: empresa.mostrar_tgtg ?? true,
          mesasHabilitadas: empresa.mesas_habilitadas ?? true,
          deliveryHabilitado: empresa.delivery_habilitado ?? false,
          moneda: empresa.moneda ?? 'EUR',
          emailNotification: empresa.email_notification,
          colores,
          fb: empresa.fb ?? null,
          instagram: empresa.instagram ?? null,
          urlMapa: empresa.url_mapa ?? null,
          direccion: empresa.direccion ?? null,
          nif: (empresa.nif as string | null) ?? null,
          tipoImpuesto: (empresa.tipo_impuesto as 'iva' | 'igic' | undefined) ?? 'iva',
          porcentajeImpuesto: (empresa.porcentaje_impuesto as number | undefined) ?? 10,
          telefonoWhatsapp: empresa.telefono_whatsapp ?? null,
          urlImage: empresa.url_image ?? null,
          bannerFit: (empresa.banner_fit as "contain" | "cover" | "fill" | null) ?? "contain",
          descuentoBienvenidaActivo: empresa.descuento_bienvenida_activo ?? false,
          descuentoBienvenidaPorcentaje: empresa.descuento_bienvenida_porcentaje ?? 5,
          descuentoBienvenidaDuracion: empresa.descuento_bienvenida_duracion ?? 30,
          razonSocial: (empresa.razon_social as string | null) ?? null,
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
      const updatePayload = construirPayloadEmpresa(data);

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

  async findByDomain(dominio: string): Promise<Result<{ id: string; nombre: string; email_notification: string | null; telefono_whatsapp: string | null; tipo: string; telegram_chat_id: string | null; mesas_habilitadas: boolean; pagos_pickup_habilitados: boolean; validacion_pedidos_habilitada: boolean } | null>> {
    try {
      const { data: empresa } = await this.supabase
        .from('empresas')
        .select('id, nombre, email_notification, telefono_whatsapp, tipo, telegram_chat_id, mesas_habilitadas, pagos_pickup_habilitados, validacion_pedidos_habilitada')
        .eq('dominio', dominio)
        .single();

      if (empresa) return { success: true, data: {
        id: empresa.id as string,
        nombre: empresa.nombre as string,
        email_notification: empresa.email_notification as string | null,
        telefono_whatsapp: empresa.telefono_whatsapp as string | null,
        tipo: (empresa.tipo as string) ?? 'tienda',
        telegram_chat_id: empresa.telegram_chat_id as string | null,
        mesas_habilitadas: (empresa.mesas_habilitadas as boolean) ?? true,
        pagos_pickup_habilitados: (empresa.pagos_pickup_habilitados as boolean) ?? false,
        validacion_pedidos_habilitada: (empresa.validacion_pedidos_habilitada as boolean) ?? false,
      }};

      const isPedidos = dominio.startsWith(`${DEFAULT_PEDIDOS_SUBDOMAIN}.`) || dominio.endsWith('-pedidos');

      if (isPedidos) {
        const mainDomainFromSubdomain = dominio.split('.').slice(1).join('.');
        const { data: empresaSubdomain } = await this.supabase
          .from('empresas')
          .select('id, nombre, email_notification, telefono_whatsapp, tipo, telegram_chat_id, mesas_habilitadas, pagos_pickup_habilitados, validacion_pedidos_habilitada')
          .eq('dominio', mainDomainFromSubdomain)
          .single();

        return { success: true, data: empresaSubdomain ? {
          id: empresaSubdomain.id as string,
          nombre: empresaSubdomain.nombre as string,
          email_notification: empresaSubdomain.email_notification as string | null,
          telefono_whatsapp: empresaSubdomain.telefono_whatsapp as string | null,
          tipo: (empresaSubdomain.tipo as string) ?? 'tienda',
          telegram_chat_id: empresaSubdomain.telegram_chat_id as string | null,
          mesas_habilitadas: (empresaSubdomain.mesas_habilitadas as boolean) ?? true,
          pagos_pickup_habilitados: (empresaSubdomain.pagos_pickup_habilitados as boolean) ?? false,
          validacion_pedidos_habilitada: (empresaSubdomain.validacion_pedidos_habilitada as boolean) ?? false,
        } : null };
      }

      const slug = isBaseDomain(dominio) ? extractSlugFromBaseDomain(dominio) : null;
      if (slug) {
        const { data: slugEmpresa } = await this.supabase
          .from('empresas')
          .select('id, nombre, email_notification, telefono_whatsapp, tipo, telegram_chat_id, mesas_habilitadas, pagos_pickup_habilitados, validacion_pedidos_habilitada')
          .eq('slug', slug)
          .maybeSingle();

        return { success: true, data: slugEmpresa ? {
          id: slugEmpresa.id as string,
          nombre: slugEmpresa.nombre as string,
          email_notification: slugEmpresa.email_notification as string | null,
          telefono_whatsapp: slugEmpresa.telefono_whatsapp as string | null,
          tipo: (slugEmpresa.tipo as string) ?? 'tienda',
          telegram_chat_id: slugEmpresa.telegram_chat_id as string | null,
          mesas_habilitadas: (slugEmpresa.mesas_habilitadas as boolean) ?? true,
          pagos_pickup_habilitados: (slugEmpresa.pagos_pickup_habilitados as boolean) ?? false,
          validacion_pedidos_habilitada: (slugEmpresa.validacion_pedidos_habilitada as boolean) ?? false,
        } : null };
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
    id, nombre, dominio, tipo, mostrar_carrito, moneda, subdomain_pedidos,
    logo_url, mostrar_logo, url_image, banner_fit,
    color_primary, color_primary_foreground, color_secondary, color_secondary_foreground,
    color_accent, color_accent_foreground, color_background, color_foreground,
    descripcion_es, descripcion_en, descripcion_fr, descripcion_it, descripcion_de,
    titulo, subtitulo,
    subtitulo2_es, subtitulo2_en, subtitulo2_fr, subtitulo2_it, subtitulo2_de,
    footer1_es, footer1_en, footer1_fr, footer1_it, footer1_de,
    footer2_es, footer2_en, footer2_fr, footer2_it, footer2_de,
    fb, instagram, url_mapa,
    direccion, telefono_whatsapp, email_notification, nif, razon_social,
    descuento_bienvenida_activo, descuento_bienvenida_porcentaje, descuento_bienvenida_duracion,
    mesas_habilitadas, pagos_pickup_habilitados, delivery_habilitado
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
      tipo: (data.tipo as string | null) ?? null,
      mostrarCarrito: (data.mostrar_carrito as boolean) ?? false,
      moneda: (data.moneda as string) ?? 'EUR',
      subdomainPedidos: (data.subdomain_pedidos as string | null) ?? null,
      logoUrl: (data.logo_url as string | null) ?? null,
      mostrarLogo: (data.mostrar_logo as boolean) ?? true,
      urlImage: (data.url_image as string | null) ?? null,
      bannerFit: (data.banner_fit as "contain" | "cover" | "fill" | null) ?? "contain",
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
      nif: (data.nif as string | null) ?? null,
      razonSocial: (data.razon_social as string | null) ?? null,
      descuentoBienvenidaActivo: (data.descuento_bienvenida_activo as boolean) ?? false,
      descuentoBienvenidaPorcentaje: Number(data.descuento_bienvenida_porcentaje ?? 5),
      descuentoBienvenidaDuracion: Number(data.descuento_bienvenida_duracion ?? 30),
      mesasHabilitadas: (data.mesas_habilitadas as boolean) ?? true,
      pagosPickupHabilitados: (data.pagos_pickup_habilitados as boolean) ?? false,
      deliveryHabilitado: (data.delivery_habilitado as boolean) ?? false,
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

      const slug = isBaseDomain(domain) ? extractSlugFromBaseDomain(domain) : null;
      if (slug) {
        const { data: slugData } = await this.supabase
          .from('empresas')
          .select(SupabaseEmpresaRepository.PUBLIC_SELECT)
          .eq('slug', slug)
          .maybeSingle();

        if (slugData) return { success: true, data: SupabaseEmpresaRepository.mapToEmpresaPublic(slugData as Record<string, unknown>) };
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

  async updateWaiterPin(empresaId: string, pinHash: string): Promise<Result<void>> {
    try {
      const { error } = await this.supabase
        .from('empresas')
        .update({ waiter_pin_hash: pinHash })
        .eq('id', empresaId);

      if (error) {
        await logger.logAndReturnError(
          'DB_UPDATE_ERROR',
          error.message,
          'repository',
          'SupabaseEmpresaRepository.updateWaiterPin',
          { empresaId, details: { code: error.code } }
        );
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al actualizar PIN', module: 'repository', method: 'updateWaiterPin' } };
      }

      return { success: true, data: undefined };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseEmpresaRepository.updateWaiterPin', { empresaId });
      return { success: false, error: appError };
    }
  }
}
