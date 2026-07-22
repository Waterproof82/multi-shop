-- Consentimiento RGPD en tabla clientes
-- Art.7 RGPD: registro del momento exacto en que se otorgó el consentimiento
-- Art.6(1)(b): terms_accepted_at → ejecución del contrato (pedido)
-- Art.6(1)(a): marketing_consent_at → consentimiento explícito para promociones
--
-- Nota: aceptar_promociones (boolean) ya existe y es la fuente de verdad.
-- marketing_consent_at añade el timestamp auditabl del opt-in/opt-out.

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS terms_accepted_at    TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS marketing_consent_at TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN public.clientes.terms_accepted_at    IS 'Momento en que el cliente aceptó la política de privacidad al realizar un pedido (Art.6(1)(b) RGPD)';
COMMENT ON COLUMN public.clientes.marketing_consent_at IS 'Último cambio de consentimiento de marketing; NULL si nunca se pronunció (Art.6(1)(a) RGPD)';
