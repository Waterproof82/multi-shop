import { describe, expect, it } from 'vitest';
import type { ReactElement } from 'react';
import { construirDocumentoChapas, renderEtiquetasChapaPdf } from '@/core/infrastructure/pdf/etiquetas-chapa.renderer';
import type { EtiquetasLotePet, EtiquetaChapa } from '@/core/domain/entities/pet-chapa-types';
import { FORMATO_CHAPA, calcularRejilla } from '@/lib/pet-id/chapa-layout';
import { urlPerfilChapa } from '@/lib/pet-id/urls';
import { generarCodigoChapa } from '@/lib/pet-id/codigo';

// sdd pet-id-qr-profile, Fase 8 — calco de `etiquetas-kit.renderer.test.ts`
// (M5): `construirDocumentoChapas` es puro (React.createElement produce
// objetos planos, se recorre el árbol directamente); `renderEtiquetasChapaPdf`
// sí usa `qrcode` real + `renderToStream`.

function codigoValido(n: number): string {
  return generarCodigoChapa(() => Uint8Array.from([n >> 24 & 0xff, n >> 16 & 0xff, n >> 8 & 0xff, n & 0xff, (n * 7) & 0xff]));
}

function etiquetasDePrueba(n: number): EtiquetaChapa[] {
  return Array.from({ length: n }, (_, i) => {
    const codigo = codigoValido(i + 1);
    const url = urlPerfilChapa(codigo);
    if (url === null) throw new Error('código de prueba inválido');
    return { codigo, url };
  });
}

function loteDePrueba(etiquetas: EtiquetaChapa[], muestra: boolean): EtiquetasLotePet {
  return { codigoLote: 'L-001', etiquetas, muestra, pagina: 1, totalPaginas: 1 };
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

describe('construirDocumentoChapas', () => {
  it('reparte las etiquetas en tantas Page como indica calcularRejilla', () => {
    const { porPagina } = calcularRejilla(FORMATO_CHAPA);
    const total = porPagina * 2 + 1;
    const doc = construirDocumentoChapas(loteDePrueba(etiquetasDePrueba(total), false), qrFalso);

    expect(paginasDe(doc)).toHaveLength(3);
  });

  it('cada etiqueta lleva su código impreso (mostrarCodigo: true por defecto)', () => {
    const etiquetas = etiquetasDePrueba(3);
    const doc = construirDocumentoChapas(loteDePrueba(etiquetas, false), qrFalso);
    const textos = paginasDe(doc).flatMap(collectTexts);

    for (const { codigo } of etiquetas) {
      expect(textos).toContain(codigo);
    }
  });

  it('nunca imprime un teléfono ni ningún otro dato de contacto (R-QR.14.2)', () => {
    const doc = construirDocumentoChapas(loteDePrueba(etiquetasDePrueba(3), false), qrFalso);
    const textos = paginasDe(doc).flatMap(collectTexts).join(' ');

    expect(textos).not.toMatch(/telefono|email|@/i);
  });

  it('con muestra, cada Page lleva «MUESTRA — NO IMPRIMIR»; sin muestra, ninguna', () => {
    const { porPagina } = calcularRejilla(FORMATO_CHAPA);
    const etiquetas = etiquetasDePrueba(porPagina + 1);
    const conMuestra = construirDocumentoChapas(loteDePrueba(etiquetas, true), qrFalso);
    const sinMuestra = construirDocumentoChapas(loteDePrueba(etiquetas, false), qrFalso);

    for (const pagina of paginasDe(conMuestra)) {
      expect(collectTexts(pagina)).toContain('MUESTRA — NO IMPRIMIR');
    }
    for (const pagina of paginasDe(sinMuestra)) {
      expect(collectTexts(pagina)).not.toContain('MUESTRA — NO IMPRIMIR');
    }
  });
});

describe('renderEtiquetasChapaPdf', () => {
  it('devuelve un PDF real (cabecera %PDF-) con QR reales', async () => {
    const stream = await renderEtiquetasChapaPdf(loteDePrueba(etiquetasDePrueba(2), true));
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    const buffer = Buffer.concat(chunks);

    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  }, 20000);
});
