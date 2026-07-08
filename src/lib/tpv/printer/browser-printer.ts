import type { PrintTicket, ThermalPrinter } from './types';

function fmt(cents: number): string {
  return (cents / 100).toLocaleString('es-ES', { minimumFractionDigits: 2 }) + ' \u20ac';
}

function buildReceiptHtml(ticket: PrintTicket): string {
  const dt = new Date(ticket.cobradoAt);
  const fecha = dt.toLocaleDateString('es-ES');
  const hora = dt.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  const serieNum = `${ticket.serie}-${String(ticket.numeroTicket).padStart(6, '0')}`;
  const cambio = ticket.metodoPago === 'efectivo'
    ? Math.max(0, ticket.entregadoCents - ticket.importeCobradoCents)
    : 0;
  const labelImpuesto = ticket.tipoImpuesto.toUpperCase();

  const aeatBlock = ticket.empresaNif
    ? `<tr><td colspan="2" style="padding-top:8px;word-break:break-all;font-size:9px;color:#555">
        AEAT: https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR?nif=${ticket.empresaNif}&amp;numserie=${serieNum}&amp;fecha=${fecha.split('/').reverse().join('-')}&amp;importe=${(ticket.importeCobradoCents / 100).toFixed(2)}
       </td></tr>`
    : '';

  const propinaRow = ticket.propinaCents > 0
    ? `<tr><td>Propina</td><td style="text-align:right">${fmt(ticket.propinaCents)}</td></tr>`
    : '';

  const cambioRow = ticket.metodoPago === 'efectivo' && ticket.entregadoCents > 0
    ? `<tr><td>Entregado</td><td style="text-align:right">${fmt(ticket.entregadoCents)}</td></tr>
       <tr><td>Cambio</td><td style="text-align:right">${fmt(cambio)}</td></tr>`
    : '';

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8"/>
<style>
  @page { size: 80mm auto; margin: 4mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Courier New', monospace; font-size: 11px; width: 72mm; margin: 0 auto; }
  h1 { font-size: 14px; text-align: center; margin: 0 0 2px; }
  .center { text-align: center; }
  .sep { border: none; border-top: 1px dashed #000; margin: 6px 0; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 1px 2px; vertical-align: top; }
  .total td { font-weight: bold; font-size: 13px; border-top: 1px solid #000; padding-top: 4px; }
  .small { font-size: 9px; color: #555; }
  @media screen { body { max-width: 360px; padding: 12px; } }
</style>
</head>
<body>
<h1>${ticket.empresaNombre}</h1>
<p class="center small">${ticket.empresaNif ? 'NIF: ' + ticket.empresaNif : ''}</p>
<hr class="sep"/>
<table>
  <tr><td>Mesa</td><td style="text-align:right">${ticket.mesaNumero}</td></tr>
  <tr><td>Operador</td><td style="text-align:right">${ticket.operadorNombre}</td></tr>
  <tr><td>Fecha</td><td style="text-align:right">${fecha} ${hora}</td></tr>
  <tr><td>Ticket</td><td style="text-align:right">${serieNum}</td></tr>
</table>
<hr class="sep"/>
<table>
  <tr><td>Base imponible</td><td style="text-align:right">${fmt(ticket.baseImponibleCents)}</td></tr>
  <tr><td>${labelImpuesto} ${ticket.ivaPorcentaje}%</td><td style="text-align:right">${fmt(ticket.ivaCents)}</td></tr>
  ${propinaRow}
  <tr class="total"><td>TOTAL</td><td style="text-align:right">${fmt(ticket.importeCobradoCents)}</td></tr>
</table>
<hr class="sep"/>
<table>
  <tr><td>M&eacute;todo</td><td style="text-align:right" style="text-transform:capitalize">${ticket.metodoPago}</td></tr>
  ${cambioRow}
  ${aeatBlock}
</table>
<hr class="sep"/>
<p class="center small">Hash: ${ticket.hash.slice(0, 16)}...</p>
<p class="center small">Gracias por su visita</p>
</body>
</html>`;
}

export class BrowserPrinter implements ThermalPrinter {
  async print(ticket: PrintTicket): Promise<void> {
    const win = window.open('', '_blank', 'width=420,height=650');
    if (win === null) throw new Error('El navegador bloqueó la ventana de impresión');
    win.document.write(buildReceiptHtml(ticket));
    win.document.close();
    win.focus();
    win.print();
    win.close();
  }
}
