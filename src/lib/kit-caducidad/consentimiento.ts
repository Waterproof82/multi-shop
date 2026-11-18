// src/lib/kit-caducidad/consentimiento.ts
// kit-expiry-m2b (sdd en kitemergenciacanarias, docs/sdd/kit-expiry-reminders/m2b/)
// R-M2b.1.3/R-M2b.1.4: los tres textos de las casillas del formulario de
// alta de avisos (`/kit/{serie}`), con su versión.
//
// Si CUALQUIER palabra de estos textos cambia, hay que subir
// `TEXTO_CONSENTIMIENTO_VERSION` en el mismo commit — y recalcular el hash
// que fija `tests/kit-caducidad/consentimiento.test.ts` (HASH_V1) — porque
// los suscriptores ya registrados consintieron la versión anterior, no la
// nueva. Son los textos EXACTOS que ve y marca el titular (DD1 de proposal.md).

/**
 * @public — consumido por `FormularioAvisosKit` (M2b8a) y por
 * `kit-avisos.dto.ts` (M2b1) para validar el DTO del alta.
 *
 * [0] privacidad (obligatoria), [1] email (obligatoria para el alta),
 * [2] WhatsApp (opcional; si se marca, exige teléfono).
 */
export const TEXTOS_CONSENTIMIENTO = [
  'He leído y acepto la política de privacidad.',
  'Quiero recibir por email un aviso 30 y 15 días antes de que caduque algún consumible de mi kit. Cada aviso incluye un enlace para comprar el recambio.',
  'Quiero recibir también estos avisos por WhatsApp cuando el servicio esté disponible. Cada aviso incluirá un enlace para comprar el recambio.',
] as const;

/** @public — se guarda en `kits_registrados.texto_consentimiento_version` (máx. 32 caracteres, CHECK en M1). */
export const TEXTO_CONSENTIMIENTO_VERSION = 'kit-avisos-v1';
