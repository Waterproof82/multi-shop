# Bloque 1 — Gestión de Proveedores y Compras (SIALTI)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar el módulo completo de compras y proveedores para hostelería multi-tenant, con trazabilidad sanitaria (Reg. CE 178/2002), inmutabilidad de registros (Ley Antifraude 11/2021) y desglose de IVA soportado (RD 1619/2012).

**Compliance resuelto antes de implementar:**
- R1: `UNIQUE(empresa_id, cif)` en `proveedores` — confirmado
- R2: DROP + ADD del CHECK constraint de `tpv_turno_eventos` en la migración
- R3: RPC `recibir_albaran_transaccional` para atomicidad absoluta en recepción
- R4: `monto_cents` siempre POSITIVO (columna real en `tpv_turno_eventos`); el campo `tipo_evento = 'compra_proveedor'` indica semánticamente que es una salida de caja

**Delivery:** 4 PRs apilados hacia `develop` (stacked PRs). Cada PR es autónomo y revisable.

---

## File Map

| PR | Accion | Archivo | Que hace |
|----|--------|---------|----------|
| 1 | Create | `supabase/migrations/20260715000001_modulo_compras_sialti.sql` | Migración completa: tablas, RLS, GRANTs, trigger inmutabilidad, RPC |
| 1 | Create | `src/core/domain/entities/compras-types.ts` | Tipos de dominio y DTOs |
| 1 | Create | `src/core/domain/repositories/IComprasRepository.ts` | Interfaces de repositorio |
| 2 | Create | `src/core/application/use-cases/compras/` (11 archivos) | Todos los casos de uso |
| 2 | Modify | `src/core/infrastructure/database/index.ts` | Añadir `getComprasRepository()` lazy singleton |
| 3 | Create | `src/core/infrastructure/database/supabase-compras.repository.ts` | Implementación del repositorio |
| 3 | Create | `src/app/api/admin/compras/` (19 route files) | Todas las rutas API |
| 4 | Create | `src/app/admin/compras/` (11 page files) | Páginas admin |
| 4 | Create | `src/components/admin/compras/` (4 component files) | Dialogs y formularios |
| 4 | Modify | sidebar admin | Sección "Compras" con 4 ítems |

---

## PR 1 — Infraestructura DB + Domain Types + Interfaces

> **Base branch:** `develop`
> **Estimated lines:** ~350

### Task 1.1: Migración SQL completa

**File:** `supabase/migrations/20260715000001_modulo_compras_sialti.sql`

- [ ] **Step 1: Crear el archivo de migración**

```sql
-- supabase/migrations/20260715000001_modulo_compras_sialti.sql

BEGIN;

-- ============================================================
-- 1. EXTENSIONES A TABLAS EXISTENTES
-- ============================================================

ALTER TABLE public.ingredientes
  ADD COLUMN IF NOT EXISTS es_perecedero BOOLEAN NOT NULL DEFAULT FALSE;

-- Actualizar CHECK constraint de tpv_turno_eventos para añadir 'compra_proveedor'
-- IMPORTANTE: Verificar el nombre real del constraint antes de ejecutar:
-- SELECT conname FROM pg_constraint WHERE conrelid = 'tpv_turno_eventos'::regclass AND contype = 'c';
ALTER TABLE public.tpv_turno_eventos
  DROP CONSTRAINT IF EXISTS tpv_turno_eventos_tipo_evento_check;
ALTER TABLE public.tpv_turno_eventos
  DROP CONSTRAINT IF EXISTS tpv_turno_eventos_tipo_check;
ALTER TABLE public.tpv_turno_eventos
  ADD CONSTRAINT tpv_turno_eventos_tipo_evento_check
  CHECK (tipo_evento IN (
    'apertura', 'cierre', 'venta', 'cobro', 'devolucion',
    'descuento', 'ingreso_caja', 'retiro_caja',
    'apertura_cajon_sin_venta', 'arqueo_parcial', 'descuadre',
    'compra_proveedor'  -- pago de factura desde caja (SIALTI)
  ));
-- NOTA: La política RLS INSERT de tpv_turno_eventos para 'authenticated' NO incluye 'compra_proveedor'.
-- Correcto: estos eventos los inserta el backend via getSupabaseClient() (service_role, bypassa RLS).

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
-- 3. CATALOGO DE COMPRA
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
  porcentaje_iva        INTEGER NOT NULL CHECK (porcentaje_iva IN (0, 4, 10, 21)), -- 0% = exento/intracomunitario
  activo                BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unique_proveedor_ingrediente UNIQUE (proveedor_id, ingrediente_id)
);
CREATE INDEX IF NOT EXISTS idx_catalogo_compra_empresa_id ON public.catalogo_compra (empresa_id);
CREATE INDEX IF NOT EXISTS idx_catalogo_compra_proveedor_id ON public.catalogo_compra (proveedor_id);

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
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.albaranes_compra_items TO service_role, authenticated;

-- ============================================================
-- 6. FACTURAS DE PROVEEDOR
-- ============================================================

CREATE TABLE IF NOT EXISTS public.facturas_proveedor (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id              UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  proveedor_id            UUID NOT NULL REFERENCES public.proveedores(id),
  numero_factura          TEXT NOT NULL CHECK (char_length(numero_factura) <= 100),
  fecha_factura           DATE NOT NULL,
  base_imponible_0_cents  INTEGER NOT NULL DEFAULT 0 CHECK (base_imponible_0_cents >= 0),  -- exento/intracomunitario
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

-- ============================================================
-- 8. RPC: recibir_albaran_transaccional (R3 — atomicidad absoluta)
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
  v_item       RECORD;
  v_factor     NUMERIC;
  v_cantidad   NUMERIC;
  v_mov_id     UUID;
BEGIN
  -- Bloquear y verificar estado del albarán
  IF NOT EXISTS (
    SELECT 1 FROM public.albaranes_compra
    WHERE id = p_albaran_id
      AND empresa_id = p_empresa_id
      AND estado = 'borrador'
    FOR UPDATE
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Albaran no encontrado, no pertenece a la empresa, o ya fue recibido.'
    );
  END IF;

  -- Verificar que hay al menos un item
  IF NOT EXISTS (
    SELECT 1 FROM public.albaranes_compra_items WHERE albaran_compra_id = p_albaran_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'El albaran no tiene items.');
  END IF;

  -- Procesar cada item: convertir unidades e insertar movimiento de stock
  FOR v_item IN (
    SELECT
      aci.id AS item_id,
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
      empresa_id,
      ingrediente_id,
      tipo_movimiento,
      cantidad,
      motivo,
      metadata
    ) VALUES (
      p_empresa_id,
      v_item.ingrediente_id,
      'entrada',
      v_cantidad,
      'Recepcion albaran ' || p_albaran_id::TEXT,
      jsonb_build_object(
        'albaran_id',       p_albaran_id,
        'numero_lote',      v_item.numero_lote,
        'fecha_caducidad',  v_item.fecha_caducidad,
        'empleado_id',      p_empleado_id
      )
    )
    RETURNING id INTO v_mov_id;

    -- Vincular movimiento al item del albarán
    UPDATE public.albaranes_compra_items
    SET movimiento_stock_id = v_mov_id
    WHERE id = v_item.item_id;

    -- Actualizar cantidad_actual en ingredientes
    UPDATE public.ingredientes
    SET cantidad_actual = cantidad_actual + v_cantidad
    WHERE id = v_item.ingrediente_id;
  END LOOP;

  -- Marcar albarán como recibido
  UPDATE public.albaranes_compra
  SET estado = 'recibido',
      fecha_recepcion = CURRENT_DATE,
      updated_at = now()
  WHERE id = p_albaran_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

COMMIT;
```

- [ ] **Step 2: Verificar sintaxis SQL**

Antes de aplicar, comprobar que la columna `tipo_movimiento` existe en `movimientos_stock` y que el constraint de `tpv_turno_eventos` se llama como se espera:

```bash
# Ver constraints reales de tpv_turno_eventos
pnpm supabase db diff
```

Si el nombre del constraint es diferente al asumido, ajustar los DROP CONSTRAINT en el script antes de continuar.

- [ ] **Step 3: Aplicar la migración en local**

```bash
pnpm supabase db push
```

Esperado: migración aplicada sin errores.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260715000001_modulo_compras_sialti.sql
git commit -m "feat(compras): add SIALTI purchasing module migration — proveedores, catalogo, pedidos, albaranes, facturas + RPC atomica + trigger inmutabilidad"
```

---

### Task 1.2: Tipos de dominio

**File:** `src/core/domain/entities/compras-types.ts`

- [ ] **Step 1: Crear los tipos**

```typescript
// src/core/domain/entities/compras-types.ts

export type PedidoCompraEstado = 'borrador' | 'enviado' | 'recibido' | 'cancelado';
export type AlbaranEstado = 'borrador' | 'recibido';
export type EstadoPago = 'pendiente' | 'pagado_caja' | 'pagado_banco';
export type PorcentajeIva = 0 | 4 | 10 | 21; // 0 = exento/intracomunitario/no sujeto

// ---- Entidades ----

export interface Proveedor {
  id: string;
  empresaId: string;
  nombre: string;
  cif: string | null;
  email: string | null;
  telefono: string | null;
  condicionesPago: string | null;
  direccionFiscal: string | null;
  observaciones: string | null;
  activo: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CatalogoCompraItem {
  id: string;
  empresaId: string;
  proveedorId: string;
  ingredienteId: string;
  referenciaProveedor: string | null;
  descripcion: string | null;
  precioCompraCents: number;
  unidadCompra: string;
  factorConversion: number;
  porcentajeIva: PorcentajeIva;
  activo: boolean;
  createdAt: string;
  updatedAt: string;
  // Joined
  ingredienteNombre?: string;
  esPerecedero?: boolean;
}

export interface PedidoCompra {
  id: string;
  empresaId: string;
  proveedorId: string;
  numeroPedido: string;
  estado: PedidoCompraEstado;
  notas: string | null;
  fechaPedido: string;
  fechaEntregaEstimada: string | null;
  createdAt: string;
  updatedAt: string;
  // Joined
  proveedorNombre?: string;
  items?: PedidoCompraItem[];
}

export interface PedidoCompraItem {
  id: string;
  pedidoCompraId: string;
  catalogoCompraId: string;
  cantidad: number;
  precioCompraCents: number;
  porcentajeIva: PorcentajeIva;
  createdAt: string;
  // Joined
  ingredienteNombre?: string;
  unidadCompra?: string;
}

export interface AlbaranCompra {
  id: string;
  empresaId: string;
  proveedorId: string;
  pedidoCompraId: string | null;
  numeroAlbaran: string;
  estado: AlbaranEstado;
  fechaRecepcion: string | null;
  notas: string | null;
  createdAt: string;
  updatedAt: string;
  // Joined
  proveedorNombre?: string;
  items?: AlbaranCompraItem[];
}

export interface AlbaranCompraItem {
  id: string;
  albaranCompraId: string;
  catalogoCompraId: string;
  cantidadRecibida: number;
  precioCompraCents: number;
  porcentajeIva: PorcentajeIva;
  numeroLote: string | null;
  fechaCaducidad: string | null;
  movimientoStockId: string | null;
  createdAt: string;
  // Joined
  ingredienteNombre?: string;
  esPerecedero?: boolean;
  unidadCompra?: string;
}

export interface FacturaProveedor {
  id: string;
  empresaId: string;
  proveedorId: string;
  numeroFactura: string;
  fechaFactura: string;
  baseImponible0Cents: number;   // exento/intracomunitario/no sujeto
  baseImponible4Cents: number;
  baseImponible10Cents: number;
  baseImponible21Cents: number;
  ivaSoportadoCents: number;
  totalFacturaCents: number;
  estadoPago: EstadoPago;
  notas: string | null;
  turnoId: string | null;
  createdAt: string;
  updatedAt: string;
  // Joined
  proveedorNombre?: string;
  albaranes?: AlbaranCompra[];
}

// ---- DTOs ----

export interface CreateProveedorDTO {
  nombre: string;
  cif?: string;
  email?: string;
  telefono?: string;
  condicionesPago?: string;
  direccionFiscal?: string;
  observaciones?: string;
}

export type UpdateProveedorDTO = Partial<CreateProveedorDTO & { activo: boolean }>;

export interface CreateCatalogoItemDTO {
  proveedorId: string;
  ingredienteId: string;
  referenciaProveedor?: string;
  descripcion?: string;
  precioCompraCents: number;
  unidadCompra: string;
  factorConversion: number;
  porcentajeIva: PorcentajeIva;
}

export type UpdateCatalogoItemDTO = Partial<Omit<CreateCatalogoItemDTO, 'proveedorId' | 'ingredienteId'> & { activo: boolean }>;

export interface CreatePedidoCompraDTO {
  proveedorId: string;
  notas?: string;
  fechaEntregaEstimada?: string;
}

export interface AddItemToPedidoDTO {
  catalogoCompraId: string;
  cantidad: number;
}

export interface CreateAlbaranDTO {
  proveedorId: string;
  pedidoCompraId?: string;
  numeroAlbaran: string;
  notas?: string;
}

export interface AddItemToAlbaranDTO {
  catalogoCompraId: string;
  cantidadRecibida: number;
  precioCompraCents: number;
  porcentajeIva: PorcentajeIva;
  numeroLote?: string;
  fechaCaducidad?: string;
}

export interface CreateFacturaProveedorDTO {
  proveedorId: string;
  numeroFactura: string;
  fechaFactura: string;
  baseImponible0Cents: number;
  baseImponible4Cents: number;
  baseImponible10Cents: number;
  baseImponible21Cents: number;
  ivaSoportadoCents: number;
  totalFacturaCents: number;
  notas?: string;
  albaranIds: string[];
}

export interface RegistrarPagoDTO {
  metodoPago: 'pagado_caja' | 'pagado_banco';
  turnoId?: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/core/domain/entities/compras-types.ts
git commit -m "feat(compras): add domain types for proveedores, catalogo, pedidos, albaranes, facturas"
```

---

### Task 1.3: Interfaces de repositorio

**File:** `src/core/domain/repositories/IComprasRepository.ts`

- [ ] **Step 1: Crear la interfaz unificada**

```typescript
// src/core/domain/repositories/IComprasRepository.ts
import type { Result } from '@/core/domain/entities/types';
import type {
  Proveedor, CreateProveedorDTO, UpdateProveedorDTO,
  CatalogoCompraItem, CreateCatalogoItemDTO, UpdateCatalogoItemDTO,
  PedidoCompra, PedidoCompraItem, CreatePedidoCompraDTO, AddItemToPedidoDTO,
  AlbaranCompra, AlbaranCompraItem, CreateAlbaranDTO, AddItemToAlbaranDTO,
  FacturaProveedor, CreateFacturaProveedorDTO, RegistrarPagoDTO,
} from '@/core/domain/entities/compras-types';

export interface PedidoCompraFilters {
  estado?: string;
  proveedorId?: string;
}

export interface AlbaranFilters {
  estado?: string;
  proveedorId?: string;
  fechaDesde?: string;
  fechaHasta?: string;
}

export interface FacturaFilters {
  estadoPago?: string;
  proveedorId?: string;
  fechaDesde?: string;
  fechaHasta?: string;
}

export interface IComprasRepository {
  // --- Proveedores ---
  findProveedores(empresaId: string): Promise<Result<Proveedor[]>>;
  findProveedorById(empresaId: string, id: string): Promise<Result<Proveedor>>;
  createProveedor(empresaId: string, data: CreateProveedorDTO): Promise<Result<Proveedor>>;
  updateProveedor(empresaId: string, id: string, data: UpdateProveedorDTO): Promise<Result<Proveedor>>;
  softDeleteProveedor(empresaId: string, id: string): Promise<Result<void>>;
  hasActiveTransactions(empresaId: string, proveedorId: string): Promise<Result<boolean>>;

  // --- Catalogo ---
  findCatalogoByProveedor(empresaId: string, proveedorId: string): Promise<Result<CatalogoCompraItem[]>>;
  findCatalogoItemById(empresaId: string, id: string): Promise<Result<CatalogoCompraItem>>;
  createCatalogoItem(empresaId: string, data: CreateCatalogoItemDTO): Promise<Result<CatalogoCompraItem>>;
  updateCatalogoItem(empresaId: string, id: string, data: UpdateCatalogoItemDTO): Promise<Result<CatalogoCompraItem>>;
  softDeleteCatalogoItem(empresaId: string, id: string): Promise<Result<void>>;

  // --- Pedidos ---
  findPedidos(empresaId: string, filters?: PedidoCompraFilters): Promise<Result<PedidoCompra[]>>;
  findPedidoById(empresaId: string, id: string): Promise<Result<PedidoCompra>>;
  createPedido(empresaId: string, data: CreatePedidoCompraDTO, numeroPedido: string): Promise<Result<PedidoCompra>>;
  updatePedidoEstado(empresaId: string, id: string, estado: string): Promise<Result<PedidoCompra>>;
  addItemToPedido(empresaId: string, pedidoId: string, item: AddItemToPedidoDTO & { precioCompraCents: number; porcentajeIva: number }): Promise<Result<PedidoCompraItem>>;
  updatePedidoItem(empresaId: string, pedidoId: string, itemId: string, cantidad: number): Promise<Result<PedidoCompraItem>>;
  removePedidoItem(empresaId: string, pedidoId: string, itemId: string): Promise<Result<void>>;

  // --- Albaranes ---
  findAlbaranes(empresaId: string, filters?: AlbaranFilters): Promise<Result<AlbaranCompra[]>>;
  findAlbaranById(empresaId: string, id: string): Promise<Result<AlbaranCompra>>;
  createAlbaran(empresaId: string, data: CreateAlbaranDTO): Promise<Result<AlbaranCompra>>;
  addItemToAlbaran(empresaId: string, albaranId: string, item: AddItemToAlbaranDTO): Promise<Result<AlbaranCompraItem>>;
  updateAlbaranItem(empresaId: string, albaranId: string, itemId: string, data: Partial<AddItemToAlbaranDTO>): Promise<Result<AlbaranCompraItem>>;
  removeAlbaranItem(empresaId: string, albaranId: string, itemId: string): Promise<Result<void>>;
  marcarAlbaranRecibido(empresaId: string, albaranId: string, empleadoId: string): Promise<Result<AlbaranCompra>>;

  // --- Facturas ---
  findFacturas(empresaId: string, filters?: FacturaFilters): Promise<Result<FacturaProveedor[]>>;
  findFacturaById(empresaId: string, id: string): Promise<Result<FacturaProveedor>>;
  createFactura(empresaId: string, data: CreateFacturaProveedorDTO): Promise<Result<FacturaProveedor>>;
  registrarPagoFactura(empresaId: string, id: string, data: RegistrarPagoDTO): Promise<Result<FacturaProveedor>>;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/core/domain/repositories/IComprasRepository.ts
git commit -m "feat(compras): add IComprasRepository interface"
```

---

### Task 1.4: PR 1 — Push y review

- [ ] Push branch y abrir PR hacia `develop`
- [ ] Verificar que `pnpm lint` y `pnpm typecheck` pasan sin errores

```bash
pnpm lint && pnpm typecheck
```

---

## PR 2 — Use Cases + Service Locator

> **Base branch:** PR 1 (o `develop` una vez mergeado)
> **Estimated lines:** ~550

### Task 2.1: Estructura de carpetas

- [ ] Crear `src/core/application/use-cases/compras/` si no existe

---

### Task 2.2: Use Cases — Proveedores

**Files:** `src/core/application/use-cases/compras/proveedor/`

- [ ] **2.2.1 `createProveedor.use-case.ts`**

```typescript
import { z } from 'zod';
import type { IComprasRepository } from '@/core/domain/repositories/IComprasRepository';
import type { Result } from '@/core/domain/entities/types';
import type { Proveedor } from '@/core/domain/entities/compras-types';

const schema = z.object({
  nombre: z.string().min(1).max(200),
  cif: z.string().max(20).optional(),
  email: z.string().email().max(200).optional().or(z.literal('')),
  telefono: z.string().max(30).optional(),
  condicionesPago: z.string().max(500).optional(),
  direccionFiscal: z.string().max(500).optional(),
  observaciones: z.string().max(1000).optional(),
});

export async function createProveedorUseCase(
  repo: IComprasRepository,
  empresaId: string,
  input: unknown,
): Promise<Result<Proveedor>> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message, module: 'use-case' } };
  }
  return repo.createProveedor(empresaId, parsed.data);
}
```

- [ ] **2.2.2 `updateProveedor.use-case.ts`** — carga por id+empresaId, partial update, llama `repo.updateProveedor`

- [ ] **2.2.3 `deleteProveedor.use-case.ts`** — verifica transacciones activas con `hasActiveTransactions`, si las hay retorna CONFLICT, si no llama `softDeleteProveedor`

---

### Task 2.3: Use Cases — Catalogo

- [ ] **2.3.1 `createCatalogoItem.use-case.ts`** — valida `proveedorId` pertenece a `empresaId`, `ingredienteId` pertenece a `empresaId`, `factorConversion > 0`, `porcentajeIva IN (4,10,21)`

- [ ] **2.3.2 `updateCatalogoItem.use-case.ts`** — carga item, valida ownership, permite actualizar precio/factor libremente

---

### Task 2.4: Use Cases — Pedidos

- [ ] **2.4.1 `createPedidoCompra.use-case.ts`** — genera `numero_pedido` formato `PC-{YYYYMMDD}-{random4}`, estado inicial `borrador`

- [ ] **2.4.2 `addItemToPedido.use-case.ts`** — carga pedido, si `estado !== 'borrador'` → FORBIDDEN; copia `precioCompraCents` y `porcentajeIva` del catálogo al crear

- [ ] **2.4.3 `updatePedidoItem.use-case.ts`** — guarda estado `borrador`, si no → FORBIDDEN

- [ ] **2.4.4 `sendPedido.use-case.ts`** — verifica `estado === 'borrador'`, verifica items > 0, transiciona a `enviado`

- [ ] **2.4.5 `cancelPedido.use-case.ts`** — verifica `estado !== 'recibido'`, transiciona a `cancelado`

---

### Task 2.5: Use Cases — Albaranes

- [ ] **2.5.1 `createAlbaran.use-case.ts`** — `pedidoCompraId` opcional, estado inicial `borrador`

- [ ] **2.5.2 `addItemToAlbaran.use-case.ts`** — guarda estado `borrador`, si `recibido` → FORBIDDEN; si `ingrediente.esPerecedero`:
  - `numeroLote` debe existir y no estar vacío
  - `fechaCaducidad` debe existir y ser >= hoy
  - Si falla → `VALIDATION_ERROR` con mensaje CE 178/2002

- [ ] **2.5.3 `updateAlbaranItem.use-case.ts`** — guarda estado `borrador`, si `recibido` → FORBIDDEN

- [ ] **2.5.4 `removeAlbaranItem.use-case.ts`** — guarda estado `borrador`, si `recibido` → FORBIDDEN

- [ ] **2.5.5 `marcarAlbaranRecibido.use-case.ts`** — re-valida perecibilidad de todos los items, verifica que hay al menos 1 item, delega atomicidad a `repo.marcarAlbaranRecibido` (que llama el RPC)

---

### Task 2.6: Use Cases — Facturas

- [ ] **2.6.1 `createFacturaProveedor.use-case.ts`**
  - Valida `proveedorId` en `empresaId`
  - Valida cada `albaranId` en `empresaId` con `estado = 'recibido'`
  - Valida matemática IVA: `iva = base4*0.04 + base10*0.10 + base21*0.21` (±2 cents tolerancia)
  - Valida total: `total = base4 + base10 + base21 + iva`
  - Si pasa → `repo.createFactura`

- [ ] **2.6.2 `registrarPagoFactura.use-case.ts`**
  - Si `metodoPago === 'pagado_caja'`: verifica `turnoId` presente y turno activo para `empresaId`
  - Llama `repo.registrarPagoFactura`

---

### Task 2.7: Service Locator

**File:** `src/core/infrastructure/database/index.ts`

- [ ] Añadir al final del archivo el lazy singleton para el repositorio de compras:

```typescript
import type { IComprasRepository } from '@/core/domain/repositories/IComprasRepository';
import { SupabaseComprasRepository } from './supabase-compras.repository';

let _comprasRepo: IComprasRepository | null = null;
export function getComprasRepository(): IComprasRepository {
  return (_comprasRepo ??= new SupabaseComprasRepository());
}
```

> El archivo de implementación `supabase-compras.repository.ts` se crea en PR 3. Aquí solo declaramos el getter — TypeScript compilará en PR 3 cuando el archivo exista.

- [ ] **Commit de PR 2**

```bash
git add src/core/application/use-cases/compras/
git add src/core/infrastructure/database/index.ts
git commit -m "feat(compras): add all purchasing use cases + service locator getComprasRepository"
```

- [ ] Verificar `pnpm lint && pnpm typecheck` sin errores

---

## PR 3 — Repository Implementation + API Routes

> **Base branch:** PR 2 (o `develop` una vez mergeado PR 2)
> **Estimated lines:** ~700

### Task 3.1: Implementación del repositorio

**File:** `src/core/infrastructure/database/supabase-compras.repository.ts`

- [ ] Implementar `IComprasRepository` completo con `getSupabaseClient()`. Seguir el patrón existente en otros repositorios del proyecto (camelCase en domain, snake_case en DB). Métodos clave:

  - `marcarAlbaranRecibido` → llama RPC `recibir_albaran_transaccional(albaranId, empresaId, empleadoId)`
  - `hasActiveTransactions` → query `pedidos_compra` + `albaranes_compra` con `estado NOT IN ('cancelado', 'recibido')`
  - `registrarPagoFactura` con `metodoPago = 'pagado_caja'` → INSERT en `tpv_turno_eventos` con `tipo_evento = 'compra_proveedor'`, `monto_cents` POSITIVO (columna real, R4)

- [ ] Commit:

```bash
git add src/core/infrastructure/database/supabase-compras.repository.ts
git commit -m "feat(compras): implement SupabaseComprasRepository with RPC support"
```

---

### Task 3.2: API Routes — Proveedores

**Files:** `src/app/api/admin/compras/proveedores/`

- [ ] **3.2.1 `route.ts`** — `GET` lista, `POST` crear
- [ ] **3.2.2 `[id]/route.ts`** — `GET` detalle, `PATCH` actualizar, `DELETE` soft-delete
- [ ] **3.2.3 `[id]/catalogo/route.ts`** — `GET` lista catálogo, `POST` añadir item
- [ ] **3.2.4 `[id]/catalogo/[itemId]/route.ts`** — `PATCH` actualizar, `DELETE` soft-delete

Todas las routes deben usar:
```typescript
const authResult = await requireRole(request, ['admin', 'superadmin']);
if (!authResult.success) return handleResult(authResult);
const empresaId = authResult.data.empresaId;
```

- [ ] Commit:

```bash
git add src/app/api/admin/compras/proveedores/
git commit -m "feat(compras): add supplier and catalog API routes"
```

---

### Task 3.3: API Routes — Pedidos

**Files:** `src/app/api/admin/compras/pedidos/`

- [ ] **3.3.1 `route.ts`** — `GET` con filtros `?estado=&proveedor_id=`, `POST` crear
- [ ] **3.3.2 `[id]/route.ts`** — `GET` con items
- [ ] **3.3.3 `[id]/items/route.ts`** — `POST` añadir item
- [ ] **3.3.4 `[id]/items/[itemId]/route.ts`** — `PATCH` cantidad, `DELETE`
- [ ] **3.3.5 `[id]/enviar/route.ts`** — `POST` → `sendPedidoUseCase`
- [ ] **3.3.6 `[id]/cancelar/route.ts`** — `POST` → `cancelPedidoUseCase`

- [ ] Commit:

```bash
git add src/app/api/admin/compras/pedidos/
git commit -m "feat(compras): add purchase order API routes"
```

---

### Task 3.4: API Routes — Albaranes

**Files:** `src/app/api/admin/compras/albaranes/`

- [ ] **3.4.1 `route.ts`** — `GET` con filtros, `POST` crear
- [ ] **3.4.2 `[id]/route.ts`** — `GET` con items
- [ ] **3.4.3 `[id]/items/route.ts`** — `POST` añadir item
- [ ] **3.4.4 `[id]/items/[itemId]/route.ts`** — `PATCH`, `DELETE`
- [ ] **3.4.5 `[id]/recibir/route.ts`** — `POST` → `marcarAlbaranRecibidoUseCase`

- [ ] Commit:

```bash
git add src/app/api/admin/compras/albaranes/
git commit -m "feat(compras): add delivery note API routes with CE 178/2002 traceability"
```

---

### Task 3.5: API Routes — Facturas

**Files:** `src/app/api/admin/compras/facturas/`

- [ ] **3.5.1 `route.ts`** — `GET` con filtros `?estado_pago=&proveedor_id=`, `POST` crear
- [ ] **3.5.2 `[id]/route.ts`** — `GET` con albaranes vinculados
- [ ] **3.5.3 `[id]/pagar/route.ts`** — `POST` body `{ metodoPago: 'caja'|'banco', turnoId? }`

- [ ] Commit:

```bash
git add src/app/api/admin/compras/facturas/
git commit -m "feat(compras): add supplier invoice API routes with RD 1619/2012 VAT breakdown"
```

- [ ] `pnpm lint && pnpm typecheck` sin errores en PR 3

---

## PR 4 — Admin UI + Sidebar

> **Base branch:** PR 3 (o `develop` una vez mergeado PR 3)
> **Estimated lines:** ~800

### Task 4.1: Layout de Compras

**File:** `src/app/admin/compras/layout.tsx`

- [ ] Crear layout con navegación entre las 4 secciones. Usar el patrón de layouts existentes en `/admin`.

---

### Task 4.2: Sidebar Integration

- [ ] Localizar el componente de sidebar del admin (buscar con `grep -r "proveedores" src/components/admin` para encontrar el patrón)
- [ ] Añadir sección "Compras" con 4 ítems: Proveedores, Pedidos, Albaranes, Facturas
- [ ] `requiresRestaurant: false` (aplica a todos los tipos de tenant)

```bash
git add src/components/admin/sidebar* src/app/admin/compras/layout.tsx
git commit -m "feat(compras): add Compras section to admin sidebar"
```

---

### Task 4.3: Página Proveedores

**File:** `src/app/admin/compras/proveedores/page.tsx`

- [ ] Tabla con columnas: nombre, CIF, email, teléfono, acciones (editar, eliminar)
- [ ] Botón "Nuevo proveedor" → `ProveedorDialog`
- [ ] Expandible por fila para ver catálogo del proveedor
- [ ] Trigger delete con confirmación

```bash
git add src/app/admin/compras/proveedores/ src/components/admin/compras/ProveedorDialog.tsx
git commit -m "feat(compras): add supplier management page with catalog expansion"
```

---

### Task 4.4: Páginas Pedidos

**Files:** `src/app/admin/compras/pedidos/`

- [ ] **`page.tsx`** — lista filtrable por estado y proveedor, badge de estado, botón "Nuevo pedido"
- [ ] **`nuevo/page.tsx`** — stepper: (1) seleccionar proveedor → (2) añadir items del catálogo → (3) confirmar
- [ ] **`[id]/page.tsx`** — detalle, tabla de items (read-only si estado ≠ borrador), botones de acción según estado

```bash
git add src/app/admin/compras/pedidos/
git commit -m "feat(compras): add purchase order pages (list, new, detail)"
```

---

### Task 4.5: Páginas Albaranes

**Files:** `src/app/admin/compras/albaranes/`

- [ ] **`page.tsx`** — lista filtrable (estado, proveedor, rango de fechas)
- [ ] **`nuevo/page.tsx`** — crear albaran: seleccionar proveedor → añadir items con `AlbaranItemForm`
- [ ] **`[id]/page.tsx`** — detalle; items con campos lote/caducidad visibles SOLO si `esPerecedero`; botón "Marcar recibido" con dialog de confirmación; banner inmutabilidad cuando `estado = 'recibido'`

```bash
git add src/app/admin/compras/albaranes/ src/components/admin/compras/AlbaranItemForm.tsx
git commit -m "feat(compras): add delivery note pages with CE 178/2002 traceability UI"
```

---

### Task 4.6: Páginas Facturas

**Files:** `src/app/admin/compras/facturas/`

- [ ] **`page.tsx`** — lista filtrable por estado_pago, proveedor, fecha
- [ ] **`nueva/page.tsx`** — formulario: selector proveedor → multiselect albaranes recibidos → campos IVA con auto-cálculo → revisar y crear
- [ ] **`[id]/page.tsx`** — detalle + botón "Registrar pago" → `FacturaForm` con selector caja/banco

```bash
git add src/app/admin/compras/facturas/ src/components/admin/compras/FacturaForm.tsx
git commit -m "feat(compras): add supplier invoice pages with RD 1619/2012 VAT breakdown"
```

---

### Task 4.7: Translations

- [ ] Añadir todas las claves `t()` para el módulo de compras en el archivo de traducciones (es/en)
- [ ] Cubrir: labels, placeholders, mensajes de error, confirmaciones, estados

```bash
git add src/lib/translations*
git commit -m "feat(compras): add i18n translations for purchasing module (es/en)"
```

---

## Criterios de Completitud

- [ ] Migración aplica sin errores en `pnpm supabase db push`
- [ ] `pnpm lint && pnpm typecheck` sin errores nuevos
- [ ] Todas las rutas API retornan 401 sin token de admin (auth guard verificado)
- [ ] Escenario S-03/S-04: ítem perecedero sin lote → 422 con `VALIDATION_ERROR`
- [ ] Escenario S-06: marcar recibido → stock actualizado atómicamente en `movimientos_stock`
- [ ] Escenario S-07: editar albarán recibido → 403 FORBIDDEN (Use Case) + excepción DB (trigger)
- [ ] Escenario S-08: numero_factura duplicado → 409 CONFLICT
- [ ] Escenario S-10: pago en caja sin turno activo → 422 VALIDATION_ERROR
- [ ] Sidebar de compras visible y funcional en todos los tenants
- [ ] Todo el texto de UI usa `t()` — sin strings hardcodeadas en español/inglés
