-- Add optional 'pase' column to pedidos for kitchen course grouping.
-- Values: 'primer' | 'segundo' | 'postre' | 'bebida' | NULL (= sin asignar)
ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS pase TEXT
    CHECK (pase IS NULL OR pase IN ('primer', 'segundo', 'postre', 'bebida'));
