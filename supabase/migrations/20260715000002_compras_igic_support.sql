BEGIN;

-- Change porcentaje_iva column type to NUMERIC(4,1) to support 9.5% IGIC
-- and extend CHECK to include all valid IVA + IGIC rates

ALTER TABLE public.catalogo_compra
  ALTER COLUMN porcentaje_iva TYPE NUMERIC(4,1),
  DROP CONSTRAINT IF EXISTS catalogo_compra_porcentaje_iva_check,
  ADD CONSTRAINT catalogo_compra_porcentaje_iva_check
    CHECK (porcentaje_iva IN (0, 3, 4, 7, 9.5, 10, 15, 21));

ALTER TABLE public.pedidos_compra_items
  ALTER COLUMN porcentaje_iva TYPE NUMERIC(4,1),
  DROP CONSTRAINT IF EXISTS pedidos_compra_items_porcentaje_iva_check,
  ADD CONSTRAINT pedidos_compra_items_porcentaje_iva_check
    CHECK (porcentaje_iva IN (0, 3, 4, 7, 9.5, 10, 15, 21));

ALTER TABLE public.albaranes_compra_items
  ALTER COLUMN porcentaje_iva TYPE NUMERIC(4,1),
  DROP CONSTRAINT IF EXISTS albaranes_compra_items_porcentaje_iva_check,
  ADD CONSTRAINT albaranes_compra_items_porcentaje_iva_check
    CHECK (porcentaje_iva IN (0, 3, 4, 7, 9.5, 10, 15, 21));

-- Add IGIC base columns to facturas_proveedor
ALTER TABLE public.facturas_proveedor
  ADD COLUMN IF NOT EXISTS base_imponible_3_cents  INTEGER NOT NULL DEFAULT 0 CHECK (base_imponible_3_cents >= 0),
  ADD COLUMN IF NOT EXISTS base_imponible_7_cents  INTEGER NOT NULL DEFAULT 0 CHECK (base_imponible_7_cents >= 0),
  ADD COLUMN IF NOT EXISTS base_imponible_95_cents INTEGER NOT NULL DEFAULT 0 CHECK (base_imponible_95_cents >= 0),
  ADD COLUMN IF NOT EXISTS base_imponible_15_cents INTEGER NOT NULL DEFAULT 0 CHECK (base_imponible_15_cents >= 0);
-- NOTE: 95 = 9.5% (column name cannot contain a dot)

COMMIT;
