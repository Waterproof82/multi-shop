-- Scope por empresa del broadcast de sesiones de mesa.
--
-- EL PROBLEMA
-- `notify_mesa_sesion_update()` publicaba en el topic fijo 'mesa-sesion-update'
-- con `private = FALSE`. En Realtime Broadcast el NOMBRE DEL CANAL es la clave
-- de enrutado —no hay `filter` ni RLS por fila como en postgres_changes— así que
-- un topic global sin scope es literalmente un firehose abierto: cualquiera con
-- la anon key (que va en el bundle de todos los tenants, es pública por diseño)
-- se suscribía y recibía en vivo la actividad de mesas de TODOS los
-- restaurantes de la plataforma.
--
-- No se filtraba PII, ni importes, ni el contenido de las comandas: solo UUIDs
-- y booleanos. Pero es telemetría de negocio de cada tenant, en tiempo real.
--
-- Y era además una factura de latencia. Los cinco suscriptores filtraban EN EL
-- CLIENTE, así que cada dispositivo se despertaba a re-consultar por actividad
-- de empresas ajenas: el banner del camarero lanzaba `fetchCounts()` porque en
-- otro restaurante, de otra empresa, alguien cerró una mesa.
--
-- ── POR QUÉ SE EMITE A DOS TOPICS DURANTE UNA SEMANA ────────────────────────
-- La migración se aplica ANTES de que el código nuevo esté desplegado, y hay
-- clientes que viven abiertos durante todo un turno: el TPV de barra, el PDA del
-- camarero. Cortar en seco el topic viejo los dejaría sin tiempo real EN PLENO
-- SERVICIO, que es exactamente lo que no se puede romper.
--
-- Así que durante la transición se emite a los dos. El corte NO depende de que
-- alguien se acuerde de aplicar una segunda migración: la propia función deja de
-- publicar en el topic legacy a partir de la fecha límite. Si nadie hace nada,
-- la fuga se cierra sola.
--
-- ── LO QUE ESTO NO ES ──────────────────────────────────────────────────────
-- Esto es AISLAMIENTO por tenant, no autorización. Sigue siendo un canal
-- público: para suscribirse basta conocer el `empresa_id`, que dentro del propio
-- tenant no es secreto. Un canal privado de verdad (`private = TRUE` + RLS sobre
-- `realtime.messages`) exigiría que el móvil del comensal presentara un token
-- con claim de tenant, y hoy entra con la anon key y sin sesión — dejaría a
-- todos los comensales sin tiempo real. Ese es otro trabajo. Este cierra el
-- firehose global, que es el problema gordo.

CREATE OR REPLACE FUNCTION public.notify_mesa_sesion_update()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  -- Fin de la ventana de convivencia. A partir de aquí solo se publica en el
  -- topic con scope, sin intervención humana.
  v_legacy_hasta CONSTANT timestamptz := TIMESTAMPTZ '2026-08-12 00:00:00+00';
  v_payload      jsonb;
BEGIN
  v_payload := jsonb_build_object(
    'empresaId',    NEW.empresa_id,
    'mesaId',       NEW.mesa_id,
    'sesionId',     NEW.id,
    'pagoEnCurso',  NEW.pago_en_curso,
    'sesionPagada', NEW.sesion_pagada,
    'cerradaAt',    NEW.cerrada_at
  );

  -- Topic con scope de tenant. El nombre lo construye igual
  -- `mesaSesionChannel()` en src/lib/realtime-channels.ts: si uno de los dos
  -- lados cambia el formato, el otro se queda mudo SIN dar error.
  PERFORM realtime.send(
    v_payload,
    'update',
    'mesa-sesion-update:' || NEW.empresa_id::text,
    FALSE
  );

  -- Topic legacy, solo mientras queden clientes con el código viejo abierto.
  IF now() < v_legacy_hasta THEN
    PERFORM realtime.send(v_payload, 'update', 'mesa-sesion-update', FALSE);
  END IF;

  RETURN NEW;
END;
$function$;

-- La función es SECURITY DEFINER: mismos REVOKEs que ya tenía (ver la migración
-- 20260731083202). Se repiten porque CREATE OR REPLACE no altera los privilegios
-- existentes, pero dejarlos escritos evita que un futuro DROP + CREATE los
-- pierda por el camino.
REVOKE EXECUTE ON FUNCTION public.notify_mesa_sesion_update() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_mesa_sesion_update() FROM anon;
REVOKE EXECUTE ON FUNCTION public.notify_mesa_sesion_update() FROM authenticated;
