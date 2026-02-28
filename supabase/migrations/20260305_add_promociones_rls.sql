-- Add RLS policies for promociones table
ALTER TABLE public.promociones ENABLE ROW LEVEL SECURITY;

-- Policy for empresa users to select their own promociones
CREATE POLICY "Empresa users can select promociones" ON public.promociones
  FOR SELECT
  USING (empresa_id IN (
    SELECT empresa_id FROM public.perfiles_admin WHERE id = auth.uid()
  ));

-- Policy for empresa users to insert their own promociones
CREATE POLICY "Empresa users can insert promociones" ON public.promociones
  FOR INSERT
  WITH CHECK (empresa_id IN (
    SELECT empresa_id FROM public.perfiles_admin WHERE id = auth.uid()
  ));

-- Policy for empresa users to update their own promociones
CREATE POLICY "Empresa users can update promociones" ON public.promociones
  FOR UPDATE
  USING (empresa_id IN (
    SELECT empresa_id FROM public.perfiles_admin WHERE id = auth.uid()
  ));

-- Policy for empresa users to delete their own promociones
CREATE POLICY "Empresa users can delete promociones" ON public.promociones
  FOR DELETE
  USING (empresa_id IN (
    SELECT empresa_id FROM public.perfiles_admin WHERE id = auth.uid()
  ));
