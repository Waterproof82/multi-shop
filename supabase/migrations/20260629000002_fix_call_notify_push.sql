-- Fix call_notify_push: hardcode the Edge Function URL and pass body as jsonb.
--
-- Two bugs were preventing push notifications from firing:
--
-- 1. The function used current_setting('app.supabase_url') to build the URL.
--    That setting is not configured in this Supabase project, so PostgreSQL
--    raised an exception that was silently swallowed by EXCEPTION WHEN OTHERS.
--    pg_net was never called.
--
-- 2. The body was cast to ::text before being passed to net.http_post(), but
--    net.http_post() expects body as jsonb. The implicit cast path from text
--    to jsonb was not triggering correctly inside the SECURITY DEFINER context.
--
-- Fix: hardcode the URL and pass body directly as jsonb (no ::text cast).

CREATE OR REPLACE FUNCTION public.call_notify_push(empresa_id uuid, event_type text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM net.http_post(
    url := 'https://ugvjrlmoerhvwsqozqfh.supabase.co/functions/v1/notify-push',
    body := jsonb_build_object(
      'empresa_id', empresa_id::text,
      'event_type', event_type
    ),
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 5000
  );
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;
