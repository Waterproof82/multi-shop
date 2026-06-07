-- Each division payment attempt gets its own row with a unique payment_order_ref.
-- This prevents the race condition where two concurrent initiations overwrite the same
-- anchor pedido's payment_order_ref, causing one payment to be silently lost.

CREATE TABLE public.mesa_division_pagos (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  sesion_id            UUID        NOT NULL REFERENCES public.mesa_sesiones(id),
  empresa_id           UUID        NOT NULL,
  payment_order_ref    TEXT        NOT NULL,
  payment_amount_cents INTEGER     NOT NULL,
  status               TEXT        NOT NULL DEFAULT 'pending',  -- pending | paid | failed
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT mesa_division_pagos_ref_unique UNIQUE (payment_order_ref),
  CONSTRAINT mesa_division_pagos_status_check CHECK (status IN ('pending', 'paid', 'failed'))
);

CREATE INDEX mesa_division_pagos_sesion_idx ON public.mesa_division_pagos(sesion_id);

ALTER TABLE public.mesa_division_pagos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No direct anon access to mesa_division_pagos"
  ON public.mesa_division_pagos FOR ALL TO anon
  USING (false) WITH CHECK (false);

-- service_role: backend bypasses RLS but still needs the table grant
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mesa_division_pagos TO service_role;
