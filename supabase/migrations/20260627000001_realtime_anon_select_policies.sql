-- Supabase Realtime v2 enforces RLS for postgres_changes subscriptions.
-- Without a SELECT policy that returns rows for the anon role, events are
-- silently dropped even if the table is in supabase_realtime publication.
--
-- These policies allow anon clients to receive Realtime events as triggers
-- for subsequent authenticated re-fetches. The frontend never reads the
-- event payload directly — it only uses the event to call /api/* routes
-- that enforce full RLS and tenant isolation.

-- pedido_item_estados: operational data (kitchen/bar states), not PII
CREATE POLICY "Anon puede leer pedido_item_estados (Realtime)"
  ON public.pedido_item_estados FOR SELECT
  TO anon
  USING (true);

-- mesa_sesiones: session state, needed for waiter-login and banner sync
CREATE POLICY "Anon puede leer mesa_sesiones (Realtime)"
  ON public.mesa_sesiones FOR SELECT
  TO anon
  USING (true);

-- pedidos: existing policy only covers tracking_token IS NOT NULL.
-- Mesa orders may not carry tracking_token, so we need a broader policy
-- so INSERT/UPDATE events reach anon Realtime subscribers.
CREATE POLICY "Anon puede leer pedidos (Realtime)"
  ON public.pedidos FOR SELECT
  TO anon
  USING (true);
