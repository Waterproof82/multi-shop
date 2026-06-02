-- Single source of truth for paid session status.
-- Set by the Redsys webhook on full payment or final division share.
ALTER TABLE public.mesa_sesiones
  ADD COLUMN IF NOT EXISTS sesion_pagada BOOLEAN NOT NULL DEFAULT FALSE;
