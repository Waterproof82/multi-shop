-- Add pase column to pedido_item_estados
-- Allows per-item course assignment (primer/segundo/postre/bebida)
-- This enables the waiter to assign and override pase per item in the pendientes panel

ALTER TABLE public.pedido_item_estados
  ADD COLUMN IF NOT EXISTS pase TEXT DEFAULT NULL
  CHECK (pase IN ('primer', 'segundo', 'postre', 'bebida'));

-- GRANTs (Supabase Data API requires explicit table grants)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pedido_item_estados TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pedido_item_estados TO authenticated;
