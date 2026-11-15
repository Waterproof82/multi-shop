-- store-people-configurator · BACKFILL de datos (DML, NO es migración).
--
-- APLICADO en producción (multi_tienda) el 2026-11-15 con autorización del
-- owner ("hazlo tú" + "sí"), en reemplazo del db push acordado originalmente.
-- La migración se registró en supabase_migrations con version 20261114000001
-- (nombre 20261114000001_store_people_configurator), corregida a mano desde
-- el timestamp 20261115170646 que graba apply_migration — así un db push
-- futuro la reconoce como ya aplicada. Re-ejecutar este archivo es seguro
-- (idempotente + guards), pero ya no es necesario.
--
-- Cómo se ejecuta: SQL Editor de Supabase (o execute_sql) contra multi_tienda,
-- como UNA transacción (BEGIN..COMMIT ya incluidos). Re-ejecutable: las
-- UPDATE son idempotentes y los guards verifican estado final, no preestado.
--
-- ORDEN DE EJECUCIÓN — solo DESPUÉS de aplicar la migración
-- 20261114000001_store_people_configurator.sql (db push --linked). Si las
-- columnas personas_* / regla_personas / tabla_fila no existen todavía, el
-- script falla en la primera UPDATE: es lo esperado, no un bug.
--
-- Qué escribe:
--   1. productos (solo los 2 kits de KEC): configurador de personas
--      personas_min=1, personas_max=10, personas_paso_cents=10000
--      (199 € / 299 € base + 100 € por persona extra, brief del owner).
--   2. receta_items de cada kit: regla_personas + tabla_fila por fila.
--
-- Reglas (multiplicador RELATIVO sobre la cantidad base de la fila —
-- espejo de factorPeople() en src/lib/catalogo/escala-people.ts):
--   'por_persona' → base × N          'pack:C'    → base × ceil(N / C)
--   'compartido'  → base × 1          NULL        → ×1 (legado)
-- La ración NRG-M lleva cantidad_necesaria = 2 (base-2) y regla
-- 'por_persona' → escala 2×N, byte-paridad con la web (perPersonCounts C=2).
--
-- Mapa verificado contra la DB viva y contra el config del web
-- (kitemergenciacanarias src/features/catalog/domain/products.ts
-- KIT_PEOPLE_SCALING) fila a fila, 2026-11-14:
--
--   Kit Estándar 72H (df4b4d14-8f43-408b-b4aa-683915f19790, tabla 13 filas)
--     por_persona : mochila(0) frontal(2) FFP2(5) poncho(8) utensilio(9) silbato(11)
--     pack:4      : pastillas(6)        pack:3 : fundas(10)
--     compartido  : radio(1) cable(3) adaptador(4) botiquín(7) powerbank(12)
--   Kit Estándar 72H Plus (1341ea1b-2dd2-47e9-a0c9-e66a20cbb4e0, tabla 19 filas)
--     filas 0-11 iguales (5 = FFP3 en vez de FFP2), y:
--     compartido  : GOODIS(12) filtro(13) Victorinox(14) Aktive(15)
--     por_persona : barritas(16) gafas(17) ración base-2(18)
--
-- Cada UPDATE casa por ingrediente_id Y nombre (doble llave: si cualquiera
-- de los dos drifta, la fila queda sin regla y el guard del final aborta la
-- transacción con error, nunca queda un escalado a medias en silencio).

BEGIN;

-- ── 1. Configurador del producto: límites y paso de precio ────────────────
UPDATE productos
SET personas_min = 1, personas_max = 10, personas_paso_cents = 10000
WHERE id IN (
  'df4b4d14-8f43-408b-b4aa-683915f19790',  -- Kit Estándar 72H   (199 €)
  '1341ea1b-2dd2-47e9-a0c9-e66a20cbb4e0'   -- Kit Estándar 72H Plus (299 €)
);

-- ── 2. Kit Estándar 72H: regla + tabla_fila por fila (13 filas, 0-12) ─────
UPDATE receta_items ri
SET regla_personas = m.regla, tabla_fila = m.fila
FROM ingredientes i
JOIN (VALUES
  ('bc8b7390-bdd6-4d27-8e1a-053edf1a8770'::uuid, 'Mochila 45 L',                          0::int, 'por_persona'),
  ('66e7ab67-6165-4a0d-8261-53b47ea9741c'::uuid, 'Radio Thomson',                         1::int, 'compartido'),
  ('1e3449d7-bf83-4508-baf5-e3b2ca0ae905'::uuid, 'Frontal LED 150 lm',                    2::int, 'por_persona'),
  ('b9f1ab6d-4a38-472a-8a1e-06b6760ddb06'::uuid, 'Cable USB-A a USB-C',                   3::int, 'compartido'),
  ('869d90a8-50b3-47f0-8ec3-75d3f3a9d12b'::uuid, 'Adaptador USB-A a USB-C',               4::int, 'compartido'),
  ('79ab75c5-2955-4749-a403-0cc106f38026'::uuid, 'Mascarillas FFP2 (pack 5)',             5::int, 'por_persona'),
  ('1e913c81-e827-44f3-9e8e-1e5d5fef9f02'::uuid, 'Pastillas potabilizadoras de agua (50 uds.)', 6::int, 'pack:4'),
  ('3f96f853-4adf-417b-a83a-48f51130cce2'::uuid, 'Botiquín DIN 13164',                    7::int, 'compartido'),
  ('d1cb8831-f798-4742-8def-2a84cab2a351'::uuid, 'Poncho térmico',                       8::int, 'por_persona'),
  ('72a22926-e0ee-4487-848c-63e8d17e9c61'::uuid, 'Utensilio 5 en 1',                     9::int, 'por_persona'),
  ('25330543-3990-48d3-9111-965915351b9d'::uuid, 'Fundas documentos (pack 3)',           10::int, 'pack:3'),
  ('6cad8ac4-2e08-49ad-a44e-2699399a1b8b'::uuid, 'Silbato',                              11::int, 'por_persona'),
  ('98cd8101-c875-4a14-9ca1-9e617f3eb4a8'::uuid, 'Powerbank INNOVA 11.000 mAh',          12::int, 'compartido')
) AS m(ingrediente_id, nombre, fila, regla)
  ON m.ingrediente_id = i.id AND m.nombre = i.nombre
WHERE ri.ingrediente_id = i.id
  AND ri.producto_id = 'df4b4d14-8f43-408b-b4aa-683915f19790';

-- ── 3. Kit Estándar 72H Plus: regla + tabla_fila por fila (19 filas, 0-18) ─
UPDATE receta_items ri
SET regla_personas = m.regla, tabla_fila = m.fila
FROM ingredientes i
JOIN (VALUES
  ('bc8b7390-bdd6-4d27-8e1a-053edf1a8770'::uuid, 'Mochila 45 L',                          0::int, 'por_persona'),
  ('66e7ab67-6165-4a0d-8261-53b47ea9741c'::uuid, 'Radio Thomson',                         1::int, 'compartido'),
  ('1e3449d7-bf83-4508-baf5-e3b2ca0ae905'::uuid, 'Frontal LED 150 lm',                    2::int, 'por_persona'),
  ('b9f1ab6d-4a38-472a-8a1e-06b6760ddb06'::uuid, 'Cable USB-A a USB-C',                   3::int, 'compartido'),
  ('869d90a8-50b3-47f0-8ec3-75d3f3a9d12b'::uuid, 'Adaptador USB-A a USB-C',               4::int, 'compartido'),
  ('118c6cb5-bef9-4390-a391-7427040d8724'::uuid, 'Mascarillas FFP3 SAFETOP (pack 10)',    5::int, 'por_persona'),
  ('1e913c81-e827-44f3-9e8e-1e5d5fef9f02'::uuid, 'Pastillas potabilizadoras de agua (50 uds.)', 6::int, 'pack:4'),
  ('3f96f853-4adf-417b-a83a-48f51130cce2'::uuid, 'Botiquín DIN 13164',                    7::int, 'compartido'),
  ('d1cb8831-f798-4742-8def-2a84cab2a351'::uuid, 'Poncho térmico',                       8::int, 'por_persona'),
  ('72a22926-e0ee-4487-848c-63e8d17e9c61'::uuid, 'Utensilio 5 en 1',                     9::int, 'por_persona'),
  ('25330543-3990-48d3-9111-965915351b9d'::uuid, 'Fundas documentos (pack 3)',           10::int, 'pack:3'),
  ('6cad8ac4-2e08-49ad-a44e-2699399a1b8b'::uuid, 'Silbato',                              11::int, 'por_persona'),
  ('bde8b011-6dca-4da9-9f5c-50a8ac10f7ed'::uuid, 'Powerbank GOODIS 20.000 mAh',          12::int, 'compartido'),
  ('40ca6160-2257-4746-a821-3af2d452537a'::uuid, 'Filtro de agua Sawyer Mini',           13::int, 'compartido'),
  ('e0ff6d16-9716-4941-9b3c-4984f336cc95'::uuid, 'Multiherramienta Victorinox Camper',   14::int, 'compartido'),
  ('9ff5603d-99ab-417a-b4c6-0cd8fdc46867'::uuid, 'Aktive Beach Pack (3 uds.)',           15::int, 'compartido'),
  ('7b0528db-7d02-4e54-b278-21862c670b87'::uuid, 'Barritas energéticas CLIF (pack 12)',  16::int, 'por_persona'),
  ('b01ffd21-8b7f-4a9f-acc4-09806321c559'::uuid, 'Gafas anti-polvo',                     17::int, 'por_persona'),
  ('29470075-fd86-4351-9224-a2c8ad434aba'::uuid, 'Ración Trek''n Eat NRG-M (4 barritas, 250 g)', 18::int, 'por_persona')
) AS m(ingrediente_id, nombre, fila, regla)
  ON m.ingrediente_id = i.id AND m.nombre = i.nombre
WHERE ri.ingrediente_id = i.id
  AND ri.producto_id = '1341ea1b-2dd2-47e9-a0c9-e66a20cbb4e0';

-- ── 4. Guards: si algo de esto falla, la transacción COMPLETA hace rollback.
--    Cobertura 100% (toda fila de receta con regla válida y tabla_fila única
--    en rango), config completa, anclas de paridad web, y precios del brief.
DO $$
DECLARE
  v_min int;  v_max int;  v_paso int;  v_precio numeric;
  v_total int;  v_con_regla int;  v_filas_ok int;  v_distintas int;
  v_filas_min int;  v_filas_max int;
  v_packs int;  v_tabla_filas int;  v_racion numeric;
BEGIN
  -- Kit Estándar 72H: config (1, 10, 10000) y precio 199 €.
  SELECT personas_min, personas_max, personas_paso_cents, precio
    INTO v_min, v_max, v_paso, v_precio
  FROM productos WHERE id = 'df4b4d14-8f43-408b-b4aa-683915f19790';
  IF v_min IS DISTINCT FROM 1 OR v_max IS DISTINCT FROM 10 OR v_paso IS DISTINCT FROM 10000 THEN
    RAISE EXCEPTION 'Estándar: config personas no quedó 1/10/10000 (min=%, max=%, paso=%).', v_min, v_max, v_paso;
  END IF;
  IF v_precio IS DISTINCT FROM 199.00 THEN
    RAISE EXCEPTION 'Estándar: precio base % ≠ 199 € del brief; revisa antes de continuar.', v_precio;
  END IF;

  -- Estándar: 13 filas de receta, todas con regla, tabla_fila = 0..12 único,
  -- exactamente 2 packs y 13 filas de tabla en el jsonb.
  SELECT count(*), count(regla_personas),
         count(*) FILTER (WHERE tabla_fila BETWEEN 0 AND 12),
         count(DISTINCT tabla_fila), min(tabla_fila), max(tabla_fila),
         count(*) FILTER (WHERE regla_personas LIKE 'pack:%')
    INTO v_total, v_con_regla, v_filas_ok, v_distintas, v_filas_min, v_filas_max, v_packs
  FROM receta_items WHERE producto_id = 'df4b4d14-8f43-408b-b4aa-683915f19790';
  IF v_total <> 13 OR v_con_regla <> 13 OR v_filas_ok <> 13 OR v_distintas <> 13
     OR v_filas_min <> 0 OR v_filas_max <> 12 OR v_packs <> 2 THEN
    RAISE EXCEPTION 'Estándar: receta no quedó 13/13 con tabla_fila 0-12 única y 2 packs (total %, regla %, en rango %, distintas %, min %, max %, packs %).',
      v_total, v_con_regla, v_filas_ok, v_distintas, v_filas_min, v_filas_max, v_packs;
  END IF;
  SELECT jsonb_array_length(tabla_info->'filas') INTO v_tabla_filas
  FROM productos WHERE id = 'df4b4d14-8f43-408b-b4aa-683915f19790';
  IF v_tabla_filas <> 13 THEN
    RAISE EXCEPTION 'Estándar: tabla_info tiene % filas, el mapa asume 13.', v_tabla_filas;
  END IF;

  -- Kit Estándar 72H Plus: config (1, 10, 10000) y precio 299 €.
  SELECT personas_min, personas_max, personas_paso_cents, precio
    INTO v_min, v_max, v_paso, v_precio
  FROM productos WHERE id = '1341ea1b-2dd2-47e9-a0c9-e66a20cbb4e0';
  IF v_min IS DISTINCT FROM 1 OR v_max IS DISTINCT FROM 10 OR v_paso IS DISTINCT FROM 10000 THEN
    RAISE EXCEPTION 'Plus: config personas no quedó 1/10/10000 (min=%, max=%, paso=%).', v_min, v_max, v_paso;
  END IF;
  IF v_precio IS DISTINCT FROM 299.00 THEN
    RAISE EXCEPTION 'Plus: precio base % ≠ 299 € del brief; revisa antes de continuar.', v_precio;
  END IF;

  -- Plus: 19 filas de receta, todas con regla, tabla_fila = 0..18 único,
  -- exactamente 2 packs, y 19 filas de tabla en el jsonb.
  SELECT count(*), count(regla_personas),
         count(*) FILTER (WHERE tabla_fila BETWEEN 0 AND 18),
         count(DISTINCT tabla_fila), min(tabla_fila), max(tabla_fila),
         count(*) FILTER (WHERE regla_personas LIKE 'pack:%')
    INTO v_total, v_con_regla, v_filas_ok, v_distintas, v_filas_min, v_filas_max, v_packs
  FROM receta_items WHERE producto_id = '1341ea1b-2dd2-47e9-a0c9-e66a20cbb4e0';
  IF v_total <> 19 OR v_con_regla <> 19 OR v_filas_ok <> 19 OR v_distintas <> 19
     OR v_filas_min <> 0 OR v_filas_max <> 18 OR v_packs <> 2 THEN
    RAISE EXCEPTION 'Plus: receta no quedó 19/19 con tabla_fila 0-18 única y 2 packs (total %, regla %, en rango %, distintas %, min %, max %, packs %).',
      v_total, v_con_regla, v_filas_ok, v_distintas, v_filas_min, v_filas_max, v_packs;
  END IF;
  SELECT jsonb_array_length(tabla_info->'filas') INTO v_tabla_filas
  FROM productos WHERE id = '1341ea1b-2dd2-47e9-a0c9-e66a20cbb4e0';
  IF v_tabla_filas <> 19 THEN
    RAISE EXCEPTION 'Plus: tabla_info tiene % filas, el mapa asume 19.', v_tabla_filas;
  END IF;

  -- Ancla de paridad web: la ración NRG-M es base-2 (perPersonCounts C=2).
  SELECT cantidad_necesaria INTO v_racion
  FROM receta_items
  WHERE producto_id = '1341ea1b-2dd2-47e9-a0c9-e66a20cbb4e0'
    AND ingrediente_id = '29470075-fd86-4351-9224-a2c8ad434aba';
  IF v_racion IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'Plus: ración NRG-M tiene cantidad_necesaria %, debe ser 2 (base-2 × por_persona = paridad web).', v_racion;
  END IF;
END $$;

COMMIT;
