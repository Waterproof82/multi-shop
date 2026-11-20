// src/core/infrastructure/pdf/etiquetas-chapa.renderer.ts
// sdd pet-id-qr-profile (docs/sdd/pet-id-qr-profile/, kitemergenciacanarias),
// Fase 8 — sigue el patrón de `etiquetas-kit.renderer.ts` (M5):
// `construirDocumentoChapas` es puro (no conoce `qrcode`, recibe las
// imágenes ya resueltas vía `QrPorUrl`); `renderEtiquetasChapaPdf` resuelve
// los QR con `qrcode` y delega el dibujo en `@react-pdf/renderer`.
// R-QR.14.1/R-QR.14.2: solo dibuja el QR y, si `mostrarCodigo`, el código —
// nunca un teléfono ni otro dato de contacto. R-QR.14.4: marca «MUESTRA» si
// `!PET_PERFIL_PUBLICO_LIVE` (resuelto por el caso de uso, no aquí).
import React from 'react';
import { Document, Page, Text, View, Image, Svg, Circle, Rect, StyleSheet, renderToStream } from '@react-pdf/renderer';
import QRCode from 'qrcode';
import type { Readable } from 'stream';
import type { EtiquetasLotePet, EtiquetaChapa } from '@/core/domain/entities/pet-chapa-types';
import { FORMATO_CHAPA, calcularRejilla, mmAPt, type FormatoChapa } from '@/lib/pet-id/chapa-layout';

const AVISO_MUESTRA = 'MUESTRA — NO IMPRIMIR';

/** DD1/DD2 de M5, reutilizado aquí: resuelve la imagen (data URL) de un QR a partir de su URL destino. */
export type QrPorUrl = (url: string) => string;

function ladoEfectivoMm(f: FormatoChapa): number {
  return f.forma === 'redonda' ? f.diametroMm : f.ladoMm;
}

function enGrupos<T>(items: readonly T[], tamano: number): T[][] {
  const grupos: T[][] = [];
  for (let i = 0; i < items.length; i += tamano) grupos.push(items.slice(i, i + tamano));
  return grupos;
}

// ─── Estilos (todas las medidas salen de `formato`/`mmAPt`, nunca un valor fijo) ───

function crearEstilos(f: FormatoChapa) {
  const lado = ladoEfectivoMm(f);
  return StyleSheet.create({
    page: { padding: mmAPt(2), flexDirection: 'row', flexWrap: 'wrap', fontFamily: 'Helvetica' },
    chapa: {
      width: mmAPt(lado + f.separacionMm),
      height: mmAPt(lado + f.separacionMm),
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
    },
    guia: { position: 'absolute', top: mmAPt(f.separacionMm / 2), left: mmAPt(f.separacionMm / 2) },
    qr: { width: mmAPt(f.qrMm), height: mmAPt(f.qrMm) },
    codigo: { fontFamily: 'Courier', fontSize: 7, marginTop: mmAPt(0.8) },
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
}

type Estilos = ReturnType<typeof crearEstilos>;

/** Guía de corte (R-QR.14.1): un círculo o un cuadrado según la forma — solo el contorno, nunca relleno. */
function guiaCorteElement(f: FormatoChapa, s: Estilos): React.ReactElement | null {
  if (!f.guiaCorte) return null;
  const lado = ladoEfectivoMm(f);
  const ladoPt = mmAPt(lado);
  if (f.forma === 'redonda') {
    return React.createElement(Svg, { style: s.guia, width: ladoPt, height: ladoPt },
      React.createElement(Circle, { cx: ladoPt / 2, cy: ladoPt / 2, r: ladoPt / 2 - 0.5, stroke: '#94a3b8', strokeWidth: 0.5, fill: 'none' }));
  }
  return React.createElement(Svg, { style: s.guia, width: ladoPt, height: ladoPt },
    React.createElement(Rect, { x: 0.5, y: 0.5, width: ladoPt - 1, height: ladoPt - 1, stroke: '#94a3b8', strokeWidth: 0.5, fill: 'none' }));
}

function chapaElement(etiqueta: EtiquetaChapa, f: FormatoChapa, s: Estilos, qr: QrPorUrl): React.ReactElement {
  return React.createElement(View, { key: etiqueta.codigo, style: s.chapa, wrap: false },
    guiaCorteElement(f, s),
    React.createElement(Image, { style: s.qr, src: qr(etiqueta.url) }),
    f.mostrarCodigo ? React.createElement(Text, { style: s.codigo }, etiqueta.codigo) : null,
  );
}

function hojaChapasElement(etiquetas: EtiquetaChapa[], f: FormatoChapa, s: Estilos, muestra: boolean, qr: QrPorUrl, key: number): React.ReactElement {
  return React.createElement(Page, { key, size: 'A4', style: s.page },
    ...etiquetas.map((etiqueta) => chapaElement(etiqueta, f, s, qr)),
    muestra ? React.createElement(Text, { key: 'muestra', style: s.muestra, fixed: true }, AVISO_MUESTRA) : null,
  );
}

/** R-QR.14/R-QR.14.4: árbol de la hoja de etiquetas. Puro — `qr` ya resuelve cada URL a su data URL. */
export function construirDocumentoChapas(d: EtiquetasLotePet, qr: QrPorUrl, formato: FormatoChapa = FORMATO_CHAPA): React.ReactElement {
  const s = crearEstilos(formato);
  const { porPagina } = calcularRejilla(formato);
  const paginas = enGrupos(d.etiquetas, porPagina);
  return React.createElement(Document, {},
    ...paginas.map((grupo, i) => hojaChapasElement(grupo, formato, s, d.muestra, qr, i)),
  );
}

// ─── Resolución de QR + render a PDF ───────────────────────────────────────────

const QR_OPCIONES = { errorCorrectionLevel: 'M' as const, margin: 4, width: 512 };

export async function renderEtiquetasChapaPdf(d: EtiquetasLotePet, formato: FormatoChapa = FORMATO_CHAPA): Promise<Readable> {
  const entradas = await Promise.all(
    d.etiquetas.map(async ({ url }) => [url, await QRCode.toDataURL(url, QR_OPCIONES)] as const),
  );
  const cache = new Map<string, string>(entradas);
  const qr: QrPorUrl = (url) => cache.get(url) ?? '';

  const documento = construirDocumentoChapas(d, qr, formato);
  return renderToStream(documento as Parameters<typeof renderToStream>[0]) as unknown as Readable;
}
