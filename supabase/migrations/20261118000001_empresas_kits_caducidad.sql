-- kit-expiry-reminders M4 (sdd en kitemergenciacanarias,
-- docs/sdd/kit-expiry-reminders/m4/), PR1 (M4a1): interruptor por tenant del
-- panel de admin de kits + RPC transaccional para sustituir caducidades de
-- un lote (se crea aquí para que el propietario haga un solo `db push`; no
-- la llama ningún caso de uso hasta M4a2).
--
-- Decisiones de design.md:
--   DD1  el flag se comprueba en un helper de ruta (resolveKitsAdminContext),
--        nunca en el proxy: solo el helper conoce la empresa OBJETIVO del
--        superadmin (?empresaId=), el proxy solo el x-empresa-id del JWT.
--   DD4  GRANT por columna, aditivo (como 20261110000001): la columna nueva
--        queda invisible para anon hasta que se añada explícitamente ahí.
--   DD5  reemplazo de kit_lote_caducidades por RPC transaccional, no
--        delete+insert vía PostgREST: un fallo a mitad de un delete+insert
--        dejaría el lote SIN fechas. La función entera es una transacción
--        (la llamada RPC ya corre dentro de una), así que si el trigger
--        kit_caducidades_validar_empresa o el CHECK una_fuente fallan, el
--        lote conserva el conjunto anterior.
--
-- ROLLBACK:
--   REVOKE EXECUTE ON FUNCTION public.kit_lote_reemplazar_caducidades(uuid, uuid, jsonb) FROM service_role;
--   DROP FUNCTION public.kit_lote_reemplazar_caducidades(uuid, uuid, jsonb);
--   ALTER TABLE public.empresas DROP COLUMN kits_caducidad_habilitado;

-- ── 1. Interruptor por tenant ────────────────────────────────────────────
ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS kits_caducidad_habilitado boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.empresas.kits_caducidad_habilitado IS
  'Módulo de kits de emergencia con caducidad real (kit-expiry-reminders M4). '
  'Solo lo cambia el superadmin (superadminUpdateEmpresaSchema). R-M4.1.2.';

-- Aditivo: amplía el GRANT por columna de 20261110000001_restrict_empresas_
-- secret_columns.sql sin reescribir la lista completa. Solo `authenticated`
-- (el admin del tenant lee su propio flag vía service_role de todas formas;
-- esto es para no romper si algún día se lee sin service_role). NUNCA a
-- `anon`: la página pública del QR (M2) va por service_role.
GRANT SELECT (kits_caducidad_habilitado) ON public.empresas TO authenticated;

-- ── 2. Reemplazo transaccional de caducidades de un lote (DD5) ───────────
-- p_items: array de objetos
--   { "ingrediente_id": uuid, "parte": text, "albaran_compra_item_id": uuid|null, "caduca_el": date|null }
-- El XOR por ítem (una sola fuente) ya lo exige el Zod de la API
-- (replaceCaducidadesSchema, M4a2) Y el CHECK kit_lote_caducidades_una_fuente
-- de la tabla: esta función no lo repite, confía en el CHECK para no
-- duplicar la regla en dos sitios.
--
-- SECURITY INVOKER (no DEFINER): corre con los privilegios de quien llama
-- (service_role, que ya salta la RLS); no hace falta elevar privilegios.
CREATE OR REPLACE FUNCTION public.kit_lote_reemplazar_caducidades(
  p_empresa_id uuid,
  p_lote_id uuid,
  p_items jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.kit_lotes WHERE id = p_lote_id AND empresa_id = p_empresa_id
  ) THEN
    RAISE EXCEPTION 'kit_lote_reemplazar_caducidades: el lote % no existe para esta empresa', p_lote_id
      USING ERRCODE = 'P0002';
  END IF;

  DELETE FROM public.kit_lote_caducidades
    WHERE lote_id = p_lote_id AND empresa_id = p_empresa_id;

  INSERT INTO public.kit_lote_caducidades
    (lote_id, empresa_id, ingrediente_id, parte, albaran_compra_item_id, caduca_el)
  SELECT
    p_lote_id,
    p_empresa_id,
    x.ingrediente_id,
    coalesce(x.parte, ''),
    x.albaran_compra_item_id,
    x.caduca_el
  FROM jsonb_to_recordset(p_items) AS x(
    ingrediente_id uuid,
    parte text,
    albaran_compra_item_id uuid,
    caduca_el date
  );
END;
$$;

-- Solo el backend. Sin estos REVOKE la función quedaría expuesta en
-- /rest/v1/rpc/kit_lote_reemplazar_caducidades para cualquier cliente con
-- sesión (mismo patrón que reset_empresa_prueba, 20261001000002).
REVOKE EXECUTE ON FUNCTION public.kit_lote_reemplazar_caducidades(uuid, uuid, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.kit_lote_reemplazar_caducidades(uuid, uuid, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.kit_lote_reemplazar_caducidades(uuid, uuid, jsonb) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.kit_lote_reemplazar_caducidades(uuid, uuid, jsonb) TO service_role;
