-- Create promociones table
CREATE TABLE public.promociones (
  id uuid NOT NULL DEFAULT extensions.uuid_generate_v4(),
  empresa_id uuid NOT NULL,
  fecha_hora timestamp with time zone NOT NULL,
  texto_promocion text NOT NULL,
  numero_envios integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  CONSTRAINT promociones_pkey PRIMARY KEY (id),
  CONSTRAINT promociones_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES empresas (id) ON DELETE CASCADE
);
