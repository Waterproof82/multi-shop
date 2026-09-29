import { escapeHtml } from '@/lib/html-utils';
import { getLocaleForLang } from './promo-email.builder';
import { filaItem, importeItem, type ItemEmailSeguimiento } from './seguimiento-email.builder';
import { tipoEntregaDelPedido, type TipoEntrega } from '@/lib/pedido/entrega';

/**
 * Email transaccional "hemos recibido tu pedido" con el número de pedido, el
 * detalle y el enlace de seguimiento.
 *
 * Dos momentos, un solo correo:
 *   - Pedido sin pago online → sale al crear el pedido (`pagado: false`).
 *   - Pedido con pago online → sale cuando Redsys confirma el cobro
 *     (`pagado: true`). Nunca antes: un pago rechazado no es un pedido.
 *
 * Mismo lenguaje visual que el email de seguimiento. Sin enlaces de baja: es
 * del servicio contratado, no marketing.
 */

export { tipoEntregaDelPedido, type TipoEntrega };

const TEXTOS: Record<string, {
  asunto: (empresa: string, numero: number) => string;
  badgeRecibido: string;
  badgePagado: string;
  titulo: string;
  saludo: (nombre: string) => string;
  intro: string;
  pagoConfirmado: string;
  numeroPedido: string;
  fecha: string;
  entrega: string;
  recogida: string;
  domicilio: string;
  direccion: string;
  producto: string;
  cantidad: string;
  importe: string;
  gastosEnvio: string;
  total: string;
  verPedido: string;
  verWeb: string;
  pie: (empresa: string) => string;
}> = {
  es: {
    asunto: (e, n) => `${e}: hemos recibido tu pedido #${n}`,
    badgeRecibido: 'Pedido recibido',
    badgePagado: 'Pago confirmado',
    titulo: 'Gracias por tu pedido',
    saludo: n => `Hola ${n},`,
    intro: 'Hemos recibido tu pedido. Guarda este número por si necesitas consultarlo:',
    pagoConfirmado: 'Pago confirmado',
    numeroPedido: 'Número de pedido',
    fecha: 'Fecha',
    entrega: 'Entrega',
    recogida: 'Recogida en el local',
    domicilio: 'Envío a domicilio',
    direccion: 'Dirección de entrega',
    producto: 'Producto',
    cantidad: 'Cant.',
    importe: 'Importe',
    gastosEnvio: 'Gastos de envío',
    total: 'Total',
    verPedido: 'Ver el estado del pedido',
    verWeb: 'Ver nuestra web',
    pie: e => `Has recibido este correo porque hiciste un pedido en ${e}.`,
  },
  en: {
    asunto: (e, n) => `${e}: we have received your order #${n}`,
    badgeRecibido: 'Order received',
    badgePagado: 'Payment confirmed',
    titulo: 'Thank you for your order',
    saludo: n => `Hi ${n},`,
    intro: 'We have received your order. Keep this number in case you need to check on it:',
    pagoConfirmado: 'Payment confirmed',
    numeroPedido: 'Order number',
    fecha: 'Date',
    entrega: 'Delivery',
    recogida: 'In-store pickup',
    domicilio: 'Home delivery',
    direccion: 'Delivery address',
    producto: 'Product',
    cantidad: 'Qty',
    importe: 'Amount',
    gastosEnvio: 'Shipping',
    total: 'Total',
    verPedido: 'View order status',
    verWeb: 'Visit our website',
    pie: e => `You received this email because you placed an order at ${e}.`,
  },
  fr: {
    asunto: (e, n) => `${e} : nous avons reçu votre commande n°${n}`,
    badgeRecibido: 'Commande reçue',
    badgePagado: 'Paiement confirmé',
    titulo: 'Merci pour votre commande',
    saludo: n => `Bonjour ${n},`,
    intro: 'Nous avons reçu votre commande. Conservez ce numéro au cas où vous auriez besoin de la consulter :',
    pagoConfirmado: 'Paiement confirmé',
    numeroPedido: 'Numéro de commande',
    fecha: 'Date',
    entrega: 'Livraison',
    recogida: 'Retrait sur place',
    domicilio: 'Livraison à domicile',
    direccion: 'Adresse de livraison',
    producto: 'Produit',
    cantidad: 'Qté',
    importe: 'Montant',
    gastosEnvio: 'Frais de livraison',
    total: 'Total',
    verPedido: 'Voir l’état de la commande',
    verWeb: 'Voir notre site',
    pie: e => `Vous recevez cet e-mail car vous avez passé une commande chez ${e}.`,
  },
  it: {
    asunto: (e, n) => `${e}: abbiamo ricevuto il tuo ordine n. ${n}`,
    badgeRecibido: 'Ordine ricevuto',
    badgePagado: 'Pagamento confermato',
    titulo: 'Grazie per il tuo ordine',
    saludo: n => `Ciao ${n},`,
    intro: 'Abbiamo ricevuto il tuo ordine. Conserva questo numero nel caso tu debba consultarlo:',
    pagoConfirmado: 'Pagamento confermato',
    numeroPedido: 'Numero d’ordine',
    fecha: 'Data',
    entrega: 'Consegna',
    recogida: 'Ritiro in negozio',
    domicilio: 'Consegna a domicilio',
    direccion: 'Indirizzo di consegna',
    producto: 'Prodotto',
    cantidad: 'Qtà',
    importe: 'Importo',
    gastosEnvio: 'Spese di spedizione',
    total: 'Totale',
    verPedido: 'Vedi lo stato dell’ordine',
    verWeb: 'Visita il nostro sito',
    pie: e => `Ricevi questa email perché hai effettuato un ordine su ${e}.`,
  },
  de: {
    asunto: (e, n) => `${e}: Wir haben Ihre Bestellung Nr. ${n} erhalten`,
    badgeRecibido: 'Bestellung erhalten',
    badgePagado: 'Zahlung bestätigt',
    titulo: 'Vielen Dank für Ihre Bestellung',
    saludo: n => `Hallo ${n},`,
    intro: 'Wir haben Ihre Bestellung erhalten. Bewahren Sie diese Nummer auf, falls Sie nachfragen möchten:',
    pagoConfirmado: 'Zahlung bestätigt',
    numeroPedido: 'Bestellnummer',
    fecha: 'Datum',
    entrega: 'Lieferung',
    recogida: 'Abholung vor Ort',
    domicilio: 'Lieferung nach Hause',
    direccion: 'Lieferadresse',
    producto: 'Produkt',
    cantidad: 'Menge',
    importe: 'Betrag',
    gastosEnvio: 'Versandkosten',
    total: 'Gesamt',
    verPedido: 'Bestellstatus ansehen',
    verWeb: 'Zu unserer Website',
    pie: e => `Sie erhalten diese E-Mail, weil Sie bei ${e} bestellt haben.`,
  },
};

type Textos = (typeof TEXTOS)[string];

export interface DatosEmailConfirmacion {
  empresaNombre: string;
  empresaLogoUrl: string;
  primaryColor: string;
  primaryForeground: string;
  baseUrl: string;
  lang: string;
  numeroPedido: number;
  fechaPedido: string;
  /** Solo `true` cuando Redsys ha confirmado el cobro. */
  pagado: boolean;
  clienteNombre: string | null;
  /** Página de seguimiento del pedido, o `null` si el pedido no tiene token. */
  trackingUrl: string | null;
  tipoEntrega: TipoEntrega | null;
  modalidadNombre: string | null;
  direccionEntrega: string | null;
  items: ItemEmailSeguimiento[];
  gastosEnvioCents: number | null;
  total: number;
}

function textoEntrega(d: DatosEmailConfirmacion, tx: Textos): string | null {
  if (d.tipoEntrega === null) return null;
  if (d.tipoEntrega === 'recogida') return tx.recogida;
  return d.modalidadNombre ? `${tx.domicilio} — ${d.modalidadNombre}` : tx.domicilio;
}

function direccionVisible(d: DatosEmailConfirmacion): string | null {
  return d.tipoEntrega === 'domicilio' && d.direccionEntrega ? d.direccionEntrega : null;
}

function gastosDeEnvio(d: DatosEmailConfirmacion): number | null {
  return d.gastosEnvioCents != null && d.gastosEnvioCents > 0 ? d.gastosEnvioCents / 100 : null;
}

function bloqueResumen(d: DatosEmailConfirmacion, tx: Textos, fecha: string): string {
  const entrega = textoEntrega(d, tx);
  const direccion = direccionVisible(d);
  const pago = d.pagado ? `<div style="color:#15803d;font-weight:700;">✓ ${tx.pagoConfirmado}</div>` : '';
  return `
      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:14px 16px;margin-bottom:20px;font-size:14px;color:#374151;line-height:1.7;">
        ${pago}
        <div><strong>${tx.fecha}:</strong> ${escapeHtml(fecha)}</div>
        ${entrega ? `<div><strong>${tx.entrega}:</strong> ${escapeHtml(entrega)}</div>` : ''}
        ${direccion ? `<div><strong>${tx.direccion}:</strong> ${escapeHtml(direccion)}</div>` : ''}
      </div>`;
}

function textoPlano(d: DatosEmailConfirmacion, tx: Textos, fecha: string, precio: (n: number) => string): string {
  const entrega = textoEntrega(d, tx);
  const direccion = direccionVisible(d);
  const gastos = gastosDeEnvio(d);
  const lineasItems = d.items.map(i => {
    const extras = i.complementos.map(c => `    + ${c.nombre}`).join('\n');
    return `- ${i.cantidad} x ${i.nombre}  ${precio(importeItem(i))}${extras ? `\n${extras}` : ''}`;
  });
  return [
    d.clienteNombre ? tx.saludo(d.clienteNombre) : '',
    tx.intro,
    '',
    `${tx.numeroPedido}: #${d.numeroPedido}`,
    d.pagado ? tx.pagoConfirmado : '',
    `${tx.fecha}: ${fecha}`,
    entrega ? `${tx.entrega}: ${entrega}` : '',
    direccion ? `${tx.direccion}: ${direccion}` : '',
    '',
    ...lineasItems,
    gastos === null ? '' : `${tx.gastosEnvio}: ${precio(gastos)}`,
    `${tx.total}: ${precio(d.total)}`,
    '',
    d.trackingUrl ?? d.baseUrl,
  ].filter((l, i, arr) => l !== '' || arr[i - 1] !== '').join('\n').trim();
}

export function construirEmailConfirmacion(d: DatosEmailConfirmacion): { subject: string; html: string; text: string } {
  const tx = TEXTOS[d.lang] ?? TEXTOS.es;
  const locale = getLocaleForLang(d.lang);
  const precio = (n: number) => new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format(n);
  const fecha = new Date(d.fechaPedido).toLocaleDateString(locale, { day: '2-digit', month: 'long', year: 'numeric' });
  const gastos = gastosDeEnvio(d);
  const empresa = escapeHtml(d.empresaNombre);
  const color = escapeHtml(d.primaryColor);
  const colorTexto = escapeHtml(d.primaryForeground);
  const badge = d.pagado ? tx.badgePagado : tx.badgeRecibido;
  const enlace = d.trackingUrl ?? d.baseUrl;
  const textoEnlace = d.trackingUrl ? tx.verPedido : tx.verWeb;
  const saludo = d.clienteNombre ? `<p style="margin:0 0 8px;font-size:16px;color:#111827;font-weight:600;">${escapeHtml(tx.saludo(d.clienteNombre))}</p>` : '';

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:540px;margin:24px auto;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.10);">
    <div style="background:${color};padding:30px 24px 26px;text-align:center;">
      ${d.empresaLogoUrl ? `<div style="margin-bottom:16px;"><img src="${escapeHtml(d.empresaLogoUrl)}" alt="${empresa}" style="max-width:110px;max-height:48px;object-fit:contain;"></div>` : ''}
      <div style="display:inline-block;background:rgba(255,255,255,0.2);border:1px solid rgba(255,255,255,0.4);border-radius:20px;padding:5px 16px;margin-bottom:14px;">
        <span style="font-size:11px;font-weight:700;color:${colorTexto};letter-spacing:1.5px;text-transform:uppercase;">${badge}</span>
      </div>
      <h1 style="margin:0;font-size:26px;font-weight:800;color:${colorTexto};line-height:1.2;">${tx.titulo}</h1>
    </div>

    <div style="padding:24px 24px 20px;">
      ${saludo}
      <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.6;">${tx.intro}</p>

      <div style="border:2px dashed ${color};border-radius:14px;padding:16px;text-align:center;margin-bottom:20px;">
        <p style="margin:0;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">${tx.numeroPedido}</p>
        <p style="margin:6px 0 0;font-size:28px;font-weight:800;color:#111827;">#${d.numeroPedido}</p>
      </div>
${bloqueResumen(d, tx, fecha)}

      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:8px;">
        <thead>
          <tr>
            <th style="padding:8px 0;border-bottom:2px solid #111827;font-size:11px;color:#6b7280;text-transform:uppercase;text-align:left;">${tx.producto}</th>
            <th style="padding:8px 0;border-bottom:2px solid #111827;font-size:11px;color:#6b7280;text-transform:uppercase;text-align:center;">${tx.cantidad}</th>
            <th style="padding:8px 0;border-bottom:2px solid #111827;font-size:11px;color:#6b7280;text-transform:uppercase;text-align:right;">${tx.importe}</th>
          </tr>
        </thead>
        <tbody>${d.items.map(i => filaItem(i, precio)).join('')}
        </tbody>
      </table>

      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
        ${gastos === null ? '' : `<tr>
          <td style="padding:6px 0;font-size:14px;color:#6b7280;">${tx.gastosEnvio}</td>
          <td style="padding:6px 0;font-size:14px;color:#6b7280;text-align:right;">${precio(gastos)}</td>
        </tr>`}
        <tr>
          <td style="padding:10px 0 0;font-size:16px;font-weight:700;color:#111827;border-top:1px solid #e5e7eb;">${tx.total}</td>
          <td style="padding:10px 0 0;font-size:20px;font-weight:800;color:#111827;text-align:right;border-top:1px solid #e5e7eb;">${precio(d.total)}</td>
        </tr>
      </table>

      <a href="${escapeHtml(enlace)}" style="display:block;width:100%;box-sizing:border-box;text-align:center;background:${color};color:${colorTexto};font-size:15px;font-weight:700;padding:14px 0;border-radius:10px;text-decoration:none;margin-bottom:20px;">
        ${textoEnlace}
      </a>

      <p style="margin:0;border-top:1px solid #f3f4f6;padding-top:16px;font-size:12px;color:#9ca3af;text-align:center;">${escapeHtml(tx.pie(d.empresaNombre))}</p>
    </div>
  </div>
  <div style="height:24px;"></div>
</body>
</html>`;

  return {
    subject: tx.asunto(d.empresaNombre, d.numeroPedido),
    html,
    text: textoPlano(d, tx, fecha, precio),
  };
}
