import { EMPRESA_LEGAL_POR_DEFECTO, type LegalContext, type FlagsLegales, type EmpresaLegal } from '@/core/domain/entities/empresa-legal';

interface Overrides extends Partial<Omit<LegalContext, 'flags' | 'legal'>> {
  flags?: Partial<FlagsLegales>;
  legal?: Partial<EmpresaLegal>;
}

export function contextoDePrueba(o: Overrides = {}): LegalContext {
  const { flags, legal, ...resto } = o;
  return {
    empresaId: 'e1',
    tipo: 'tienda',
    moneda: 'EUR',
    tipoImpuesto: 'iva',
    titular: {
      nombre: 'Tienda de Prueba S.L.', nif: 'B00000000', direccion: 'Calle Mayor 1, 38300 La Orotava',
      email: 'legal@tienda.test', telefono: '922000000', registroMercantil: null,
    },
    direccionDevoluciones: 'Calle Mayor 1, 38300 La Orotava',
    modalidadesDomicilio: [],
    ...resto,
    flags: { deliveryHabilitado: false, envioDomicilioHabilitado: false, descuentoBienvenidaActivo: false, pagoTarjetaActivo: false, tpvHabilitado: true, ...flags },
    legal: { ...EMPRESA_LEGAL_POR_DEFECTO, ...legal },
  };
}
