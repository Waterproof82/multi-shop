import type { IEmpresaLegalRepository, DatosEmpresaLegal } from '@/core/domain/repositories/IEmpresaLegalRepository';
import type { IModalidadEntregaRepository } from '@/core/domain/repositories/IModalidadEntregaRepository';
import type { Result } from '@/core/domain/entities/types';
import {
  EMPRESA_LEGAL_POR_DEFECTO,
  type EmpresaLegal,
  type LegalContext,
  type ModalidadDomicilioLegal,
} from '@/core/domain/entities/empresa-legal';
import type { UpdateEmpresaLegalDTO } from '@/core/application/dtos/empresa-legal.dto';
import { logger } from '@/core/infrastructure/logging/logger';

function propagar<T>(r: { success: false; error: { code: string; message: string } }, method: string): Result<T> {
  return { success: false, error: { code: r.error.code, message: r.error.message, module: 'use-case', method } };
}

function construirContexto(
  empresaId: string,
  d: DatosEmpresaLegal,
  legal: EmpresaLegal,
  modalidadesDomicilio: ModalidadDomicilioLegal[]
): LegalContext {
  return {
    empresaId,
    tipo: d.tipo,
    moneda: d.moneda,
    tipoImpuesto: d.tipoImpuesto,
    titular: {
      nombre: d.razonSocial ?? d.nombre,
      nif: d.nif,
      direccion: d.direccion,
      email: legal.emailLegal ?? d.emailNotification,
      telefono: d.telefono,
      registroMercantil: legal.registroMercantil,
    },
    flags: {
      deliveryHabilitado: d.deliveryHabilitado,
      envioDomicilioHabilitado: d.envioDomicilioHabilitado,
      descuentoBienvenidaActivo: d.descuentoBienvenidaActivo,
      pagoTarjetaActivo: d.pagoTarjetaActivo,
      tpvHabilitado: d.tpvHabilitado,
    },
    direccionDevoluciones: legal.direccionDevoluciones ?? d.direccion,
    legal,
    modalidadesDomicilio,
  };
}

export class EmpresaLegalUseCase {
  constructor(
    private readonly repo: IEmpresaLegalRepository,
    private readonly modalidades: IModalidadEntregaRepository
  ) {}

  async get(empresaId: string): Promise<Result<EmpresaLegal>> {
    const method = 'EmpresaLegalUseCase.get';
    try {
      const r = await this.repo.findByEmpresa(empresaId);
      if (!r.success) return propagar(r, method);
      return { success: true, data: r.data ?? EMPRESA_LEGAL_POR_DEFECTO };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'use-case', method, { empresaId }) };
    }
  }

  async update(empresaId: string, dto: UpdateEmpresaLegalDTO): Promise<Result<EmpresaLegal>> {
    const method = 'EmpresaLegalUseCase.update';
    try {
      const r = await this.repo.upsert(empresaId, dto);
      if (!r.success) return propagar(r, method);
      return { success: true, data: r.data };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'use-case', method, { empresaId }) };
    }
  }

  private async modalidadesDomicilio(empresaId: string): Promise<ModalidadDomicilioLegal[]> {
    const r = await this.modalidades.findActivasPublicas(empresaId);
    // Sin modalidades la página de envíos sigue siendo válida (sin tabla):
    // no tumbamos /envios-y-pagos por un fallo transitorio de esta lectura.
    if (!r.success) return [];
    return r.data
      .filter((m) => m.tipo === 'domicilio')
      .map((m) => ({ nombre: m.nombre, precioCents: m.precioCents, tiempoMin: m.tiempoMinMinutos, tiempoMax: m.tiempoMaxMinutos }));
  }

  async getContext(empresaId: string): Promise<Result<LegalContext>> {
    const method = 'EmpresaLegalUseCase.getContext';
    try {
      const [datos, legal, modalidades] = await Promise.all([
        this.repo.findDatosEmpresa(empresaId),
        this.repo.findByEmpresa(empresaId),
        this.modalidadesDomicilio(empresaId),
      ]);
      if (!datos.success) return propagar(datos, method);
      if (!legal.success) return propagar(legal, method);
      if (datos.data === null) {
        return { success: false, error: { code: 'NOT_FOUND', message: 'Empresa no encontrada', module: 'use-case', method } };
      }
      return { success: true, data: construirContexto(empresaId, datos.data, legal.data ?? EMPRESA_LEGAL_POR_DEFECTO, modalidades) };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'use-case', method, { empresaId }) };
    }
  }
}
