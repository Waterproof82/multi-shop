-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.
-- All tables have RLS (Row Level Security) enabled.
--
-- === SECURITY MODEL ===
-- service_role (SUPABASE_SERVICE_ROLE_KEY) bypasses RLS — used by admin repositories.
-- anon key (NEXT_PUBLIC_SUPABASE_ANON_KEY) respects RLS — used by empresaPublicRepository.
-- RLS acts as second line of defense (API layer + proxy are the primary gate).
--
-- Helper function used by policies:
--   get_mi_empresa_id() → returns empresa_id from perfiles_admin where id = auth.uid()
--   (SECURITY DEFINER, search_path = 'public')
--
-- === SUPERADMIN SUPPORT ===
-- perfiles_admin.empresa_id must be nullable (NULL for superadmins)
-- Run this migration to enable superadmin:
--
-- ALTER TABLE public.perfiles_admin ALTER COLUMN empresa_id DROP NOT NULL;
-- ALTER TABLE public.perfiles_admin DROP CONSTRAINT IF EXISTS perfiles_admin_empresa_id_fkey;
--
-- Roles: 'admin' (per-tenants) or 'superadmin' (global access)

CREATE TABLE public.empresas (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  nombre text NOT NULL,
  dominio text NOT NULL UNIQUE,
  slug text,
  logo_url text,
  mostrar_carrito boolean DEFAULT true,
  moneda text DEFAULT 'EUR'::text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  subdomain_pedidos text UNIQUE,
  email_notification text,
  url_image text,
  descripcion_es text,
  descripcion_en text,
  descripcion_fr text,
  descripcion_it text,
  descripcion_de text,
  titulo text,
  subtitulo text,
  subtitulo2_es text,
  subtitulo2_en text,
  subtitulo2_fr text,
  subtitulo2_it text,
  subtitulo2_de text,
  footer1_es text,
  footer1_en text,
  footer1_fr text,
  footer1_it text,
  footer1_de text,
  footer2_es text,
  footer2_en text,
  footer2_fr text,
  footer2_it text,
  footer2_de text,
  color_primary character varying DEFAULT '#008C45'::character varying,
  color_primary_foreground character varying DEFAULT '#FFFFFF'::character varying,
  color_secondary character varying DEFAULT '#F7E7CE'::character varying,
  color_secondary_foreground character varying DEFAULT '#3C2415'::character varying,
  color_accent character varying DEFAULT '#CF0921'::character varying,
  color_accent_foreground character varying DEFAULT '#FFFFFF'::character varying,
  color_background character varying DEFAULT '#FDFBF7'::character varying,
  color_foreground character varying DEFAULT '#1A1612'::character varying,
  telefono_whatsapp text,
  direccion text,
  fb text,
  instagram text,
  url_mapa text,
  CONSTRAINT empresas_pkey PRIMARY KEY (id)
);
-- RLS: SELECT public (true) | UPDATE admin (id = get_mi_empresa_id())

CREATE TABLE public.perfiles_admin (
  id uuid NOT NULL,
  empresa_id uuid NULL,  -- NULL for superadmins
  nombre_completo text,
  rol text DEFAULT 'admin'::text CHECK (rol IN ('admin', 'superadmin')),
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  CONSTRAINT perfiles_admin_pkey PRIMARY KEY (id),
  CONSTRAINT perfiles_admin_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
  -- empresa_id FK removed to allow NULL for superadmins
);
-- RLS: SELECT/INSERT/UPDATE own (id = auth.uid()) | No DELETE

CREATE TABLE public.categorias (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  empresa_id uuid NOT NULL,
  nombre_es text NOT NULL,
  nombre_en text,
  nombre_fr text,
  nombre_it text,
  nombre_de text,
  orden integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  categoria_complemento_de uuid,
  complemento_obligatorio boolean DEFAULT false,
  categoria_padre_id uuid,
  descripcion_es text,
  descripcion_en text,
  descripcion_fr text,
  descripcion_it text,
  descripcion_de text,
  CONSTRAINT categorias_pkey PRIMARY KEY (id),
  CONSTRAINT categorias_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id),
  CONSTRAINT categorias_categoria_complemento_de_fkey FOREIGN KEY (categoria_complemento_de) REFERENCES public.categorias(id),
  CONSTRAINT categorias_categoria_padre_id_fkey FOREIGN KEY (categoria_padre_id) REFERENCES public.categorias(id)
);
-- RLS: SELECT public (true) | ALL admin (empresa_id = get_mi_empresa_id())

CREATE TABLE public.productos (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  empresa_id uuid NOT NULL,
  categoria_id uuid,
  titulo_es text NOT NULL,
  titulo_en text,
  titulo_fr text,
  titulo_it text,
  titulo_de text,
  descripcion_es text,
  descripcion_en text,
  descripcion_fr text,
  descripcion_it text,
  descripcion_de text,
  precio numeric NOT NULL DEFAULT 0.00,
  foto_url text,
  es_especial boolean DEFAULT false,
  activo boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  CONSTRAINT productos_pkey PRIMARY KEY (id),
  CONSTRAINT productos_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id),
  CONSTRAINT productos_categoria_id_fkey FOREIGN KEY (categoria_id) REFERENCES public.categorias(id)
);
-- RLS: SELECT public (true) | ALL admin (empresa_id = get_mi_empresa_id())

CREATE TABLE public.clientes (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  empresa_id uuid NOT NULL,
  email text,
  nombre text,
  telefono text,
  aceptar_promociones boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  direccion text,
  CONSTRAINT clientes_pkey PRIMARY KEY (id),
  CONSTRAINT clientes_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id)
);
-- RLS: ALL admin (empresa_id = get_mi_empresa_id()) | INSERT public (empresa_id IS NOT NULL)

CREATE TABLE public.pedidos (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  numero_pedido integer NOT NULL DEFAULT nextval('pedidos_numero_pedido_seq'::regclass),
  empresa_id uuid NOT NULL,
  total numeric NOT NULL,
  moneda text DEFAULT 'EUR'::text,
  detalle_pedido jsonb,
  estado text DEFAULT 'pendiente'::text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  cliente_id uuid,
  CONSTRAINT pedidos_pkey PRIMARY KEY (id),
  CONSTRAINT pedidos_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id),
  CONSTRAINT pedidos_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id)
);
-- RLS: SELECT/UPDATE/DELETE admin (empresa_id = get_mi_empresa_id()) | INSERT public (empresa_id & cliente_id NOT NULL)

CREATE TABLE public.promociones (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  empresa_id uuid NOT NULL,
  fecha_hora timestamp with time zone NOT NULL,
  texto_promocion text NOT NULL,
  numero_envios integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  imagen_url text,
  CONSTRAINT promociones_pkey PRIMARY KEY (id),
  CONSTRAINT promociones_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id)
);
-- RLS: Full CRUD admin (empresa_id via subquery: perfiles_admin where id = auth.uid())
