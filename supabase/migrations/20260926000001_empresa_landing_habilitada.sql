-- Add landing_habilitada column to empresas table
-- Controls whether the landing page is accessible at all
ALTER TABLE public.empresas
ADD COLUMN landing_habilitada BOOLEAN NOT NULL DEFAULT true;
