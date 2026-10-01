-- Interruptor de TPV por tenant (solo superadmin).
--
-- El TPV es lo único que emite facturas/tickets en este sistema y donde vive
-- el registro de jornada. Sin TPV: /tpv y /api/tpv|laborcontrol se bloquean,
-- no hay registro de jornada y los datos de clientes se anonimizan a los
-- 3 años en vez de 5 (ver src/lib/empresa/tpv-legal.ts).
--
-- DEFAULT false: una empresa nueva no tiene TPV hasta que el superadmin lo
-- activa. Las existentes se activan para no quitarle el TPV a nadie.
-- Apagarlo NUNCA borra cobros ni fichajes (retención fiscal y laboral).

ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS tpv_habilitado BOOLEAN NOT NULL DEFAULT false;

UPDATE public.empresas SET tpv_habilitado = true;

COMMENT ON COLUMN public.empresas.tpv_habilitado IS
  'Solo superadmin. TPV + registro de jornada + facturación en este sistema. false = factura un programa externo; clientes anonimizados a 3 años.';

-- Limpieza de una vez: hasta hoy la anonimización (purga mensual y derecho de
-- supresión) no borraba `clientes.direccion` ni la copia del domicilio en
-- `pedidos`. Se aplica a los clientes YA anonimizados. Ningún trigger
-- AFTER UPDATE de pedidos vigila estas columnas (solo estado, detalle_pedido,
-- total): no dispara Realtime ni push.
UPDATE public.clientes
   SET direccion = NULL
 WHERE anonimizado_en IS NOT NULL
   AND direccion IS NOT NULL;

UPDATE public.pedidos p
   SET direccion_entrega = NULL,
       codigo_postal     = NULL,
       latitude_entrega  = NULL,
       longitude_entrega = NULL
  FROM public.clientes c
 WHERE p.cliente_id = c.id
   AND c.anonimizado_en IS NOT NULL
   AND (p.direccion_entrega IS NOT NULL OR p.codigo_postal IS NOT NULL
        OR p.latitude_entrega IS NOT NULL OR p.longitude_entrega IS NOT NULL);
