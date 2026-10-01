import type { Result } from '@/core/domain/entities/types';
import type { EmpresaLegal } from '@/core/domain/entities/empresa-legal';

/** Lo que las páginas legales necesitan de `empresas`. Nunca incluye secretos. */
export interface DatosEmpresaLegal {
  nombre: string;
  razonSocial: string | null;
  nif: string | null;
  direccion: string | null;
  telefono: string | null;
  emailNotification: string | null;
  tipo: 'tienda' | 'restaurante' | null;
  moneda: string;
  tipoImpuesto: 'iva' | 'igic';
  deliveryHabilitado: boolean;
  envioDomicilioHabilitado: boolean;
  descuentoBienvenidaActivo: boolean;
  /** Derivado de `redsys_merchant_code IS NOT NULL`; el código nunca sale del repo. */
  pagoTarjetaActivo: boolean;
  tpvHabilitado: boolean;
}

export interface IEmpresaLegalRepository {
  findByEmpresa(empresaId: string): Promise<Result<EmpresaLegal | null>>;
  upsert(empresaId: string, data: EmpresaLegal): Promise<Result<EmpresaLegal>>;
  findDatosEmpresa(empresaId: string): Promise<Result<DatosEmpresaLegal | null>>;
}
