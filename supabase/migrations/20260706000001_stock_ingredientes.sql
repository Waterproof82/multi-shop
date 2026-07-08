CREATE TYPE public.unidad_medida AS ENUM ('kg', 'l', 'ud');

CREATE TABLE public.ingredientes (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      UUID        NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  nombre          TEXT        NOT NULL CHECK (char_length(nombre) <= 120),
  unidad          public.unidad_medida NOT NULL DEFAULT 'ud',
  cantidad_actual NUMERIC(10,3) NOT NULL DEFAULT 0 CHECK (cantidad_actual >= 0),
  umbral_alerta   NUMERIC(10,3) NOT NULL DEFAULT 0 CHECK (umbral_alerta >= 0),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.receta_items (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  producto_id         UUID          NOT NULL REFERENCES public.productos(id) ON DELETE CASCADE,
  ingrediente_id      UUID          NOT NULL REFERENCES public.ingredientes(id) ON DELETE CASCADE,
  cantidad_necesaria  NUMERIC(10,3) NOT NULL CHECK (cantidad_necesaria > 0),
  UNIQUE (producto_id, ingrediente_id)
);

-- Indexes
CREATE INDEX idx_ingredientes_empresa ON public.ingredientes (empresa_id);
CREATE INDEX idx_receta_items_producto ON public.receta_items (producto_id);
CREATE INDEX idx_receta_items_ingrediente ON public.receta_items (ingrediente_id);

-- RLS
ALTER TABLE public.ingredientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receta_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No anon access to ingredientes"
  ON public.ingredientes FOR ALL TO anon USING (false) WITH CHECK (false);

CREATE POLICY "Admin ve ingredientes"
  ON public.ingredientes FOR SELECT TO authenticated
  USING (empresa_id = get_mi_empresa_id());

CREATE POLICY "Admin crea ingredientes"
  ON public.ingredientes FOR INSERT TO authenticated
  WITH CHECK (empresa_id = get_mi_empresa_id());

CREATE POLICY "Admin edita ingredientes"
  ON public.ingredientes FOR UPDATE TO authenticated
  USING (empresa_id = get_mi_empresa_id())
  WITH CHECK (empresa_id = get_mi_empresa_id());

CREATE POLICY "Admin elimina ingredientes"
  ON public.ingredientes FOR DELETE TO authenticated
  USING (empresa_id = get_mi_empresa_id());

CREATE POLICY "No anon access to receta_items"
  ON public.receta_items FOR ALL TO anon USING (false) WITH CHECK (false);

-- receta_items RLS via ingredientes join for empresa isolation
CREATE POLICY "Admin ve receta_items"
  ON public.receta_items FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ingredientes i
      WHERE i.id = ingrediente_id AND i.empresa_id = get_mi_empresa_id()
    )
  );

CREATE POLICY "Admin gestiona receta_items"
  ON public.receta_items FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.ingredientes i
      WHERE i.id = ingrediente_id AND i.empresa_id = get_mi_empresa_id()
    )
  );

CREATE POLICY "Admin edita receta_items"
  ON public.receta_items FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ingredientes i
      WHERE i.id = ingrediente_id AND i.empresa_id = get_mi_empresa_id()
    )
  );

CREATE POLICY "Admin elimina receta_items"
  ON public.receta_items FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ingredientes i
      WHERE i.id = ingrediente_id AND i.empresa_id = get_mi_empresa_id()
    )
  );

-- GRANTs
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ingredientes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ingredientes TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.receta_items TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.receta_items TO authenticated;
