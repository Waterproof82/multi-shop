import type { CodigoArt103 } from '@/core/domain/legal/constantes';
import { MIN_DESISTIMIENTO_DIAS } from '@/core/domain/legal/constantes';

export type EstadoProducto = 'nuevo' | 'segunda_mano';
export type GastosDevolucion = 'cliente' | 'empresa';

/** Se guarda tal cual (camelCase) dentro del JSONB `empresa_legal.garantias`. */
export interface GarantiaFila {
  ambito: string;
  estado: EstadoProducto;
  mesesLegales: number;
  mesesComercialesExtra: number;
}

export interface ExclusionesDesistimiento {
  supuestos: CodigoArt103[];
  otras: string | null;
}

export interface EmpresaLegal {
  registroMercantil: string | null;
  emailLegal: string | null;
  direccionDevoluciones: string | null;
  plazoDesistimientoDias: number;
  gastosDevolucion: GastosDevolucion;
  plazoPreparacionDias: number | null;
  plazoAvisoDanosHoras: number | null;
  garantias: GarantiaFila[];
  exclusionesDesistimiento: ExclusionesDesistimiento;
  adicionalAvisoLegal: string | null;
  adicionalCondiciones: string | null;
  adicionalEnvios: string | null;
  adicionalDevoluciones: string | null;
}

/** Lo que tiene un tenant que no ha rellenado nada: las páginas funcionan igual. */
export const EMPRESA_LEGAL_POR_DEFECTO: EmpresaLegal = {
  registroMercantil: null,
  emailLegal: null,
  direccionDevoluciones: null,
  plazoDesistimientoDias: MIN_DESISTIMIENTO_DIAS,
  gastosDevolucion: 'cliente',
  plazoPreparacionDias: null,
  plazoAvisoDanosHoras: null,
  garantias: [],
  exclusionesDesistimiento: { supuestos: [], otras: null },
  adicionalAvisoLegal: null,
  adicionalCondiciones: null,
  adicionalEnvios: null,
  adicionalDevoluciones: null,
};

export interface FlagsLegales {
  deliveryHabilitado: boolean;
  envioDomicilioHabilitado: boolean;
  descuentoBienvenidaActivo: boolean;
  pagoTarjetaActivo: boolean;
}

export interface ModalidadDomicilioLegal {
  nombre: string;
  precioCents: number;
  /** HORAS, pese al nombre de la columna (ver plan). */
  tiempoMin: number | null;
  tiempoMax: number | null;
}

/** Todo lo que necesita una página legal, con los fallbacks YA aplicados. */
export interface LegalContext {
  empresaId: string;
  tipo: 'tienda' | 'restaurante' | null;
  moneda: string;
  tipoImpuesto: 'iva' | 'igic';
  titular: {
    nombre: string;
    nif: string | null;
    direccion: string | null;
    email: string | null;
    telefono: string | null;
    registroMercantil: string | null;
  };
  flags: FlagsLegales;
  direccionDevoluciones: string | null;
  legal: EmpresaLegal;
  modalidadesDomicilio: ModalidadDomicilioLegal[];
}
