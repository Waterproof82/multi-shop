# Kit de emergencia: caducidades y avisos (en producción)

**Estado a 2026-11-20: completado y en producción para KEC** (empresa con `kits_caducidad_habilitado = true`).

La documentación completa (decisiones, spec, diseño, flujo del cliente, pendientes y trampas) vive en el repo `Waterproof82/kitemergenciacanarias`:

- Punto de entrada: `docs/sdd/kit-expiry-reminders/RETOMAR.md` (§0 «Estado final»).
- Detalle por pieza: `docs/sdd/kit-expiry-reminders/{m2a,m2b,m3,m4,m5}/`.
- Pendientes: `docs/PENDIENTES.md` §6.

## Qué hay en este repo

| Pieza | Dónde | PRs |
|---|---|---|
| Tablas, RLS y vista `kit_lote_caducidades_efectivas` | `supabase/migrations/20261117000001_kit_caducidades.sql`, `20261118000001_empresas_kits_caducidad.sql` | #173, #174 |
| Panel de admin: lotes, caducidades, series, kits registrados | `src/app/admin/(protected)/kits/`, `src/app/api/admin/kits/` | #174–#183, #226, #228 |
| Etiquetas PDF con dos QR | `src/core/infrastructure/pdf/etiquetas-kit.renderer.ts`, `/api/admin/kits/lotes/[id]/etiquetas` | #184–#187 |
| Página pública `/kit/{serie}` (estado, sin datos personales) | `src/app/kit/[serie]/` | #188–#193 |
| Alta de avisos (doble opt-in), gestión y baja | `src/app/api/kit-avisos/{alta,gestion,enlace,baja}`, `src/app/kit/avisos/[token]/` | #194–#210, #223 |
| Cron diario de avisos y purgas | `src/app/api/cron/kit-avisos/route.ts` (`0 8 * * *` UTC) | #211–#225, #227, #228 |
| Línea de la etiqueta QR en la confirmación del pedido | `confirmacion-pedido-email.builder.ts` (`avisoEtiquetaKit`) | #230 |

Lógica pura en `src/lib/kit-caducidad/` y tests en `tests/kit-caducidad/`.

## Interruptores

- `empresas.kits_caducidad_habilitado` (superadmin, columna «Kits»): módulo por empresa.
- `KIT_ESTADO_PUBLICO_LIVE` y `KIT_AVISOS_ALTA_LIVE` (`src/lib/kit-caducidad/publico.ts`): ambos `true`.
- `kit_avisos_config.avisos_pausados`: pausa de emergencia. Aún sin botón en el panel (SQL en `m3/tasks.md` del otro repo).

## Trampas

- **`BREVO_DEFAULT_SENDER_EMAIL` no está configurada en Vercel.** Todo `sendEmail` nuevo debe pasar `senderEmail`; sin él lanza «Sender email not configured».
- **Las tareas en `after()` no dejan rastro si lanzan.** Las de avisos usan `programarConRegistro` (registra en `log_errors`); úsalo en cualquier envío en segundo plano.
- **El *preview* de Vercel resuelve otra tienda** (su dominio no es el de KEC): las pruebas de KEC se hacen en producción con datos de prueba que luego se borran.
- **Un alta pendiente de menos de 48 h bloquea otra en la misma serie** (por diseño).
- **El cron se lanza sin exponer el secreto** con el botón «Run» de Vercel → Settings → Cron Jobs.
