-- Migration: Create log_errors table for centralized error tracking
-- Date: 2026-03-11

CREATE TABLE IF NOT EXISTS log_errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID REFERENCES empresas(id) ON DELETE SET NULL,
  codigo VARCHAR(50) NOT NULL,
  mensaje TEXT NOT NULL,
  modulo VARCHAR(20) NOT NULL,
  metodo VARCHAR(100),
  stack_trace TEXT,
  request_path VARCHAR(500),
  request_method VARCHAR(10),
  user_id UUID,
  metadata JSONB DEFAULT '{}',
  severity VARCHAR(20) DEFAULT 'error',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_log_errors_empresa ON log_errors(empresa_id);
CREATE INDEX IF NOT EXISTS idx_log_errors_fecha ON log_errors(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_log_errors_codigo ON log_errors(codigo);
CREATE INDEX IF NOT EXISTS idx_log_errors_modulo ON log_errors(modulo);
CREATE INDEX IF NOT EXISTS idx_log_errors_severity ON log_errors(severity);

-- Enable RLS
ALTER TABLE log_errors ENABLE ROW LEVEL SECURITY;

-- Allow service role to do anything (bypass RLS for internal logging)
CREATE POLICY "Allow service role full access to log_errors" ON log_errors
  FOR ALL USING (true) WITH CHECK (true);

-- Allow anon read (if needed for debugging)
CREATE POLICY "Allow anon read log_errors" ON log_errors
  FOR SELECT USING (true);
