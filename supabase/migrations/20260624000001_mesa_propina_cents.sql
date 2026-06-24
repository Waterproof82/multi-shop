-- Add propina_cents to mesa_sesiones
-- Stores the tip amount (in cents) agreed upon by the table participants.
-- Defaults to 0. Updated by any participant via PATCH /api/mesas/[mesaId]/propina.
-- The Redsys use case reads this column and adds it to the charged amount.

ALTER TABLE public.mesa_sesiones
  ADD COLUMN IF NOT EXISTS propina_cents INT NOT NULL DEFAULT 0;
