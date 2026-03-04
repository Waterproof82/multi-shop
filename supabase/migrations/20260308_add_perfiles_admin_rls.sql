-- RLS policies for perfiles_admin table

-- Enable RLS (should already be enabled, but just in case)
ALTER TABLE public.perfiles_admin ENABLE ROW LEVEL SECURITY;

-- Policy: Users can select their own perfil_admin
CREATE POLICY "Users can select own perfil_admin" ON public.perfiles_admin
  FOR SELECT
  USING (id = auth.uid());

-- Policy: Users can update their own perfil_admin
CREATE POLICY "Users can update own perfil_admin" ON public.perfiles_admin
  FOR UPDATE
  USING (id = auth.uid());

-- Policy: Users can insert their own perfil_admin (for signup flow)
CREATE POLICY "Users can insert own perfil_admin" ON public.perfiles_admin
  FOR INSERT
  WITH CHECK (id = auth.uid());
