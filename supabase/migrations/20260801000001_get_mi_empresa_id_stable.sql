-- Performance: marcar get_mi_empresa_id() como STABLE.
--
-- PROBLEMA
-- La función se creó sin marca de volatilidad, así que Postgres la trata como
-- VOLATILE (el default). Una función VOLATILE dentro de una policy RLS no se
-- puede sacar a un InitPlan: el planner la reevalúa POR CADA FILA escaneada.
-- Esta función se usa en `USING (empresa_id = get_mi_empresa_id())` en ~29
-- migraciones — prácticamente cada tabla del sistema. El coste es O(N) por
-- query en vez de O(1), en todas las lecturas protegidas por RLS.
--
-- El advisor `auth_rls_initplan` de Supabase NO detecta esto: busca llamadas
-- literales a `auth.<fn>()` en el texto de la policy, y aquí hay un wrapper.
-- Es un punto ciego del linter, no una señal de que todo esté bien.
--
-- POR QUÉ STABLE ES CORRECTO
-- STABLE = "no modifica la BD y devuelve el mismo resultado para los mismos
-- argumentos dentro de una misma sentencia". Se cumple: `auth.uid()` es fijo
-- durante la sentencia y la fila de `perfiles_admin` no cambia dentro de ella.
-- No usamos IMMUTABLE porque el resultado sí depende del estado de la BD y de
-- la sesión entre sentencias distintas.
--
-- Este cambio NO altera la semántica de seguridad: mismo cuerpo, mismo
-- SECURITY DEFINER, mismo search_path, mismos privilegios.

CREATE OR REPLACE FUNCTION public.get_mi_empresa_id()
  RETURNS uuid
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
  SELECT empresa_id FROM public.perfiles_admin
  WHERE id = auth.uid()
  LIMIT 1;
$$;

-- Excepción documentada en CLAUDE.md: a diferencia del resto de funciones
-- SECURITY DEFINER, esta necesita EXECUTE en `authenticated` porque las propias
-- policies RLS la invocan en nombre del usuario autenticado. Se reafirman los
-- privilegios aquí porque CREATE OR REPLACE no los altera, pero dejarlo
-- explícito evita que un despliegue desde cero quede sin ellos.
REVOKE EXECUTE ON FUNCTION public.get_mi_empresa_id() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_mi_empresa_id() FROM anon;
GRANT  EXECUTE ON FUNCTION public.get_mi_empresa_id() TO authenticated;
GRANT  EXECUTE ON FUNCTION public.get_mi_empresa_id() TO service_role;
