import { escapeHtml } from '@/lib/html-utils';
import type { PedidoItem } from '@/core/domain/entities/types';
import { getLocaleForLang } from './promo-email.builder';

/**
 * Email transaccional "tu pedido ha sido enviado" con el número de seguimiento
 * del transportista y el detalle completo del pedido.
 *
 * Mismo lenguaje visual que el email de promociones (`promo-email.builder.ts`):
 * cabecera con el color primario del tenant, tarjeta blanca, 540 px. A
 * diferencia de aquel, NO lleva enlaces de baja: es un correo del servicio
 * contratado, no marketing.
 */

const TEXTOS: Record<string, {
  asunto: (empresa: string, numero: number) => string;
  badge: string;
  titulo: string;
  saludo: (nombre: string) => string;
  intro: string;
  numeroSeguimiento: string;
  pedido: string;
  fecha: string;
  direccion: string;
  tipoEnvio: string;
  envioADomicilio: string;
  producto: string;
  cantidad: string;
  importe: string;
  gastosEnvio: string;
  total: string;
  verWeb: string;
  pie: (empresa: string) => string;
}> = {
  es: {
    asunto: (e, n) => `${e}: tu pedido #${n} ha sido enviado`,
    badge: 'Pedido enviado',
    titulo: 'Tu pedido está en camino',
    saludo: n => `Hola ${n},`,
    intro: 'Hemos entregado tu pedido al transportista. Puedes seguir el envío con este número:',
    numeroSeguimiento: 'Número de seguimiento',
    pedido: 'Pedido',
    fecha: 'Fecha',
    direccion: 'Dirección de entrega',
    tipoEnvio: 'Tipo de envío',
    envioADomicilio: 'Envío a domicilio',
    producto: 'Producto',
    cantidad: 'Cant.',
    importe: 'Importe',
    gastosEnvio: 'Gastos de envío',
    total: 'Total',
    verWeb: 'Ver nuestra web',
    pie: e => `Has recibido este correo porque hiciste un pedido en ${e}.`,
  },
  en: {
    asunto: (e, n) => `${e}: your order #${n} has been shipped`,
    badge: 'Order shipped',
    titulo: 'Your order is on its way',
    saludo: n => `Hi ${n},`,
    intro: 'We have handed your order to the carrier. You can track the shipment with this number:',
    numeroSeguimiento: 'Tracking number',
    pedido: 'Order',
    fecha: 'Date',
    direccion: 'Delivery address',
    tipoEnvio: 'Shipping method',
    envioADomicilio: 'Home delivery',
    producto: 'Product',
    cantidad: 'Qty',
    importe: 'Amount',
    gastosEnvio: 'Shipping',
    total: 'Total',
    verWeb: 'Visit our website',
    pie: e => `You received this email because you placed an order at ${e}.`,
  },
  fr: {
    asunto: (e, n) => `${e} : votre commande n°${n} a été expédiée`,
    badge: 'Commande expédiée',
    titulo: 'Votre commande est en route',
    saludo: n => `Bonjour ${n},`,
    intro: 'Nous avons remis votre commande au transporteur. Vous pouvez suivre l’envoi avec ce numéro :',
    numeroSeguimiento: 'Numéro de suivi',
    pedido: 'Commande',
    fecha: 'Date',
    direccion: 'Adresse de livraison',
    tipoEnvio: 'Mode de livraison',
    envioADomicilio: 'Livraison à domicile',
    producto: 'Produit',
    cantidad: 'Qté',
    importe: 'Montant',
    gastosEnvio: 'Frais de livraison',
    total: 'Total',
    verWeb: 'Voir notre site',
    pie: e => `Vous recevez cet e-mail car vous avez passé une commande chez ${e}.`,
  },
  it: {
    asunto: (e, n) => `${e}: il tuo ordine n. ${n} è stato spedito`,
    badge: 'Ordine spedito',
    titulo: 'Il tuo ordine è in viaggio',
    saludo: n => `Ciao ${n},`,
    intro: 'Abbiamo consegnato il tuo ordine al corriere. Puoi seguire la spedizione con questo numero:',
    numeroSeguimiento: 'Numero di tracciamento',
    pedido: 'Ordine',
    fecha: 'Data',
    direccion: 'Indirizzo di consegna',
    tipoEnvio: 'Metodo di spedizione',
    envioADomicilio: 'Consegna a domicilio',
    producto: 'Prodotto',
    cantidad: 'Qtà',
    importe: 'Importo',
    gastosEnvio: 'Spese di spedizione',
    total: 'Totale',
    verWeb: 'Visita il nostro sito',
    pie: e => `Ricevi questa email perché hai effettuato un ordine su ${e}.`,
  },
  de: {
    asunto: (e, n) => `${e}: Ihre Bestellung Nr. ${n} wurde versandt`,
    badge: 'Bestellung versandt',
    titulo: 'Ihre Bestellung ist unterwegs',
    saludo: n => `Hallo ${n},`,
    intro: 'Wir haben Ihre Bestellung dem Versanddienst übergeben. Mit dieser Nummer können Sie die Sendung verfolgen:',
    numeroSeguimiento: 'Sendungsnummer',
    pedido: 'Bestellung',
    fecha: 'Datum',
    direccion: 'Lieferadresse',
    tipoEnvio: 'Versandart',
    envioADomicilio: 'Lieferung nach Hause',
    producto: 'Produkt',
    cantidad: 'Menge',
    importe: 'Betrag',
    gastosEnvio: 'Versandkosten',
    total: 'Gesamt',
    verWeb: 'Zu unserer Website',
    pie: e => `Sie erhalten diese E-Mail, weil Sie bei ${e} bestellt haben.`,
  },
};

export interface ItemEmailSeguimiento {
  nombre: string;
  cantidad: number;
  precio: number;
  complementos: Array<{ nombre: string; precio: number }>;
}

export interface DatosEmailSeguimiento {
  empresaNombre: string;
  empresaLogoUrl: string;
  primaryColor: string;
  primaryForeground: string;
  baseUrl: string;
  lang: string;
  numeroPedido: number;
  fechaPedido: string;
  numeroSeguimiento: string;
  clienteNombre: string | null;
  direccionEntrega: string | null;
  /** Nombre de la modalidad de envío (transportista), copiado en el pedido. */
  modalidadNombre: string | null;
  items: ItemEmailSeguimiento[];
  gastosEnvioCents: number | null;
  total: number;
}

/** `detalle_pedido` guarda complementos con claves es/en mezcladas (legacy). */
export function itemsParaEmail(detalle: PedidoItem[]): ItemEmailSeguimiento[] {
  return detalle.map(i => ({
    nombre: i.nombre,
    cantidad: i.cantidad,
    precio: i.precio,
    complementos: (i.complementos ?? []).map(c => ({ nombre: c.nombre ?? c.name ?? '', precio: c.precio ?? c.price ?? 0 })),
  }));
}

function importeItem(item: ItemEmailSeguimiento): number {
  const complementos = item.complementos.reduce((sum, c) => sum + c.precio, 0);
  return (item.precio + complementos) * item.cantidad;
}

function filaItem(item: ItemEmailSeguimiento, precio: (n: number) => string): string {
  const complementos = item.complementos.length === 0
    ? ''
    : `<div style="margin-top:4px;font-size:12px;color:#6b7280;">${item.complementos
      .map(c => `+ ${escapeHtml(c.nombre)}${c.precio > 0 ? ` (${precio(c.precio)})` : ''}`)
      .join('<br>')}</div>`;
  return `
          <tr>
            <td style="padding:10px 0;border-bottom:1px solid #f3f4f6;font-size:14px;color:#111827;">${escapeHtml(item.nombre)}${complementos}</td>
            <td style="padding:10px 0;border-bottom:1px solid #f3f4f6;font-size:14px;color:#374151;text-align:center;">${item.cantidad}</td>
            <td style="padding:10px 0;border-bottom:1px solid #f3f4f6;font-size:14px;color:#111827;text-align:right;white-space:nowrap;">${precio(importeItem(item))}</td>
          </tr>`;
}

export function construirEmailSeguimiento(d: DatosEmailSeguimiento): { subject: string; html: string; text: string } {
  const tx = TEXTOS[d.lang] ?? TEXTOS.es;
  const locale = getLocaleForLang(d.lang);
  const precio = (n: number) => new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format(n);
  const fecha = new Date(d.fechaPedido).toLocaleDateString(locale, { day: '2-digit', month: 'long', year: 'numeric' });
  const gastosEnvio = d.gastosEnvioCents != null && d.gastosEnvioCents > 0 ? d.gastosEnvioCents / 100 : null;
  const empresa = escapeHtml(d.empresaNombre);
  const color = escapeHtml(d.primaryColor);
  const colorTexto = escapeHtml(d.primaryForeground);
  const tipoEnvio = d.modalidadNombre ? `${tx.envioADomicilio} — ${d.modalidadNombre}` : tx.envioADomicilio;
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
        <span style="font-size:11px;font-weight:700;color:${colorTexto};letter-spacing:1.5px;text-transform:uppercase;">${tx.badge}</span>
      </div>
      <h1 style="margin:0;font-size:26px;font-weight:800;color:${colorTexto};line-height:1.2;">${tx.titulo}</h1>
    </div>

    <div style="padding:24px 24px 20px;">
      ${saludo}
      <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.6;">${tx.intro}</p>

      <div style="border:2px dashed ${color};border-radius:14px;padding:16px;text-align:center;margin-bottom:20px;">
        <p style="margin:0;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">${tx.numeroSeguimiento}</p>
        <p style="margin:6px 0 0;font-size:22px;font-weight:800;color:#111827;font-family:'SFMono-Regular',Consolas,monospace;word-break:break-all;">${escapeHtml(d.numeroSeguimiento)}</p>
      </div>

      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:14px 16px;margin-bottom:20px;font-size:14px;color:#374151;line-height:1.7;">
        <div><strong>${tx.pedido}:</strong> #${d.numeroPedido}</div>
        <div><strong>${tx.fecha}:</strong> ${escapeHtml(fecha)}</div>
        <div><strong>${tx.tipoEnvio}:</strong> ${escapeHtml(tipoEnvio)}</div>
        ${d.direccionEntrega ? `<div><strong>${tx.direccion}:</strong> ${escapeHtml(d.direccionEntrega)}</div>` : ''}
      </div>

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
        ${gastosEnvio === null ? '' : `<tr>
          <td style="padding:6px 0;font-size:14px;color:#6b7280;">${tx.gastosEnvio}</td>
          <td style="padding:6px 0;font-size:14px;color:#6b7280;text-align:right;">${precio(gastosEnvio)}</td>
        </tr>`}
        <tr>
          <td style="padding:10px 0 0;font-size:16px;font-weight:700;color:#111827;border-top:1px solid #e5e7eb;">${tx.total}</td>
          <td style="padding:10px 0 0;font-size:20px;font-weight:800;color:#111827;text-align:right;border-top:1px solid #e5e7eb;">${precio(d.total)}</td>
        </tr>
      </table>

      <a href="${escapeHtml(d.baseUrl)}" style="display:block;width:100%;box-sizing:border-box;text-align:center;background:${color};color:${colorTexto};font-size:15px;font-weight:700;padding:14px 0;border-radius:10px;text-decoration:none;margin-bottom:20px;">
        ${tx.verWeb}
      </a>

      <p style="margin:0;border-top:1px solid #f3f4f6;padding-top:16px;font-size:12px;color:#9ca3af;text-align:center;">${escapeHtml(tx.pie(d.empresaNombre))}</p>
    </div>
  </div>
  <div style="height:24px;"></div>
</body>
</html>`;

  const lineasItems = d.items.map(i => {
    const extras = i.complementos.map(c => `    + ${c.nombre}`).join('\n');
    return `- ${i.cantidad} x ${i.nombre}  ${precio(importeItem(i))}${extras ? `\n${extras}` : ''}`;
  });
  const text = [
    d.clienteNombre ? tx.saludo(d.clienteNombre) : '',
    tx.intro,
    '',
    `${tx.numeroSeguimiento}: ${d.numeroSeguimiento}`,
    '',
    `${tx.pedido}: #${d.numeroPedido} — ${fecha}`,
    `${tx.tipoEnvio}: ${tipoEnvio}`,
    d.direccionEntrega ? `${tx.direccion}: ${d.direccionEntrega}` : '',
    '',
    ...lineasItems,
    gastosEnvio === null ? '' : `${tx.gastosEnvio}: ${precio(gastosEnvio)}`,
    `${tx.total}: ${precio(d.total)}`,
    '',
    d.baseUrl,
  ].filter((l, i, arr) => l !== '' || arr[i - 1] !== '').join('\n').trim();

  return { subject: tx.asunto(d.empresaNombre, d.numeroPedido), html, text };
}
