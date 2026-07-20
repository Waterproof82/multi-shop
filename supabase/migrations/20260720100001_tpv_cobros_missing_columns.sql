-- T1: Add missing columns to tpv_cobros
-- Idempotent: ADD COLUMN IF NOT EXISTS
-- rectifica_cobro_id: self-reference for rectificative tickets (RD 1619/2012)
-- descuento_cents: discount amount applied before tax calculation

ALTER TABLE public.tpv_cobros
  ADD COLUMN IF NOT EXISTS rectifica_cobro_id UUID REFERENCES public.tpv_cobros(id),
  ADD COLUMN IF NOT EXISTS descuento_cents     INTEGER NOT NULL DEFAULT 0;
