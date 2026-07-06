export interface PrintTicket {
  empresaNombre: string;
  empresaNif: string | null;
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
}

export interface ThermalPrinter {
  print(ticket: PrintTicket): Promise<void>;
}
