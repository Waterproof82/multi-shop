-- T5: RGPD data-retention columns + auto-purge cron job
-- Idempotent: ADD COLUMN IF NOT EXISTS
--
-- anonimizado_en: timestamp when the record was anonymized (right to erasure, RGPD Art.17)
-- ultima_actividad: last known customer activity — used to trigger auto-purge (RGPD Art.5(1)(e))
--
-- Auto-purge: pg_cron job runs daily at 03:00 UTC.
--   Anonymizes records where ultima_actividad < now() - 5 years AND not yet anonymized.
--   5 years: aligns with Art.66 LGT (fiscal obligation retention period).
--   Wrapped in a DO block with extension guard — safe-fails if pg_cron not enabled.

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS anonimizado_en   TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ultima_actividad TIMESTAMPTZ DEFAULT NOW();

-- Index for efficient cron query (full-table scan avoided)
CREATE INDEX IF NOT EXISTS idx_clientes_ultima_actividad
  ON public.clientes (ultima_actividad)
  WHERE anonimizado_en IS NULL;

-- Trigger: update ultima_actividad on clientes when a pedido is inserted
-- Ensures the cron job never purges clients who are still ordering.
CREATE OR REPLACE FUNCTION public.fn_clientes_update_ultima_actividad()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.cliente_id IS NOT NULL THEN
    UPDATE public.clientes
    SET ultima_actividad = NOW()
    WHERE id = NEW.cliente_id
      AND anonimizado_en IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pedidos_ultima_actividad ON public.pedidos;
CREATE TRIGGER trg_pedidos_ultima_actividad
  AFTER INSERT ON public.pedidos
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_clientes_update_ultima_actividad();

-- pg_cron auto-purge job (guard: safe-fail if extension not available)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'rgpd-anonimizar-clientes',
      '0 3 * * *',
      $$
        UPDATE public.clientes
        SET
          nombre        = 'ANONIMIZADO',
          email         = NULL,
          telefono      = NULL,
          anonimizado_en = NOW()
        WHERE anonimizado_en IS NULL
          AND ultima_actividad < NOW() - INTERVAL '5 years';
      $$
    );
  END IF;
END;
$$;
