// src/lib/kit-caducidad/publico.ts
// kit-expiry-m5 (sdd en kitemergenciacanarias, docs/sdd/kit-expiry-reminders/m5/)
// R-M5.4: hasta que M2 publique el estado público del kit
// (`https://pedidos.kitemergenciacanarias.es/kit/{serie}`), las etiquetas PDF
// llevan la marca «MUESTRA — NO IMPRIMIR» en todas sus páginas.
//
// El PR que cierre M2 pone esta constante a `true` y cambia en el mismo
// commit el test que la fija (`tests/kit-caducidad/publico.test.ts`).
//
// kit-expiry-m2a (docs/sdd/kit-expiry-reminders/m2a/), R-M2a.4.1: M2 ya
// publica el estado público del kit en `/kit/{serie}` — última pieza de la
// cadena M2a1→M2a2→M2a3→M2a4. Las etiquetas PDF dejan de llevar la marca de
// muestra (`tests/ui/kit-series-etiquetas.test.tsx`, actualizado en este
// mismo commit).

/** @public — consumido por `generarEtiquetasLote.use-case.ts` (M5a2). */
export const KIT_ESTADO_PUBLICO_LIVE = true;
