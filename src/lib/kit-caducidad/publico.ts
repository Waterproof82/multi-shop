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

// kit-expiry-m2b (docs/sdd/kit-expiry-reminders/m2b/), D-M2b-8/R-M2b.8.1:
// mientras no exista el cron de avisos (M3), publicitar el alta sería
// publicidad engañosa. El formulario de `/kit/{serie}` (M2b8a) y las rutas
// `POST /api/kit-avisos/{alta,enlace}` (M2b6a/M2b6b) comprueban esta
// bandera; la de confirmación/baja (`/api/kit-avisos/gestion`) NO la
// comprueba — la revocación nunca puede depender de una bandera (D-M2b-8).
// La pone a `true` el último commit de M3, junto con su propio test.
/** @public — consumido por el formulario de alta y por las rutas de alta/enlace. */
export const KIT_AVISOS_ALTA_LIVE = false;
