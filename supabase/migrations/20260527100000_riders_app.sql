-- ============================================================
-- DELIVERY APP — Glovo LaaS integration
-- 20260527100000_riders_app.sql
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. PEDIDOS: additive columns
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS direccion_entrega       TEXT,
  ADD COLUMN IF NOT EXISTS codigo_postal          TEXT CHECK (char_length(codigo_postal) <= 10),
  ADD COLUMN IF NOT EXISTS latitude_entrega       DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude_entrega      DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS payment_status         TEXT NOT NULL DEFAULT 'not_required'
                             CHECK (payment_status IN ('not_required','pending','paid','failed')),
  ADD COLUMN IF NOT EXISTS payment_order_ref      TEXT,
  ADD COLUMN IF NOT EXISTS payment_amount_cents   INT,
  ADD COLUMN IF NOT EXISTS glovo_order_id         TEXT,
  ADD COLUMN IF NOT EXISTS delivery_fee_cents     INT,
  ADD COLUMN IF NOT EXISTS glovo_status           TEXT;

-- Remove glovo_quote_id — it doesn't exist in the real API
CREATE UNIQUE INDEX IF NOT EXISTS idx_pedidos_payment_order_ref_empresa
  ON public.pedidos(empresa_id, payment_order_ref)
  WHERE payment_order_ref IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pedidos_glovo_order_id
  ON public.pedidos(glovo_order_id) WHERE glovo_order_id IS NOT NULL;

-- ────────────────────────────────────────────────────────────
-- 2. EMPRESAS: additive columns
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS delivery_min_order_cents   INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_fee_surcharge_cents INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS glovo_client_id            TEXT,
  ADD COLUMN IF NOT EXISTS glovo_key_id               TEXT,
  ADD COLUMN IF NOT EXISTS glovo_private_key          TEXT,  -- RSA private key PEM
  ADD COLUMN IF NOT EXISTS glovo_vendor_id            TEXT,  -- client_vendor_id for the outlet
  ADD COLUMN IF NOT EXISTS glovo_country_code         TEXT DEFAULT 'es',
  ADD COLUMN IF NOT EXISTS redsys_merchant_code       TEXT,
  ADD COLUMN IF NOT EXISTS redsys_terminal            TEXT DEFAULT '001',
  ADD COLUMN IF NOT EXISTS redsys_secret_key          TEXT;

-- ────────────────────────────────────────────────────────────
-- 3. Anon RLS on pedidos — Realtime tracking_token access
-- ────────────────────────────────────────────────────────────
CREATE POLICY "Anon puede leer pedido por tracking_token"
  ON public.pedidos FOR SELECT TO anon
  USING (tracking_token IS NOT NULL);

GRANT SELECT ON public.pedidos TO anon;
