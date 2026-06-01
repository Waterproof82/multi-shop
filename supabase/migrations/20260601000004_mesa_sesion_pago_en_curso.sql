-- Lock fields: set when any user initiates payment, cleared when webhook resolves.
-- pago_iniciado_en enables auto-expiry after 15 min for abandoned payments.
ALTER TABLE public.mesa_sesiones
  ADD COLUMN pago_en_curso    BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN pago_iniciado_en TIMESTAMPTZ;
