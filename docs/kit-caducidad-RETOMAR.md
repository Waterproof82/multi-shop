# Kit de emergencia: caducidades y avisos (en curso)

Rama: `ccr-41af60d5-609gvo`. Feature compartida con el repo `Waterproof82/kitemergenciacanarias`.

**Las instrucciones completas para retomar están allí, en la misma rama:**
`docs/sdd/kit-expiry-reminders/RETOMAR.md`

Ese documento cubre el estado del trabajo, el orden de lo pendiente, los bloqueos y las trampas. La especificación y el diseño están en `docs/sdd/kit-expiry-reminders/` de ese repo.

## Lo que ya hay en este repo

- `src/lib/kit-caducidad/`: series KEC, estado del kit y avisos debidos. Es lógica pura y tiene 22 tests en `tests/kit-caducidad/`.
- `supabase/migrations/20261117000001_kit_caducidades.sql`: crea 5 tablas con RLS.
  - ⚠️ **No está aplicada.** Para aplicarla, ejecuta `supabase db push --linked` y después `pnpm db:smoke` y `pnpm e2e:db`.

## Siguiente en este repo

1. M4: panel de lotes y series.
2. M5: etiquetas con los dos QR.
3. M2: página `/kit/{serie}`. Antes de escribir sus textos de consentimiento hay que verificar la LSSI en el BOE.
4. M3: cron diario de avisos.
