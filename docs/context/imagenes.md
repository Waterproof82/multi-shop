# Imágenes — subida, optimización y coste

Estado a 2026-08-08.

## Regla de una línea

> **Todo lo que sube `ImageUploader` ya está optimizado. No debe volver a pasar
> por el optimizador de Vercel.** Usar `ImagenSubida`, no `next/image`.

---

## El pipeline: dónde se optimiza cada cosa

La optimización ocurre **una sola vez, en el navegador del usuario que sube la
imagen**, antes de que salga a la red.

`src/lib/image-utils.ts`:

| Función | Se usa para | Reescala a | Formato | Calidad |
|---|---|---|---|---|
| `optimizeImage()` | fotos de producto, logos, promociones, TGTG | **480×480** máx. | WebP | 0.8 |
| `optimizeBannerImage()` | banner de empresa | 1920×1080 máx. | WebP | 0.92 |

`ImageUploader` (`src/components/ui/image-uploader.tsx`) llama a una u otra
según `isBannerImage`, y sube el resultado a R2. **En la base de datos y en R2 no
hay originales**: solo WebP ya reescalados.

Las subidas se aíslan por `empresaId` (query `?empresaId=` a
`/api/admin/upload-image`), no por slug.

---

## Por qué NO se usa `next/image` con esas imágenes

`next/image` está pensado para servir un original grande en el tamaño que cada
dispositivo necesita. Aquí el original **ya viene en su tamaño final**, así que
esa capa no aporta nada — y cuesta.

Con `sizes` en unidades `vw` (lo habitual en una rejilla), Next pide el srcset
con los ocho anchos de dispositivo por defecto:

```
640 · 750 · 828 · 1080 · 1200 · 1920 · 2048 · 3840
```

**Los ocho son mayores que el original de 480 px.** Es decir: ocho reescalados
*hacia arriba*, ocho transformaciones facturadas por foto, y ocho imágenes
peores que la de partida.

### Lo que costaba de verdad

Datos reales del incidente que originó este documento (agosto 2026, aviso de
Vercel al 75% de las 5.000 transformaciones del plan):

```
38 fotos de producto × 8 anchos ≈ 300 transformaciones por UNA carga en frío
```

Y el dato que lo delató, en el panel de uso de Vercel:

| | |
|---|---|
| Transformaciones | 3.951 |
| Lecturas de caché | 4.181 |

**Casi 1:1.** En un sistema sano se transforma una vez y se lee mil veces. Que
sean iguales significa que cada imagen se transformaba, se leía una vez, y a la
vuelta siguiente se volvía a transformar.

### Y no hacía falta que nadie usara la app

Esto es lo importante para no volver a confundirse: **el consumo no venía del
tráfico de clientes**. Basta con:

- Un bot rastreando la carta pública — `robots.ts` permite `/` a todos, con
  sitemap. Google, Bing y cualquier crawler entran.
- Que expire la caché de imagen, que en Next 16 dura **4 horas** por defecto
  (`minimumCacheTTL: 14400`).
- Cada despliegue nuevo, que arranca con la caché fría. Un día de trabajo
  intenso puede generar 40 despliegues.

---

## Cómo se usa

```tsx
import { ImagenSubida as Image } from '@/components/ui/imagen-subida';

<Image src={producto.fotoUrl} alt={nombre} fill className="object-cover" />
```

`ImagenSubida` es `next/image` con `unoptimized`. **Se conservan `fill`,
`sizes`, `className` y el resto del API**, así que el layout no cambia: lo único
que desaparece es el rodeo por el optimizador.

Aplicado en 14 ficheros / 19 `<Image>`: carta pública, TPV, admin de productos,
promociones, TGTG, superadmin, cabeceras y el propio uploader.

### Cuándo SÍ usar `next/image` normal

Si la imagen **no** pasa por `ImageUploader`:

- viene de un tercero o de una API externa
- es un original grande sin reescalar
- se sirve desde una fuente que no controlamos

Ahí el reescalado por dispositivo sí aporta y compensa la transformación.

### El banner es un caso aparte

`hero-banner.tsx` pinta el banner como `backgroundImage` en CSS, **no con
`next/image`**. Nunca pasó por el optimizador, y por eso no entra en esta regla.
Es además el único caso donde tendría sentido optimizar, porque se sube a
1920 px — si algún día se migra a `<Image>`, hacerlo con `next/image` normal.

---

## El guard, y por qué existe

`tests/compliance/imagenes-sin-doble-optimizacion.test.ts` (29 casos).

Comprueba que ninguno de los 14 ficheros importa `next/image` directamente, y
que el envoltorio conserva `unoptimized`.

**No es celo excesivo.** Este ahorro se pierde EN SILENCIO: basta que alguien
escriba `import Image from 'next/image'` —el autocompletado lo ofrece primero—
y las transformaciones vuelven. No falla nada, no cambia nada visible, no avisa
nadie. **Solo se nota en la factura, semanas después.**

El segundo bloque del test cubre el otro fallo posible: que alguien "simplifique"
el envoltorio quitando `unoptimized`. Sin él, el primer bloque seguiría en verde
mientras el ahorro desaparece por completo.

---

## Si vuelve a subir el consumo

Orden de sospecha, de más a menos probable:

1. **Alguien importó `next/image` en un fichero nuevo** que pinta subidas. El
   guard solo cubre los 14 conocidos: si aparece una pantalla nueva, añadirla a
   la lista.
2. **Una imagen que no pasa por el uploader** — de un tercero, o subida por otra
   vía. Ahí el consumo es legítimo, pero conviene saber que existe.
3. **Muchos despliegues seguidos**. Cada uno arranca con caché fría. Es
   inevitable en una jornada de trabajo intenso, y se estabiliza solo.

El desglose real está en Vercel → Usage → Image Optimization, con filtro por
proyecto y por ruta.
