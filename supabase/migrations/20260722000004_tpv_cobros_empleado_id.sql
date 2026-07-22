-- Añade empleado_id a tpv_cobros para registrar qué operador procesó cada cobro.
-- UUID sin FK: puede ser auth.users (admin) o empleados_tpv (cajero/encargado),
-- igual que el patrón ya usado en tpv_turno_eventos.empleado_id.
ALTER TABLE public.tpv_cobros
  ADD COLUMN IF NOT EXISTS empleado_id UUID;
