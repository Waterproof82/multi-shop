-- Add CHECK constraint to perfiles_admin.rol to enforce valid role values.
-- Existing values ('admin', 'superadmin') are already valid.
ALTER TABLE public.perfiles_admin
  ADD CONSTRAINT perfiles_admin_rol_check
  CHECK (rol IN ('superadmin', 'admin', 'encargado', 'cajero'));
