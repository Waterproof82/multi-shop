-- Welcome Discount feature
-- Empresa config columns
ALTER TABLE empresas ADD COLUMN descuento_bienvenida_activo boolean NOT NULL DEFAULT false;
ALTER TABLE empresas ADD COLUMN descuento_bienvenida_porcentaje numeric(5,2) NOT NULL DEFAULT 5.00;

-- Discount codes table
CREATE TABLE codigos_descuento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  cliente_email text NOT NULL,
  codigo text NOT NULL,
  porcentaje_descuento numeric(5,2) NOT NULL DEFAULT 5.00,
  fecha_expiracion timestamptz NOT NULL,
  usado boolean NOT NULL DEFAULT false,
  pedido_id uuid REFERENCES pedidos(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(empresa_id, codigo),
  UNIQUE(empresa_id, cliente_email)
);

-- Discount tracking on pedidos
ALTER TABLE pedidos ADD COLUMN codigo_descuento_id uuid REFERENCES codigos_descuento(id) ON DELETE SET NULL;
ALTER TABLE pedidos ADD COLUMN descuento_porcentaje numeric(5,2);
ALTER TABLE pedidos ADD COLUMN total_sin_descuento numeric(10,2);

-- RLS: deny anon access
ALTER TABLE codigos_descuento ENABLE ROW LEVEL SECURITY;
CREATE POLICY "No anon access" ON codigos_descuento FOR ALL TO anon USING (false);
