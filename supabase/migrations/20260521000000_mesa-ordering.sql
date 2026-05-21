-- Mesa ordering: create mesas table, extend pedidos and empresas
-- Safe to re-run (idempotent)

-- Create mesas table
CREATE TABLE IF NOT EXISTS mesas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  numero INTEGER NOT NULL,
  nombre TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Add mesa_id to pedidos (nullable FK)
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS mesa_id UUID REFERENCES mesas(id);

-- Add telegram_mesa_chat_id to empresas (nullable)
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS telegram_mesa_chat_id TEXT;

-- Indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_pedidos_mesa_id ON pedidos(mesa_id);
CREATE INDEX IF NOT EXISTS idx_mesas_empresa_id ON mesas(empresa_id);
