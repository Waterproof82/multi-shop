-- Enable RLS on mesas table.
-- Was missing from 20260521000000_mesa-ordering.sql — any authenticated
-- admin could read/write mesas from other empresas without it.
-- Follows the same pattern as mesa_sesiones (20260521130331).

ALTER TABLE public.mesas ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'mesas' AND policyname = 'No direct anon access to mesas') THEN
    CREATE POLICY "No direct anon access to mesas"
      ON public.mesas FOR ALL TO anon
      USING (false) WITH CHECK (false);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'mesas' AND policyname = 'Admin ve mesas') THEN
    CREATE POLICY "Admin ve mesas"
      ON public.mesas FOR SELECT
      USING (empresa_id = get_mi_empresa_id());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'mesas' AND policyname = 'Admin crea mesas') THEN
    CREATE POLICY "Admin crea mesas"
      ON public.mesas FOR INSERT
      WITH CHECK (empresa_id = get_mi_empresa_id());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'mesas' AND policyname = 'Admin edita mesas') THEN
    CREATE POLICY "Admin edita mesas"
      ON public.mesas FOR UPDATE
      USING (empresa_id = get_mi_empresa_id());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'mesas' AND policyname = 'Admin elimina mesas') THEN
    CREATE POLICY "Admin elimina mesas"
      ON public.mesas FOR DELETE
      USING (empresa_id = get_mi_empresa_id());
  END IF;
END $$;
