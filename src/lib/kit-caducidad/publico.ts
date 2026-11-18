// src/lib/kit-caducidad/publico.ts
// kit-expiry-m5 (sdd en kitemergenciacanarias, docs/sdd/kit-expiry-reminders/m5/)
// R-M5.4: hasta que M2 publique el estado público del kit
// (`https://pedidos.kitemergenciacanarias.es/kit/{serie}`), las etiquetas PDF
// llevan la marca «MUESTRA — NO IMPRIMIR» en todas sus páginas.
//
// El PR que cierre M2 pone esta constante a `true` y cambia en el mismo
// commit el test que la fija (`tests/kit-caducidad/publico.test.ts`).

/** @public — consumido por `generarEtiquetasLote.use-case.ts` (M5a2). */
export const KIT_ESTADO_PUBLICO_LIVE = false;
