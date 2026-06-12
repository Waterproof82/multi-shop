-- mesa_pagos_personalizados: one row per custom payment turn
CREATE TABLE public.mesa_pagos_personalizados (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  sesion_id         UUID        NOT NULL REFERENCES public.mesa_sesiones(id) ON DELETE CASCADE,
  empresa_id        UUID        NOT NULL,
  seleccion         JSONB       NOT NULL DEFAULT '[]',
  -- [{pedido_id: UUID, item_idx: int, unidades: int}]
  importe_cents     INTEGER     NULL,
  payment_order_ref TEXT        NULL,
  status            TEXT        NOT NULL DEFAULT 'en_seleccion',
  -- 'en_seleccion' | 'en_pago' | 'pagado' | 'cancelado'
  expires_at        TIMESTAMPTZ NOT NULL DEFAULT now() + interval '10 minutes',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT mpp_status_check CHECK (status IN ('en_seleccion','en_pago','pagado','cancelado')),
  CONSTRAINT mpp_ref_unique   UNIQUE (payment_order_ref)
);

CREATE INDEX mpp_sesion_idx ON public.mesa_pagos_personalizados(sesion_id);
CREATE INDEX mpp_status_idx ON public.mesa_pagos_personalizados(status);
CREATE INDEX mpp_empresa_idx ON public.mesa_pagos_personalizados(empresa_id);

-- mesa_item_pagos: accumulated paid item units (source of truth for remaining)
CREATE TABLE public.mesa_item_pagos (
  id                   UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  sesion_id            UUID    NOT NULL REFERENCES public.mesa_sesiones(id) ON DELETE CASCADE,
  empresa_id           UUID    NOT NULL,
  pedido_id            UUID    NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
  item_idx             INTEGER NOT NULL,
  unidades_pagadas     INTEGER NOT NULL,
  importe_pagado_cents INTEGER NOT NULL DEFAULT 0,
  turno_id             UUID    NOT NULL REFERENCES public.mesa_pagos_personalizados(id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT mip_unique_item_per_turno UNIQUE (pedido_id, item_idx, turno_id)
);

CREATE INDEX mip_sesion_idx ON public.mesa_item_pagos(sesion_id);
CREATE INDEX mip_turno_idx  ON public.mesa_item_pagos(turno_id);
CREATE INDEX mip_empresa_idx ON public.mesa_item_pagos(empresa_id);

-- Extend mesa_sesiones
ALTER TABLE public.mesa_sesiones
  ADD COLUMN IF NOT EXISTS division_tipo      TEXT NULL,
  -- NULL | 'igual' | 'personalizado'
  ADD COLUMN IF NOT EXISTS custom_turno_id   UUID NULL
    REFERENCES public.mesa_pagos_personalizados(id),
  ADD COLUMN IF NOT EXISTS division_base_cents INTEGER NULL;
  -- used when switching remaining amount to equal split

ALTER TABLE public.mesa_sesiones
  ADD CONSTRAINT mesa_sesiones_division_tipo_check
    CHECK (division_tipo IN ('igual', 'personalizado'));

-- RLS: deny anon, grant service_role (same pattern as mesa_division_pagos)
ALTER TABLE public.mesa_pagos_personalizados ENABLE ROW LEVEL SECURITY;
CREATE POLICY "No direct anon access to mesa_pagos_personalizados"
  ON public.mesa_pagos_personalizados FOR ALL TO anon
  USING (false) WITH CHECK (false);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mesa_pagos_personalizados TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mesa_pagos_personalizados TO authenticated;

ALTER TABLE public.mesa_item_pagos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "No direct anon access to mesa_item_pagos"
  ON public.mesa_item_pagos FOR ALL TO anon
  USING (false) WITH CHECK (false);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mesa_item_pagos TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mesa_item_pagos TO authenticated;

-- Enable Realtime so the client can subscribe to item payment updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.mesa_item_pagos;
