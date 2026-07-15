-- supabase/migrations/20260715000001_modulo_compras_sialti.sql
-- Módulo de Compras SIALTI: proveedores, catálogo, pedidos, albaranes, facturas
-- Compliance: Reg. CE 178/2002 (trazabilidad), Ley Antifraude 11/2021 (inmutabilidad), RD 1619/2012 (IVA)

BEGIN;

-- ============================================================
-- 1. EXTENSIONES A TABLAS EXISTENTES
-- ============================================================

ALTER TABLE public.ingredientes
  ADD COLUMN IF NOT EXISTS es_perecedero BOOLEAN NOT NULL DEFAULT FALSE;

-- Extender CHECK constraint de tpv_turno_eventos para añadir 'compra_proveedor'
ALTER TABLE public.tpv_turno_eventos
  DROP CONSTRAINT IF EXISTS tpv_turno_eventos_tipo_evento_check;
ALTER TABLE public.tpv_turno_eventos
  ADD CONSTRAINT tpv_turno_eventos_tipo_evento_check
  CHECK (tipo_evento IN (
    'apertura', 'cierre', 'entrada_caja', 'salida_caja',
    'apertura_cajon_sin_venta', 'arqueo_parcial', 'descuadre',
    'compra_proveedor'
  ));
-- NOTA: 'compra_proveedor' se inserta via service_role (backend), no via policy authenticated

-- ============================================================
-- 2. PROVEEDORES
-- ============================================================

CREATE TABLE IF NOT EXISTS public.proveedores (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id       UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  nombre           TEXT NOT NULL CHECK (char_length(nombre) <= 200),
  cif              TEXT CHECK (char_length(cif) <= 20),
  email            TEXT CHECK (char_length(email) <= 200),
  telefono         TEXT CHECK (char_length(telefono) <= 30),
  condiciones_pago TEXT CHECK (char_length(condiciones_pago) <= 500),
  direccion_fiscal TEXT CHECK (char_length(direccion_fiscal) <= 500),
  observaciones    TEXT CHECK (char_length(observaciones) <= 1000),
  activo           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unique_empresa_cif UNIQUE (empresa_id, cif)
);
CREATE INDEX IF NOT EXISTS idx_proveedores_empresa_id ON public.proveedores (empresa_id);

ALTER TABLE public.proveedores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon no access proveedores" ON public.proveedores
  FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY "admin CRUD proveedores" ON public.proveedores
  FOR ALL TO authenticated
  USING (empresa_id = get_mi_empresa_id())
  WITH CHECK (empresa_id = get_mi_empresa_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.proveedores TO service_role, authenticated;

-- ============================================================
-- 3. CATALOGO DE COMPRA (soporta IVA 0% para exentos/intracomunitarios)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.catalogo_compra (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id            UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  proveedor_id          UUID NOT NULL REFERENCES public.proveedores(id) ON DELETE CASCADE,
  ingrediente_id        UUID NOT NULL REFERENCES public.ingredientes(id) ON DELETE CASCADE,
  referencia_proveedor  TEXT CHECK (char_length(referencia_proveedor) <= 100),
  descripcion           TEXT CHECK (char_length(descripcion) <= 300),
  precio_compra_cents   INTEGER NOT NULL CHECK (precio_compra_cents >= 0),
  unidad_compra         TEXT NOT NULL CHECK (char_length(unidad_compra) <= 50),
  factor_conversion     NUMERIC(12,4) NOT NULL CHECK (factor_conversion > 0),
  porcentaje_iva        INTEGER NOT NULL CHECK (porcentaje_iva IN (0, 4, 10, 21)),
  activo                BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unique_proveedor_ingrediente UNIQUE (proveedor_id, ingrediente_id)
);
CREATE INDEX IF NOT EXISTS idx_catalogo_compra_empresa_id ON public.catalogo_compra (empresa_id);
CREATE INDEX IF NOT EXISTS idx_catalogo_compra_proveedor_id ON public.catalogo_compra (proveedor_id);
CREATE INDEX IF NOT EXISTS idx_catalogo_compra_ingrediente_id ON public.catalogo_compra (ingrediente_id);

ALTER TABLE public.catalogo_compra ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon no access catalogo_compra" ON public.catalogo_compra
  FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY "admin CRUD catalogo_compra" ON public.catalogo_compra
  FOR ALL TO authenticated
  USING (empresa_id = get_mi_empresa_id())
  WITH CHECK (empresa_id = get_mi_empresa_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalogo_compra TO service_role, authenticated;

-- ============================================================
-- 4. PEDIDOS DE COMPRA
-- ============================================================

CREATE TABLE IF NOT EXISTS public.pedidos_compra (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id             UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  proveedor_id           UUID NOT NULL REFERENCES public.proveedores(id),
  numero_pedido          TEXT NOT NULL CHECK (char_length(numero_pedido) <= 50),
  estado                 TEXT NOT NULL DEFAULT 'borrador'
                         CHECK (estado IN ('borrador', 'enviado', 'recibido', 'cancelado')),
  notas                  TEXT CHECK (char_length(notas) <= 1000),
  fecha_pedido           DATE NOT NULL DEFAULT CURRENT_DATE,
  fecha_entrega_estimada DATE,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unique_empresa_numero_pedido UNIQUE (empresa_id, numero_pedido)
);
CREATE INDEX IF NOT EXISTS idx_pedidos_compra_empresa_id ON public.pedidos_compra (empresa_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_compra_proveedor_id ON public.pedidos_compra (proveedor_id);

ALTER TABLE public.pedidos_compra ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon no access pedidos_compra" ON public.pedidos_compra
  FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY "admin CRUD pedidos_compra" ON public.pedidos_compra
  FOR ALL TO authenticated
  USING (empresa_id = get_mi_empresa_id())
  WITH CHECK (empresa_id = get_mi_empresa_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pedidos_compra TO service_role, authenticated;

CREATE TABLE IF NOT EXISTS public.pedidos_compra_items (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_compra_id    UUID NOT NULL REFERENCES public.pedidos_compra(id) ON DELETE CASCADE,
  catalogo_compra_id  UUID NOT NULL REFERENCES public.catalogo_compra(id),
  cantidad            NUMERIC(12,4) NOT NULL CHECK (cantidad > 0),
  precio_compra_cents INTEGER NOT NULL CHECK (precio_compra_cents >= 0),
  porcentaje_iva      INTEGER NOT NULL CHECK (porcentaje_iva IN (0, 4, 10, 21)),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pedidos_compra_items_pedido ON public.pedidos_compra_items (pedido_compra_id);

ALTER TABLE public.pedidos_compra_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon no access pedidos_compra_items" ON public.pedidos_compra_items
  FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY "admin CRUD pedidos_compra_items" ON public.pedidos_compra_items
  FOR ALL TO authenticated
  USING (
    pedido_compra_id IN (
      SELECT id FROM public.pedidos_compra WHERE empresa_id = get_mi_empresa_id()
    )
  )
  WITH CHECK (
    pedido_compra_id IN (
      SELECT id FROM public.pedidos_compra WHERE empresa_id = get_mi_empresa_id()
    )
  );
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pedidos_compra_items TO service_role, authenticated;

-- ============================================================
-- 5. ALBARANES DE COMPRA
-- ============================================================

CREATE TABLE IF NOT EXISTS public.albaranes_compra (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id       UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  proveedor_id     UUID NOT NULL REFERENCES public.proveedores(id),
  pedido_compra_id UUID REFERENCES public.pedidos_compra(id),
  numero_albaran   TEXT NOT NULL CHECK (char_length(numero_albaran) <= 100),
  estado           TEXT NOT NULL DEFAULT 'borrador'
                   CHECK (estado IN ('borrador', 'recibido')),
  fecha_recepcion  DATE,
  notas            TEXT CHECK (char_length(notas) <= 1000),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unique_empresa_proveedor_albaran UNIQUE (empresa_id, proveedor_id, numero_albaran)
);
CREATE INDEX IF NOT EXISTS idx_albaranes_compra_empresa_id ON public.albaranes_compra (empresa_id);
CREATE INDEX IF NOT EXISTS idx_albaranes_compra_proveedor_id ON public.albaranes_compra (proveedor_id);

ALTER TABLE public.albaranes_compra ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon no access albaranes_compra" ON public.albaranes_compra
  FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY "admin CRUD albaranes_compra" ON public.albaranes_compra
  FOR ALL TO authenticated
  USING (empresa_id = get_mi_empresa_id())
  WITH CHECK (empresa_id = get_mi_empresa_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.albaranes_compra TO service_role, authenticated;

CREATE TABLE IF NOT EXISTS public.albaranes_compra_items (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  albaran_compra_id   UUID NOT NULL REFERENCES public.albaranes_compra(id) ON DELETE CASCADE,
  catalogo_compra_id  UUID NOT NULL REFERENCES public.catalogo_compra(id),
  cantidad_recibida   NUMERIC(12,4) NOT NULL CHECK (cantidad_recibida > 0),
  precio_compra_cents INTEGER NOT NULL CHECK (precio_compra_cents >= 0),
  porcentaje_iva      INTEGER NOT NULL CHECK (porcentaje_iva IN (0, 4, 10, 21)),
  numero_lote         TEXT CHECK (char_length(numero_lote) <= 100),
  fecha_caducidad     DATE,
  movimiento_stock_id UUID REFERENCES public.movimientos_stock(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_albaranes_compra_items_albaran ON public.albaranes_compra_items (albaran_compra_id);

ALTER TABLE public.albaranes_compra_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon no access albaranes_compra_items" ON public.albaranes_compra_items
  FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY "admin CRUD albaranes_compra_items" ON public.albaranes_compra_items
  FOR ALL TO authenticated
  USING (
    albaran_compra_id IN (
      SELECT id FROM public.albaranes_compra WHERE empresa_id = get_mi_empresa_id()
    )
  )
  WITH CHECK (
    albaran_compra_id IN (
      SELECT id FROM public.albaranes_compra WHERE empresa_id = get_mi_empresa_id()
    )
  );
GRANT SELECT, INSERT, UPDATE, DELETE ON public.albaranes_compra_items TO service_role, authenticated;

-- ============================================================
-- 6. FACTURAS DE PROVEEDOR (con base 0% para exentos/intracomunitarios)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.facturas_proveedor (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id              UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  proveedor_id            UUID NOT NULL REFERENCES public.proveedores(id),
  numero_factura          TEXT NOT NULL CHECK (char_length(numero_factura) <= 100),
  fecha_factura           DATE NOT NULL,
  base_imponible_0_cents  INTEGER NOT NULL DEFAULT 0 CHECK (base_imponible_0_cents >= 0),
  base_imponible_4_cents  INTEGER NOT NULL DEFAULT 0 CHECK (base_imponible_4_cents >= 0),
  base_imponible_10_cents INTEGER NOT NULL DEFAULT 0 CHECK (base_imponible_10_cents >= 0),
  base_imponible_21_cents INTEGER NOT NULL DEFAULT 0 CHECK (base_imponible_21_cents >= 0),
  iva_soportado_cents     INTEGER NOT NULL DEFAULT 0 CHECK (iva_soportado_cents >= 0),
  total_factura_cents     INTEGER NOT NULL CHECK (total_factura_cents >= 0),
  estado_pago             TEXT NOT NULL DEFAULT 'pendiente'
                          CHECK (estado_pago IN ('pendiente', 'pagado_caja', 'pagado_banco')),
  notas                   TEXT CHECK (char_length(notas) <= 1000),
  turno_id                UUID,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unique_proveedor_factura UNIQUE (empresa_id, proveedor_id, numero_factura)
);
CREATE INDEX IF NOT EXISTS idx_facturas_proveedor_empresa_id ON public.facturas_proveedor (empresa_id);
CREATE INDEX IF NOT EXISTS idx_facturas_proveedor_proveedor_id ON public.facturas_proveedor (proveedor_id);

ALTER TABLE public.facturas_proveedor ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon no access facturas_proveedor" ON public.facturas_proveedor
  FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY "admin CRUD facturas_proveedor" ON public.facturas_proveedor
  FOR ALL TO authenticated
  USING (empresa_id = get_mi_empresa_id())
  WITH CHECK (empresa_id = get_mi_empresa_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.facturas_proveedor TO service_role, authenticated;

CREATE TABLE IF NOT EXISTS public.facturas_proveedor_albaranes (
  factura_proveedor_id UUID NOT NULL REFERENCES public.facturas_proveedor(id) ON DELETE CASCADE,
  albaran_compra_id    UUID NOT NULL REFERENCES public.albaranes_compra(id) ON DELETE RESTRICT,
  PRIMARY KEY (factura_proveedor_id, albaran_compra_id)
);

ALTER TABLE public.facturas_proveedor_albaranes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon no access facturas_albaranes" ON public.facturas_proveedor_albaranes
  FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY "admin CRUD facturas_albaranes" ON public.facturas_proveedor_albaranes
  FOR ALL TO authenticated
  USING (
    factura_proveedor_id IN (
      SELECT id FROM public.facturas_proveedor WHERE empresa_id = get_mi_empresa_id()
    )
  )
  WITH CHECK (
    factura_proveedor_id IN (
      SELECT id FROM public.facturas_proveedor WHERE empresa_id = get_mi_empresa_id()
    )
  );
GRANT SELECT, INSERT, UPDATE, DELETE ON public.facturas_proveedor_albaranes TO service_role, authenticated;

-- ============================================================
-- 7. TRIGGER INMUTABILIDAD ALBARANES (Ley Antifraude 11/2021)
-- ============================================================

CREATE OR REPLACE FUNCTION public.block_albaran_alteration()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.estado = 'recibido' THEN
    RAISE EXCEPTION 'SIALTI: Los albaranes en estado recibido son inalterables (Ley Antifraude 11/2021).';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_albaranes_immutable ON public.albaranes_compra;
CREATE TRIGGER trigger_albaranes_immutable
  BEFORE UPDATE ON public.albaranes_compra
  FOR EACH ROW EXECUTE FUNCTION public.block_albaran_alteration();

CREATE OR REPLACE FUNCTION public.block_albaran_deletion()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.estado = 'recibido' THEN
    RAISE EXCEPTION 'SIALTI: Los albaranes en estado recibido no pueden eliminarse (Ley Antifraude 11/2021).';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_albaranes_no_delete ON public.albaranes_compra;
CREATE TRIGGER trigger_albaranes_no_delete
  BEFORE DELETE ON public.albaranes_compra
  FOR EACH ROW EXECUTE FUNCTION public.block_albaran_deletion();

-- ============================================================
-- 8. RPC: recibir_albaran_transaccional (atomicidad absoluta — R3)
-- ============================================================

CREATE OR REPLACE FUNCTION public.recibir_albaran_transaccional(
  p_albaran_id UUID,
  p_empresa_id UUID,
  p_empleado_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_item     RECORD;
  v_cantidad NUMERIC;
  v_mov_id   UUID;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.albaranes_compra
    WHERE id = p_albaran_id AND empresa_id = p_empresa_id AND estado = 'borrador'
    FOR UPDATE
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Albaran no encontrado, no pertenece a la empresa, o ya fue recibido.');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.albaranes_compra_items WHERE albaran_compra_id = p_albaran_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'El albaran no tiene items.');
  END IF;

  FOR v_item IN (
    SELECT
      aci.id            AS item_id,
      aci.cantidad_recibida,
      aci.numero_lote,
      aci.fecha_caducidad,
      cc.ingrediente_id,
      cc.factor_conversion
    FROM public.albaranes_compra_items aci
    JOIN public.catalogo_compra cc ON cc.id = aci.catalogo_compra_id
    WHERE aci.albaran_compra_id = p_albaran_id
  ) LOOP
    v_cantidad := v_item.cantidad_recibida * v_item.factor_conversion;

    INSERT INTO public.movimientos_stock (
      empresa_id, ingrediente_id, tipo, cantidad, referencia_id
    ) VALUES (
      p_empresa_id,
      v_item.ingrediente_id,
      'entrada',
      v_cantidad,
      p_albaran_id
    )
    RETURNING id INTO v_mov_id;

    UPDATE public.albaranes_compra_items
    SET movimiento_stock_id = v_mov_id
    WHERE id = v_item.item_id;

    UPDATE public.ingredientes
    SET cantidad_actual = cantidad_actual + v_cantidad
    WHERE id = v_item.ingrediente_id;
  END LOOP;

  UPDATE public.albaranes_compra
  SET estado = 'recibido', fecha_recepcion = CURRENT_DATE, updated_at = now()
  WHERE id = p_albaran_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

COMMIT;
