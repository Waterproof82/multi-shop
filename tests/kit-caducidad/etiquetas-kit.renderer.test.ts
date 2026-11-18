import { describe, expect, it } from 'vitest';
import type { ReactElement } from 'react';
import { construirDocumentoEtiquetas, renderEtiquetasKitPdf } from '@/core/infrastructure/pdf/etiquetas-kit.renderer';
import type { EtiquetasLote, EtiquetaKit } from '@/core/domain/entities/kit-caducidad-types';
import { URL_LISTA_MOCHILA, urlEstadoKit } from '@/lib/kit-caducidad/etiqueta-urls';
import { generarSerie } from '@/lib/kit-caducidad/serie';

// sdd kit-expiry-m5 (M5b), DD1: `construirDocumentoEtiquetas` es puro —
// React.createElement produce objetos planos, así que se recorre el árbol
// directamente sin montar `@react-pdf/renderer` (no hay DOM que montar).
// `renderEtiquetasKitPdf` sí usa `qrcode` real + `renderToStream`: se prueba
// que el PDF resultante empieza por la cabecera `%PDF-` (entorno node del
// proyecto `unit`, ver vitest.config.ts).

function serieValida(n: number): string {
  return generarSerie(() => Uint8Array.from([n >> 24 & 0xff, n >> 16 & 0xff, n >> 8 & 0xff, n & 0xff, (n * 7) & 0xff]));
}

function etiquetasDePrueba(n: number): EtiquetaKit[] {
  return Array.from({ length: n }, (_, i) => {
    const serie = serieValida(i + 1);
    const urlEstado = urlEstadoKit(serie);
    if (urlEstado === null) throw new Error('serie de prueba inválida');
    return { serie, urlEstado };
  });
}

function loteDePrueba(etiquetas: EtiquetaKit[], muestra: boolean): EtiquetasLote {
  return { codigoLote: 'KEC-001', etiquetas, urlLista: URL_LISTA_MOCHILA, muestra, pagina: 1, totalPaginas: 1 };
}

const qrFalso = (url: string): string => `data:image/png;base64,FAKE(${url})`;

function collectTexts(node: unknown): string[] {
  if (typeof node === 'string') return [node];
  if (typeof node === 'number') return [String(node)];
  if (Array.isArray(node)) return node.flatMap(collectTexts);
  if (node !== null && typeof node === 'object' && 'props' in (node as Record<string, unknown>)) {
    return collectTexts((node as { props: { children?: unknown } }).props.children);
  }
  return [];
}

function paginasDe(doc: ReactElement): ReactElement[] {
  const children = (doc.props as { children: ReactElement | ReactElement[] }).children;
  return Array.isArray(children) ? children : [children];
}

describe('construirDocumentoEtiquetas', () => {
  it('30 etiquetas producen 2 Page (24 por hoja, DD4/R-M5.3.2)', () => {
    const doc = construirDocumentoEtiquetas(loteDePrueba(etiquetasDePrueba(30), false), qrFalso);
    expect(paginasDe(doc)).toHaveLength(2);
  });

  it('cada etiqueta lleva la marca, las dos leyendas y su serie', () => {
    const etiquetas = etiquetasDePrueba(5);
    const doc = construirDocumentoEtiquetas(loteDePrueba(etiquetas, false), qrFalso);
    const textos = paginasDe(doc).flatMap(collectTexts);

    expect(textos.filter((t) => t === 'Kit Emergencia Canarias')).toHaveLength(5);
    expect(textos.filter((t) => t === 'Estado y avisos')).toHaveLength(5);
    expect(textos.filter((t) => t === 'Lista de la mochila')).toHaveLength(5);
    for (const { serie } of etiquetas) {
      expect(textos).toContain(serie);
    }
  });

  it('con muestra, cada Page lleva «MUESTRA — NO IMPRIMIR»; sin muestra, ninguna', () => {
    const etiquetas = etiquetasDePrueba(30);
    const conMuestra = construirDocumentoEtiquetas(loteDePrueba(etiquetas, true), qrFalso);
    const sinMuestra = construirDocumentoEtiquetas(loteDePrueba(etiquetas, false), qrFalso);

    for (const pagina of paginasDe(conMuestra)) {
      expect(collectTexts(pagina)).toContain('MUESTRA — NO IMPRIMIR');
    }
    for (const pagina of paginasDe(sinMuestra)) {
      expect(collectTexts(pagina)).not.toContain('MUESTRA — NO IMPRIMIR');
    }
  });
});

describe('renderEtiquetasKitPdf', () => {
  it('devuelve un PDF real (cabecera %PDF-) con QR reales', async () => {
    const stream = await renderEtiquetasKitPdf(loteDePrueba(etiquetasDePrueba(2), true));
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    const buffer = Buffer.concat(chunks);

    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });
});
