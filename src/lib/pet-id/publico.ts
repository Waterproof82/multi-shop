// src/lib/pet-id/publico.ts
// sdd pet-id-qr-profile (docs/sdd/pet-id-qr-profile/, kitemergenciacanarias)
// design.md/PR encadenados: cada PR previo al 17 deja estas banderas en
// `false`, así que es inerte en producción aunque despliegue. El PR17 las
// pone a `true`, con su test estático actualizado en el mismo commit
// (mismo patrón que `kit-caducidad/publico.ts`).

/** @public — consumido por el cargador del perfil público (PR9) y por las rutas de alta (PR10/PR11). */
export const PET_PERFIL_PUBLICO_LIVE = false;

/** @public — consumido por la ruta de alta (PR10) y el formulario `/m/activar` (PR11). */
export const PET_ALTA_LIVE = false;
