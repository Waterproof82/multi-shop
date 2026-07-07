import type { ThermalPrinter } from 'node-thermal-printer';

export interface ReceiptData {
  empresa: {
    nombre: string;
    nif: string;
    direccion: string;
  };
  ticket: {
    serie: string;        // ej: "T-000042"
    fecha: string;        // ISO 8601, zona Europe/Madrid
    operador: string;
  };
  items: Array<{
    nombre: string;
    cantidad: number;
    precioUnitarioCents: number;
    subtotalCents: number;
  }>;
  totales: {
    baseImponibleCents: number;
    tipoImpuesto: 'iva' | 'igic';
    porcentajeImpuesto: number;
    impuestoCents: number;
    totalCents: number;
  };
  aeatUrl: string;
  esCobro: boolean;
  rectificaNumero?: string;
}

function centsToEur(cents: number): string {
  return (cents / 100).toFixed(2);
}

function padEnd(str: string, len: number): string {
  return str.length >= len ? str.slice(0, len) : str + ' '.repeat(len - str.length);
}

function padStart(str: string, len: number): string {
  return str.length >= len ? str.slice(-len) : ' '.repeat(len - str.length) + str;
}

const LINE_WIDTH = 48;

export async function buildAndPrint(
  printer: ThermalPrinter,
  data: ReceiptData,
): Promise<void> {
  // 1. Cabecera
  printer.alignCenter();
  printer.bold(true);
  printer.println(data.empresa.nombre);
  printer.bold(false);
  printer.println(`NIF: ${data.empresa.nif}`);
  printer.println(data.empresa.direccion);

  const fecha = new Date(data.ticket.fecha).toLocaleString('es-ES', {
    timeZone: 'Europe/Madrid',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  printer.println(fecha);

  if (!data.esCobro && data.rectificaNumero) {
    printer.println(`RECTIFICATIVO de ${data.rectificaNumero}`);
  }

  // 2. Separador
  printer.drawLine();

  // 3. Items
  printer.alignLeft();
  for (const item of data.items) {
    const precio = `${item.cantidad}x${centsToEur(item.precioUnitarioCents)}`;
    const sub = centsToEur(item.subtotalCents);
    const leftWidth = LINE_WIDTH - precio.length - sub.length - 2;
    const left = padEnd(item.nombre, leftWidth);
    printer.println(`${left} ${precio} ${padStart(sub, sub.length)}`);
  }

  // 4. Separador
  printer.drawLine();

  // 5. Totales
  printer.alignRight();
  printer.println(`Base imponible: ${centsToEur(data.totales.baseImponibleCents)} EUR`);
  printer.println(
    `${data.totales.tipoImpuesto.toUpperCase()} (${data.totales.porcentajeImpuesto}%): ${centsToEur(data.totales.impuestoCents)} EUR`,
  );
  printer.bold(true);
  printer.println(`TOTAL: ${centsToEur(data.totales.totalCents)} EUR`);
  printer.bold(false);

  // 6. QR code verificación AEAT
  printer.alignCenter();
  printer.printQR(data.aeatUrl, {
    cellSize: 3,
    correction: 'M',
    model: 2,
  });
  printer.println(data.aeatUrl);

  // 7. Pie
  printer.println('');
  printer.println(data.ticket.serie);
  printer.println(`Operador: ${data.ticket.operador}`);
  printer.println('Conserve este ticket. IVA incluido RD 1619/2012');

  // 8. Cut
  printer.cut();

  await printer.execute();
}
