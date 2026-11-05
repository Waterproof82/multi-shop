/**
 * Ancla de una card de producto en /carta, para que "Volver a la carta" desde
 * /producto/[slug] deje al usuario donde estaba y no arriba del todo.
 *
 * Va en un `data-` y no en un `id`: un producto puede pintarse varias veces
 * (su categoría real + menús virtuales) y los `id` deben ser únicos.
 */
const PREFIJO = "producto-";

/** Debe coincidir con el `data-producto-slug` de la card en `menu-section.tsx`. */
export const ATRIBUTO_ANCLA_PRODUCTO = "data-producto-slug";

export function hrefVolverACarta(slug: string | undefined): string {
  return slug ? `/carta#${PREFIJO}${encodeURIComponent(slug)}` : "/carta";
}

export function slugDesdeHash(hash: string): string | null {
  const marca = `#${PREFIJO}`;
  if (!hash.startsWith(marca) || hash.length === marca.length) return null;
  try {
    return decodeURIComponent(hash.slice(marca.length));
  } catch {
    return null;
  }
}

/** El `id` real que instala `instalarIdAnclaProducto` sobre la primera card coincidente. */
export function idAnclaProducto(slug: string): string {
  return `${PREFIJO}${slug}`;
}

/**
 * Instala `id="producto-<slug>"` en la primera card que coincida con el hash de
 * la URL actual. La ancla canónica sigue siendo el `data-` (un producto puede
 * pintarse varias veces y los `id` deben ser únicos); solo la PRIMERA
 * coincidente recibe el `id`, así que no hay colisiones.
 *
 * POR QUÉ hace falta un `id` real, además del scroll manual: el handler de
 * scroll de la App Router (layout-router de Next 16) procesa el hash con
 * `document.getElementById(hash)` y, si NO lo encuentra, hace fallback a
 * `scrollIntoView()` sobre la raíz del segmento — es decir, un scroll al top
 * de la página. Con el `data-` a secas ese fallback caía en el top, y en
 * navegaciones con el RSC en dos commits (prefetch parcial + useDeferredValue)
 * podía reconsumir el scroll pendiente DESPUÉS del scroll manual, anulándolo:
 * por eso volvía a veces al top y a veces no. Con el `id` instalado en un
 * `useLayoutEffect` (los layout effects corren antes que el handler del
 * segmento, que es su ancestro), el `getElementById` del handler cruzado
 * encuentra la card y su scroll nativo apunta al producto, no al top.
 */
export function instalarIdAnclaProducto(): void {
  const slug = slugDesdeHash(globalThis.location.hash);
  if (slug === null) return;
  const id = idAnclaProducto(slug);
  // Ya instalado (StrictMode ejecuta el layout effect dos veces; también
  // protege contra un id preexistente por construcción externa).
  if (document.getElementById(id) !== null) return;
  const card = document.querySelector<HTMLElement>(`[${ATRIBUTO_ANCLA_PRODUCTO}="${CSS.escape(slug)}"]`);
  if (card === null) return;
  card.id = id;
}

/**
 * ~1,5 s a 60 fps: ventana suficiente para cubrir el scroll restoration del
 * navegador tras una recarga (el que pisa el intento único) y, de paso, el caso
 * de un RSC que llegue en un commit posterior.
 *
 * EL PROBLEMA QUE CUBRE: en recarga dura de /carta#producto-<slug>, el scroll
 * nativo del navegador falla (el SSR no pinta el `id` — se instala en cliente),
 * y Chrome/Safari/restauran su posición guardada de forma asíncrona DESPUÉS de
 * la carga: un `scrollIntoView` de un solo intento (rAF) puede quedar pisado y
 * el usuario aterriza dónde esa restauración decida, no en la card.
 *
 * El reintento es `behavior: 'auto'` (instantáneo) contra SIEMPRE el mismo
 * objetivo, así que entre intentos no hay desplazamientos visibles: solo
 * gana el último. Se corta al primer gesto del usuario (wheel/touch/pointer/
 * tecla — nunca nos quedamos peleando con su dedo) y a los ~90 frames, para no
 * sostener listeners para siempre.
 *
 * Devuelve la función de cancelación (limpia planificador y oyentes).
 */
const MAX_FRAMES_INTENTO_ANCLA = 90;

interface ProgramadorAncla {
  programar: (paso: () => void) => number;
  cancelar: (id: number) => void;
}

function relojAnclaPorDefecto(): ProgramadorAncla {
  return {
    programar: (paso) => globalThis.requestAnimationFrame(paso),
    cancelar: (id) => globalThis.cancelAnimationFrame(id),
  };
}

function oyenteGlobalDeGesto(evento: GestoQueCancela, alCancelar: () => void, opciones?: AddEventListenerOptions): void {
  globalThis.addEventListener(evento, alCancelar, opciones);
}

type GestoQueCancela = 'wheel' | 'touchstart' | 'pointerdown' | 'keydown';

function oyentesDeGestoQueCancela(): ReadonlyArray<Readonly<{ evento: GestoQueCancela; opciones: AddEventListenerOptions | undefined }>> {
  return [
    { evento: 'wheel', opciones: { passive: true } },
    { evento: 'touchstart', opciones: { passive: true } },
    { evento: 'pointerdown', opciones: { passive: true } },
    { evento: 'keydown', opciones: undefined },
  ];
}

function scrollAnclaEnEsteFrame(): void {
  instalarIdAnclaProducto();
  const slug = slugDesdeHash(globalThis.location.hash);
  if (slug === null) return;
  const card = document.querySelector<HTMLElement>(`[${ATRIBUTO_ANCLA_PRODUCTO}="${CSS.escape(slug)}"]`);
  card?.scrollIntoView({ block: 'center' });
}

/**
 * Repite el scroll al ancla durante ~1,5 s (ver la rationale de
 * `MAX_FRAMES_INTENTO_ANCLA`), cortando al primer gesto del usuario. Si al
 * montar no hay hash de producto (visita normal), no monta nada.
 */
export function intentarScrollAnclaReiteradamente(
  maxFrames: number = MAX_FRAMES_INTENTO_ANCLA,
  reloj: ProgramadorAncla = relojAnclaPorDefecto(),
): () => void {
  if (slugDesdeHash(globalThis.location.hash) === null) return () => undefined;

  let anulado = false;
  let frames = 0;
  let idProgramado: number | null = null;
  const oyentes: Array<[GestoQueCancela, () => void]> = [];

  const detener = (): void => {
    if (anulado) return;
    anulado = true;
    if (idProgramado !== null) reloj.cancelar(idProgramado);
    for (const [evento, oyente] of oyentes) globalThis.removeEventListener(evento, oyente);
  };

  for (const { evento, opciones } of oyentesDeGestoQueCancela()) {
    const oyente = detener;
    oyenteGlobalDeGesto(evento, oyente, opciones);
    oyentes.push([evento, oyente]);
  }

  const paso = (): void => {
    if (anulado) return;
    scrollAnclaEnEsteFrame();
    if (frames >= maxFrames) {
      detener();
      return;
    }
    frames += 1;
    idProgramado = reloj.programar(paso);
  };

  idProgramado = reloj.programar(paso);
  return detener;
}
