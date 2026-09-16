-- Task de mejoras UI (2026-09-15): recogida pasa a ser siempre gratis en
-- todo el sistema, no solo una preferencia de UI — ver
-- docs/superpowers/specs/2026-09-15-mejoras-ui-modalidades-entrega-design.md
-- decisión #1.

-- Backfill defensivo: cualquier fila recogida con precio > 0 queda en 0.
-- A la fecha de este diseño solo existían filas de prueba, pero no se asume
-- sin haber corrido el SELECT del Step 1 primero.
UPDATE public.modalidades_entrega SET precio_cents = 0 WHERE tipo = 'recogida' AND precio_cents > 0;

ALTER TABLE public.modalidades_entrega
  ADD CONSTRAINT precio_cero_en_recogida CHECK (
    (tipo = 'recogida' AND precio_cents = 0)
    OR tipo = 'domicilio'
  );
