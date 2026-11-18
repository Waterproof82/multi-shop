// src/core/infrastructure/pdf/etiquetas-kit.renderer.ts
// kit-expiry-m5 (sdd en kitemergenciacanarias, docs/sdd/kit-expiry-reminders/m5/)
// DD1: `construirDocumentoEtiquetas` es puro (no conoce `qrcode`, recibe las
// imágenes ya resueltas vía `QrPorUrl`) — se prueba sin montar PDF real.
// `renderEtiquetasKitPdf` resuelve los QR con `qrcode` (patrón de
// `lib/tpv/printer/browser-printer.ts`) y delega el dibujo en
// `@react-pdf/renderer` (patrón de `laborcontrol/.../PdfRenderer.ts`).
import React from 'react';
import { Document, Page, Text, View, Image, StyleSheet, renderToStream } from '@react-pdf/renderer';
import QRCode from 'qrcode';
import type { Readable } from 'stream';
import type { EtiquetasLote, EtiquetaKit } from '@/core/domain/entities/kit-caducidad-types';
import { HOJA_ETIQUETAS, mmAPt } from '@/lib/kit-caducidad/etiqueta-layout';

const MARCA = 'Kit Emergencia Canarias';
const LEYENDA_QR1 = 'Estado y avisos';
const LEYENDA_QR2 = 'Lista de la mochila';
const AVISO_MUESTRA = 'MUESTRA — NO IMPRIMIR';

/** DD1/DD2: resuelve la imagen (data URL) de un QR a partir de su URL destino. */
export type QrPorUrl = (url: string) => string;

const POR_PAGINA = HOJA_ETIQUETAS.columnas * HOJA_ETIQUETAS.filas;

function enGrupos<T>(items: readonly T[], tamano: number): T[][] {
  const grupos: T[][] = [];
  for (let i = 0; i < items.length; i += tamano) grupos.push(items.slice(i, i + tamano));
  return grupos;
}

// ─── Estilos (DD4: todas las medidas salen de HOJA_ETIQUETAS/mmAPt) ───────────

const s = StyleSheet.create({
  page: { padding: 0, flexDirection: 'row', flexWrap: 'wrap', fontFamily: 'Helvetica' },
  etiqueta: {
    width: mmAPt(HOJA_ETIQUETAS.etiquetaAnchoMm),
    height: mmAPt(HOJA_ETIQUETAS.etiquetaAltoMm),
    paddingTop: mmAPt(HOJA_ETIQUETAS.contenido.margenSuperiorMm),
    paddingBottom: mmAPt(HOJA_ETIQUETAS.contenido.margenInferiorMm),
    alignItems: 'center',
  },
  marca: { fontSize: 7, fontWeight: 'bold', marginBottom: mmAPt(1) },
  filaQr: { flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-start', gap: mmAPt(HOJA_ETIQUETAS.contenido.gapQrMm) },
  bloqueQr: { alignItems: 'center' },
  qr: { width: mmAPt(HOJA_ETIQUETAS.qrMm), height: mmAPt(HOJA_ETIQUETAS.qrMm) },
  leyenda: { fontSize: 6, marginTop: mmAPt(0.5) },
  serie: { fontFamily: 'Courier', fontSize: 11, marginTop: mmAPt(1) },
  muestra: {
    position: 'absolute',
    top: '42%',
    left: '8%',
    fontSize: 46,
    color: '#92400e',
    opacity: 0.22,
    transform: 'rotate(-28deg)',
  },
});

// ─── Árbol (puro) ──────────────────────────────────────────────────────────────
//
// NOTA: son funciones normales invocadas directamente (NO tipos de
// componente pasados a `React.createElement`). Pasarlas como componente
// dejaría en el árbol un elemento sin expandir (`{ type: etiquetaElement,
// props }`) en vez de la `View` real — mismo patrón que `PdfRenderer.ts`
// (que tampoco declara componentes intermedios, solo anida `createElement`).

function etiquetaElement(etiqueta: EtiquetaKit, urlLista: string, qr: QrPorUrl): React.ReactElement {
  return React.createElement(View, { key: etiqueta.serie, style: s.etiqueta, wrap: false },
    React.createElement(Text, { style: s.marca }, MARCA),
    React.createElement(View, { style: s.filaQr },
      React.createElement(View, { style: s.bloqueQr },
        React.createElement(Image, { style: s.qr, src: qr(etiqueta.urlEstado) }),
        React.createElement(Text, { style: s.leyenda }, LEYENDA_QR1),
      ),
      React.createElement(View, { style: s.bloqueQr },
        React.createElement(Image, { style: s.qr, src: qr(urlLista) }),
        React.createElement(Text, { style: s.leyenda }, LEYENDA_QR2),
      ),
    ),
    React.createElement(Text, { style: s.serie }, etiqueta.serie),
  );
}

function hojaEtiquetasElement(etiquetas: EtiquetaKit[], urlLista: string, muestra: boolean, qr: QrPorUrl, key: number): React.ReactElement {
  return React.createElement(Page, { key, size: 'A4', style: s.page },
    ...etiquetas.map((etiqueta) => etiquetaElement(etiqueta, urlLista, qr)),
    muestra ? React.createElement(Text, { key: 'muestra', style: s.muestra, fixed: true }, AVISO_MUESTRA) : null,
  );
}

/** R-M5.2/R-M5.3/R-M5.4: árbol de la hoja de etiquetas. Puro — `qr` ya resuelve cada URL a su data URL. */
export function construirDocumentoEtiquetas(d: EtiquetasLote, qr: QrPorUrl): React.ReactElement {
  const paginas = enGrupos(d.etiquetas, POR_PAGINA);
  return React.createElement(Document, {},
    ...paginas.map((grupo, i) => hojaEtiquetasElement(grupo, d.urlLista, d.muestra, qr, i)),
  );
}

// ─── Resolución de QR + render a PDF ───────────────────────────────────────────

const QR_OPCIONES = { errorCorrectionLevel: 'M' as const, margin: 4, width: 512 };

/**
 * DD2: el QR 2 (lista de la mochila) es igual en todas las etiquetas del PDF
 * — se resuelve UNA vez y se reutiliza desde la caché. El QR 1 varía por
 * serie, así que se resuelve una vez por etiqueta.
 */
export async function renderEtiquetasKitPdf(d: EtiquetasLote): Promise<Readable> {
  const qrListaDataUrl = await QRCode.toDataURL(d.urlLista, QR_OPCIONES);
  const entradas = await Promise.all(
    d.etiquetas.map(async ({ urlEstado }) => [urlEstado, await QRCode.toDataURL(urlEstado, QR_OPCIONES)] as const),
  );

  const cache = new Map<string, string>(entradas);
  cache.set(d.urlLista, qrListaDataUrl);
  const qr: QrPorUrl = (url) => cache.get(url) ?? '';

  const documento = construirDocumentoEtiquetas(d, qr);
  return renderToStream(documento as Parameters<typeof renderToStream>[0]) as unknown as Readable;
}
