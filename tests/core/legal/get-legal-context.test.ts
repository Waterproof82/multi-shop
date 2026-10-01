import { describe, it, expect, vi } from 'vitest';
import { EmpresaLegalUseCase } from '@/core/application/use-cases/empresa-legal.use-case';
import type { IEmpresaLegalRepository, DatosEmpresaLegal } from '@/core/domain/repositories/IEmpresaLegalRepository';
import type { IModalidadEntregaRepository } from '@/core/domain/repositories/IModalidadEntregaRepository';
import { EMPRESA_LEGAL_POR_DEFECTO } from '@/core/domain/entities/empresa-legal';
import type { ModalidadEntrega } from '@/core/domain/entities/types';

const datos: DatosEmpresaLegal = {
  nombre: 'La Tienda', razonSocial: null, nif: 'B00000000', direccion: 'Calle Mayor 1',
  telefono: '600000000', emailNotification: 'hola@latienda.test', tipo: 'tienda', moneda: 'EUR',
  tipoImpuesto: 'igic', deliveryHabilitado: false, envioDomicilioHabilitado: true,
  descuentoBienvenidaActivo: false, pagoTarjetaActivo: true, tpvHabilitado: false,
};

const modalidad = (over: Partial<ModalidadEntrega>): ModalidadEntrega => ({
  id: 'm', empresaId: 'e1', tipo: 'domicilio', icono: 'package', nombre: 'Tenerife',
  precioCents: 1500, tiempoMinMinutos: 24, tiempoMaxMinutos: 48, activo: true, orden: 0, ...over,
});

function repos(over: { legal?: Partial<IEmpresaLegalRepository>; modalidades?: ModalidadEntrega[] } = {}) {
  const legal: IEmpresaLegalRepository = {
    findByEmpresa: vi.fn().mockResolvedValue({ success: true, data: null }),
    upsert: vi.fn(),
    findDatosEmpresa: vi.fn().mockResolvedValue({ success: true, data: datos }),
    ...over.legal,
  };
  const modalidadesRepo = {
    findActivasPublicas: vi.fn().mockResolvedValue({ success: true, data: over.modalidades ?? [] }),
  } as unknown as IModalidadEntregaRepository;
  return new EmpresaLegalUseCase(legal, modalidadesRepo);
}

describe('EmpresaLegalUseCase.getContext', () => {
  it('sin fila legal → defaults y fallbacks de empresa', async () => {
    const r = await repos().getContext('e1');
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.legal).toEqual(EMPRESA_LEGAL_POR_DEFECTO);
    expect(r.data.titular.nombre).toBe('La Tienda'); // razonSocial null → nombre
    expect(r.data.titular.email).toBe('hola@latienda.test'); // emailLegal null → emailNotification
    expect(r.data.direccionDevoluciones).toBe('Calle Mayor 1'); // null → direccion
    expect(r.data.tipoImpuesto).toBe('igic');
    expect(r.data.flags.pagoTarjetaActivo).toBe(true);
    expect(r.data.flags.tpvHabilitado).toBe(false);
  });

  it('los datos legales propios prevalecen sobre los de empresa', async () => {
    const r = await repos({
      legal: {
        findByEmpresa: vi.fn().mockResolvedValue({
          success: true,
          data: { ...EMPRESA_LEGAL_POR_DEFECTO, emailLegal: 'legal@x.test', direccionDevoluciones: 'Almacén 3', registroMercantil: 'RM TF' },
        }),
        findDatosEmpresa: vi.fn().mockResolvedValue({ success: true, data: { ...datos, razonSocial: 'Tienda S.L.' } }),
      },
    }).getContext('e1');
    if (!r.success) throw new Error('esperaba éxito');
    expect(r.data.titular).toMatchObject({ nombre: 'Tienda S.L.', email: 'legal@x.test', registroMercantil: 'RM TF' });
    expect(r.data.direccionDevoluciones).toBe('Almacén 3');
  });

  it('solo incluye modalidades de domicilio, en su orden', async () => {
    const r = await repos({
      modalidades: [modalidad({ nombre: 'Recogida', tipo: 'recogida' }), modalidad({ nombre: 'Las Palmas', precioCents: 2500 })],
    }).getContext('e1');
    if (!r.success) throw new Error('esperaba éxito');
    expect(r.data.modalidadesDomicilio).toEqual([{ nombre: 'Las Palmas', precioCents: 2500, tiempoMin: 24, tiempoMax: 48 }]);
  });

  it('si fallan las modalidades, la página sigue (lista vacía)', async () => {
    const r = await new EmpresaLegalUseCase(
      { findByEmpresa: vi.fn().mockResolvedValue({ success: true, data: null }), upsert: vi.fn(), findDatosEmpresa: vi.fn().mockResolvedValue({ success: true, data: datos }) },
      { findActivasPublicas: vi.fn().mockResolvedValue({ success: false, error: { code: 'DB_ERROR', message: 'x' } }) } as unknown as IModalidadEntregaRepository,
    ).getContext('e1');
    if (!r.success) throw new Error('esperaba éxito');
    expect(r.data.modalidadesDomicilio).toEqual([]);
  });

  it('empresa inexistente → NOT_FOUND', async () => {
    const r = await repos({ legal: { findDatosEmpresa: vi.fn().mockResolvedValue({ success: true, data: null }) } }).getContext('e1');
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(r.error.code).toBe('NOT_FOUND');
  });

  it('error leyendo datos legales se propaga', async () => {
    const r = await repos({
      legal: { findByEmpresa: vi.fn().mockResolvedValue({ success: false, error: { code: 'DB_ERROR', message: 'x' } }) },
    }).getContext('e1');
    expect(r.success).toBe(false);
  });
});

describe('EmpresaLegalUseCase.get', () => {
  it('sin fila devuelve los defaults (el formulario arranca relleno)', async () => {
    const r = await repos().get('e1');
    expect(r).toEqual({ success: true, data: EMPRESA_LEGAL_POR_DEFECTO });
  });
});
