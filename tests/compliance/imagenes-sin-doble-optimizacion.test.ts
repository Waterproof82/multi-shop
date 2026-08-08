/**
 * Las imágenes que ya vienen optimizadas no deben volver a pasar por Vercel.
 *
 * POR QUÉ ESTE TEST EXISTE
 * `ImageUploader` reescala a 480×480 y convierte a WebP ANTES de subir
 * (`src/lib/image-utils.ts`). Lo que hay en R2 ya está en su tamaño final.
 *
 * Pasarlo además por `next/image` no mejora nada y cuesta: con `sizes` en
 * unidades `vw`, Next pide el srcset con los ocho anchos de dispositivo por
 * defecto —640 a 3840—, **todos mayores que el original de 480 px**. Ocho
 * reescalados hacia arriba, ocho transformaciones facturadas, y una imagen peor
 * que la de partida.
 *
 * Con 38 fotos de producto, una carga en frío de la carta llegaba a ~300
 * transformaciones. Y no hace falta que nadie use la app: basta un bot
 * rastreando (`robots.ts` permite `/`) o que expire la caché de 4 h.
 *
 * ESTE AHORRO SE PIERDE EN SILENCIO. Basta que alguien escriba
 * `import Image from 'next/image'` en uno de estos ficheros —el autocompletado
 * lo ofrece primero— y las transformaciones vuelven sin que falle nada ni
 * cambie nada visible. Solo se nota en la factura, semanas después.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const RAIZ = resolve(__dirname, '../..');

/**
 * Ficheros cuyas `<Image>` pintan SIEMPRE salida de `ImageUploader` o assets
 * estáticos del propio build.
 *
 * El banner de empresa no está aquí a propósito: se pinta como `backgroundImage`
 * en CSS (`hero-banner.tsx`), no con `next/image`.
 */
const DEBEN_USAR_ENVOLTORIO = [
  'src/components/menu-section.tsx',
  'src/components/tpv/MenuPanel.tsx',
  'src/components/hero-banner.tsx',
  'src/components/site-header-client.tsx',
  'src/components/google-reviews-widget.tsx',
  'src/components/mesa-orders-client.tsx',
  'src/components/ui/image-uploader.tsx',
  'src/app/not-found.tsx',
  'src/app/superadmin/page.tsx',
  'src/app/superadmin/empresas-table.tsx',
  'src/app/admin/(protected)/admin-sidebar.tsx',
  'src/app/admin/(protected)/productos/page.tsx',
  'src/app/admin/(protected)/promociones/page.tsx',
  'src/app/admin/(protected)/toogoodtogo/page.tsx',
];

/** `import Image from 'next/image'` — el que reintroduce el coste. */
const IMPORT_DIRECTO = /^import\s+Image\s+from\s+['"]next\/image['"]/m;

describe('imágenes ya optimizadas', () => {
  it.each(DEBEN_USAR_ENVOLTORIO)('%s no importa next/image directamente', (rel) => {
    const fuente = readFileSync(join(RAIZ, rel), 'utf8');

    expect(
      IMPORT_DIRECTO.test(fuente),
      `${rel} volvió a importar next/image. Sus imágenes ya vienen a 480px WebP del ` +
        `uploader, así que el optimizador las reescalaría HACIA ARRIBA a hasta 8 anchos: ` +
        `8 transformaciones facturadas por foto, y peor calidad. Usar ImagenSubida.`,
    ).toBe(false);
  });

  it.each(DEBEN_USAR_ENVOLTORIO)('%s usa el envoltorio ImagenSubida', (rel) => {
    const fuente = readFileSync(join(RAIZ, rel), 'utf8');
    expect(fuente).toMatch(/from ['"][^'"]*imagen-subida['"]/);
  });

  it('el envoltorio realmente desactiva la optimización', () => {
    // Si alguien "simplifica" el envoltorio quitando `unoptimized`, los tests de
    // arriba siguen en verde y el ahorro desaparece por completo.
    const fuente = readFileSync(join(RAIZ, 'src/components/ui/imagen-subida.tsx'), 'utf8');

    expect(fuente).toMatch(/unoptimized/);
    expect(fuente).toMatch(/from ['"]next\/image['"]/);
  });
});
