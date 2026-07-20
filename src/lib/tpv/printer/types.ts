export interface PrintTicketDesgloseItem {
  porcentaje: number;
  baseImponibleCents: number;
  impuestoCents: number;
}

export interface PrintTicket {
  empresaNombre: string;
  empresaNif: string | null;
  razonSocial?: string | null;
  mesaNumero: number;
  operadorNombre: string;
  serie: string;
  numeroTicket: number;
  hash: string;
  metodoPago: 'efectivo' | 'tarjeta';
  importeCobradoCents: number;
  propinaCents: number;
  baseImponibleCents: number;
  ivaPorcentaje: number;
  ivaCents: number;
  cobradoAt: string;
  entregadoCents: number;
  tipoImpuesto: 'iva' | 'igic';
  desgloseImpuesto?: PrintTicketDesgloseItem[] | null;
}

export interface ThermalPrinter {
  print(ticket: PrintTicket): Promise<void>;
}
