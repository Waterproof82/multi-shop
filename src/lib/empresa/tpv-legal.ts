/**
 * Consecuencias legales de que un tenant use o no el TPV.
 *
 * El TPV es lo ÚNICO que emite facturas/tickets en este sistema (la web solo
 * manda confirmaciones de pedido). Sin TPV:
 *  - VeriFactu no aplica a este sistema: factura su programa externo.
 *  - No hay registro de jornada (los fichajes viven dentro del TPV).
 *  - Los pedidos no son registros fiscales aquí, así que los datos personales
 *    de los clientes se guardan menos: 3 años, lo que dura la garantía legal
 *    (art. 120 TRLGDCU), para poder atender una reclamación.
 */

export const RETENCION_CLIENTES_CON_TPV_ANIOS = 5;
export const RETENCION_CLIENTES_SIN_TPV_ANIOS = 3;

export function retencionClientesAnios(tpvHabilitado: boolean): number {
  return tpvHabilitado ? RETENCION_CLIENTES_CON_TPV_ANIOS : RETENCION_CLIENTES_SIN_TPV_ANIOS;
}

export type EstadoLegal = 'activo' | 'inactivo' | 'aviso';

export interface LineaLegal {
  readonly estado: EstadoLegal;
  readonly texto: string;
}

export interface ResumenLegalEmpresa {
  readonly facturacion: LineaLegal;
  readonly registroJornada: LineaLegal;
  readonly retencionClientes: LineaLegal;
}

interface EntradaResumen {
  readonly tpvHabilitado: boolean;
  readonly verifactuMode: string | null;
}

export function resumenLegalEmpresa({ tpvHabilitado, verifactuMode }: EntradaResumen): ResumenLegalEmpresa {
  const retencionClientes: LineaLegal = {
    estado: 'activo',
    texto: `Se anonimizan a los ${retencionClientesAnios(tpvHabilitado)} años sin actividad`,
  };
  if (!tpvHabilitado) {
    return {
      facturacion: { estado: 'inactivo', texto: 'Programa externo (la web solo confirma pedidos)' },
      registroJornada: {
        estado: 'aviso',
        texto: 'No disponible: si tiene empleados, debe registrar la jornada con otra herramienta',
      },
      retencionClientes,
    };
  }
  return {
    facturacion: { estado: 'activo', texto: `Este sistema (TPV) · VeriFactu: ${verifactuMode ?? 'sin configurar'}` },
    registroJornada: { estado: 'activo', texto: 'Activo (dentro del TPV)' },
    retencionClientes,
  };
}
