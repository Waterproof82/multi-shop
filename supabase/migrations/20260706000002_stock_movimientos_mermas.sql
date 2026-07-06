CREATE TYPE public.tipo_movimiento AS ENUM ('entrada', 'deduccion', 'ajuste', 'merma', 'sin_receta');
CREATE TYPE public.motivo_merma AS ENUM ('caducidad', 'rotura', 'error_preparacion', 'otro');

CREATE TABLE public.movimientos_stock (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      UUID        NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  ingrediente_id  UUID        NOT NULL REFERENCES public.ingredientes(id) ON DELETE CASCADE,
  tipo            public.tipo_movimiento NOT NULL,
  cantidad        NUMERIC(10,3) NOT NULL,
  referencia_id   UUID,        -- pedido_item_estados pedido_id or merma id
  turno_id        UUID         REFERENCES public.tpv_turnos(id),  -- NULLABLE: unknown for auto-deductions
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.mermas (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id       UUID        NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  ingrediente_id   UUID        NOT NULL REFERENCES public.ingredientes(id) ON DELETE CASCADE,
  cantidad         NUMERIC(10,3) NOT NULL CHECK (cantidad > 0),
  motivo           public.motivo_merma NOT NULL,
  turno_id         UUID        REFERENCES public.tpv_turnos(id),
  operador_nombre  TEXT        NOT NULL CHECK (char_length(operador_nombre) <= 100),
  notas            TEXT        CHECK (char_length(notas) <= 500),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_movimientos_stock_empresa ON public.movimientos_stock (empresa_id);
CREATE INDEX idx_movimientos_stock_ingrediente ON public.movimientos_stock (ingrediente_id);
CREATE INDEX idx_movimientos_stock_turno ON public.movimientos_stock (turno_id);
CREATE INDEX idx_movimientos_stock_created ON public.movimientos_stock (created_at DESC);
CREATE INDEX idx_mermas_empresa ON public.mermas (empresa_id);
CREATE INDEX idx_mermas_turno ON public.mermas (turno_id);

-- RLS
ALTER TABLE public.movimientos_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mermas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No anon access to movimientos_stock"
  ON public.movimientos_stock FOR ALL TO anon USING (false) WITH CHECK (false);

CREATE POLICY "Admin ve movimientos_stock"
  ON public.movimientos_stock FOR SELECT TO authenticated
  USING (empresa_id = get_mi_empresa_id());

CREATE POLICY "Admin inserta movimientos_stock"
  ON public.movimientos_stock FOR INSERT TO authenticated
  WITH CHECK (empresa_id = get_mi_empresa_id());

-- NOTE: No UPDATE or DELETE policy for authenticated — append-only audit log

CREATE POLICY "No anon access to mermas"
  ON public.mermas FOR ALL TO anon USING (false) WITH CHECK (false);

CREATE POLICY "Admin ve mermas"
  ON public.mermas FOR SELECT TO authenticated
  USING (empresa_id = get_mi_empresa_id());

CREATE POLICY "Admin inserta mermas"
  ON public.mermas FOR INSERT TO authenticated
  WITH CHECK (empresa_id = get_mi_empresa_id());

CREATE POLICY "Admin edita mermas"
  ON public.mermas FOR UPDATE TO authenticated
  USING (empresa_id = get_mi_empresa_id())
  WITH CHECK (empresa_id = get_mi_empresa_id());

CREATE POLICY "Admin elimina mermas"
  ON public.mermas FOR DELETE TO authenticated
  USING (empresa_id = get_mi_empresa_id());

-- GRANTs
GRANT SELECT, INSERT, UPDATE, DELETE ON public.movimientos_stock TO service_role;
GRANT SELECT, INSERT ON public.movimientos_stock TO authenticated;  -- NO UPDATE/DELETE

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mermas TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mermas TO authenticated;
