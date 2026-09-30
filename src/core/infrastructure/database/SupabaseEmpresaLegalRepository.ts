import { SupabaseClient } from '@supabase/supabase-js';
import type { DatosEmpresaLegal, IEmpresaLegalRepository } from '@/core/domain/repositories/IEmpresaLegalRepository';
import type { EmpresaLegal } from '@/core/domain/entities/empresa-legal';
import type { Result } from '@/core/domain/entities/types';
import { parseExclusionesGuardadas, parseGarantiasGuardadas } from '@/core/application/dtos/empresa-legal.dto';
import { logger } from '../logging/logger';

const COLUMNAS_EMPRESA =
  'nombre, razon_social, nif, direccion, telefono_whatsapp, email_notification, tipo, moneda, tipo_impuesto, delivery_habilitado, envio_domicilio_habilitado, descuento_bienvenida_activo, redsys_merchant_code';

const ES_TRANSITORIO = /timeout|gateway/i;

function mapLegal(row: Record<string, unknown>): EmpresaLegal {
  return {
    registroMercantil: (row.registro_mercantil as string | null) ?? null,
    emailLegal: (row.email_legal as string | null) ?? null,
    direccionDevoluciones: (row.direccion_devoluciones as string | null) ?? null,
    plazoDesistimientoDias: row.plazo_desistimiento_dias as number,
    gastosDevolucion: row.gastos_devolucion === 'empresa' ? 'empresa' : 'cliente',
    plazoPreparacionDias: (row.plazo_preparacion_dias as number | null) ?? null,
    plazoAvisoDanosHoras: (row.plazo_aviso_danos_horas as number | null) ?? null,
    garantias: parseGarantiasGuardadas(row.garantias),
    exclusionesDesistimiento: parseExclusionesGuardadas(row.exclusiones_desistimiento),
    adicionalAvisoLegal: (row.adicional_aviso_legal as string | null) ?? null,
    adicionalCondiciones: (row.adicional_condiciones as string | null) ?? null,
    adicionalEnvios: (row.adicional_envios as string | null) ?? null,
    adicionalDevoluciones: (row.adicional_devoluciones as string | null) ?? null,
  };
}

function toRow(empresaId: string, d: EmpresaLegal): Record<string, unknown> {
  return {
    empresa_id: empresaId,
    registro_mercantil: d.registroMercantil,
    email_legal: d.emailLegal,
    direccion_devoluciones: d.direccionDevoluciones,
    plazo_desistimiento_dias: d.plazoDesistimientoDias,
    gastos_devolucion: d.gastosDevolucion,
    plazo_preparacion_dias: d.plazoPreparacionDias,
    plazo_aviso_danos_horas: d.plazoAvisoDanosHoras,
    garantias: d.garantias,
    exclusiones_desistimiento: d.exclusionesDesistimiento,
    adicional_aviso_legal: d.adicionalAvisoLegal,
    adicional_condiciones: d.adicionalCondiciones,
    adicional_envios: d.adicionalEnvios,
    adicional_devoluciones: d.adicionalDevoluciones,
    updated_at: new Date().toISOString(),
  };
}

function mapDatosEmpresa(row: Record<string, unknown>): DatosEmpresaLegal {
  const tipo = row.tipo === 'tienda' || row.tipo === 'restaurante' ? row.tipo : null;
  return {
    nombre: row.nombre as string,
    razonSocial: (row.razon_social as string | null) ?? null,
    nif: (row.nif as string | null) ?? null,
    direccion: (row.direccion as string | null) ?? null,
    telefono: (row.telefono_whatsapp as string | null) ?? null,
    emailNotification: (row.email_notification as string | null) ?? null,
    tipo,
    moneda: (row.moneda as string | null) ?? 'EUR',
    tipoImpuesto: row.tipo_impuesto === 'igic' ? 'igic' : 'iva',
    deliveryHabilitado: Boolean(row.delivery_habilitado),
    envioDomicilioHabilitado: Boolean(row.envio_domicilio_habilitado),
    descuentoBienvenidaActivo: Boolean(row.descuento_bienvenida_activo),
    pagoTarjetaActivo: Boolean(row.redsys_merchant_code),
  };
}

function errorDb(method: string, message: string): Result<never> {
  return { success: false, error: { code: 'DB_ERROR', message, module: 'repository', method } };
}

export class SupabaseEmpresaLegalRepository implements IEmpresaLegalRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  private async selectLegal(empresaId: string) {
    return this.supabase.from('empresa_legal').select('*').eq('empresa_id', empresaId).maybeSingle();
  }

  async findByEmpresa(empresaId: string): Promise<Result<EmpresaLegal | null>> {
    const method = 'SupabaseEmpresaLegalRepository.findByEmpresa';
    try {
      // SELECT puro: seguro de reintentar una vez ante el ruido de PostgREST.
      let { data, error } = await this.selectLegal(empresaId);
      if (error && ES_TRANSITORIO.test(error.message)) ({ data, error } = await this.selectLegal(empresaId));
      if (error) {
        await logger.logAndReturnError('DB_SELECT_ERROR', error.message, 'repository', method, { empresaId, details: { code: error.code } });
        return errorDb(method, 'Error al obtener los datos legales');
      }
      return { success: true, data: data ? mapLegal(data) : null };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'repository', method, { empresaId }) };
    }
  }

  async upsert(empresaId: string, d: EmpresaLegal): Promise<Result<EmpresaLegal>> {
    const method = 'SupabaseEmpresaLegalRepository.upsert';
    try {
      const { data, error } = await this.supabase
        .from('empresa_legal')
        .upsert(toRow(empresaId, d), { onConflict: 'empresa_id' })
        .select('*')
        .single();
      if (error) {
        await logger.logAndReturnError('DB_UPDATE_ERROR', error.message, 'repository', method, { empresaId, details: { code: error.code } });
        return errorDb(method, 'Error al guardar los datos legales');
      }
      return { success: true, data: mapLegal(data) };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'repository', method, { empresaId }) };
    }
  }

  async findDatosEmpresa(empresaId: string): Promise<Result<DatosEmpresaLegal | null>> {
    const method = 'SupabaseEmpresaLegalRepository.findDatosEmpresa';
    try {
      const { data, error } = await this.supabase.from('empresas').select(COLUMNAS_EMPRESA).eq('id', empresaId).maybeSingle();
      if (error) {
        await logger.logAndReturnError('DB_SELECT_ERROR', error.message, 'repository', method, { empresaId, details: { code: error.code } });
        return errorDb(method, 'Error al obtener la empresa');
      }
      return { success: true, data: data ? mapDatosEmpresa(data as Record<string, unknown>) : null };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'repository', method, { empresaId }) };
    }
  }
}
