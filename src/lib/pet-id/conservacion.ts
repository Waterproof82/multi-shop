// src/lib/pet-id/conservacion.ts
// sdd pet-id-qr-profile (docs/sdd/pet-id-qr-profile/, kitemergenciacanarias)
// DD16 (design.md): cada confirmación y cada edición desde la gestión
// fijan `confirmado_at = now()`, así se demuestra que la voluntad de
// publicar el perfil sigue vigente. El plazo de conservación son 3 años
// desde la última confirmación. La purga automática a los 3 años y el
// email de renovación quedan fuera del MVP (R10 de tasks.md) — los vigila
// `tests/pet-id/pet-conservacion-tripwire.test.ts`, que falla a partir del
// 2029-05-19 si esta bandera sigue en `false`.

/** @public — años de conservación desde la última confirmación (DD16). */
export const PLAZO_CONSERVACION_ANIOS = 3;

/**
 * `false` mientras la purga a los 3 años y el email de renovación no estén
 * implementados (fuera del MVP, R10 de tasks.md). El PR que los implemente
 * la pone a `true` en el mismo commit que actualiza el tripwire.
 *
 * @public — consumido únicamente por el tripwire de conservación.
 */
export const RENOVACION_PERFIL_IMPLEMENTADA = false;
