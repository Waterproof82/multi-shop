-- Add mesas_habilitadas toggle to empresas
-- Controls whether a restaurant empresa has mesa ordering enabled.
-- Default TRUE for backwards compatibility (existing restaurants keep mesas active).

ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS mesas_habilitadas boolean NOT NULL DEFAULT true;
