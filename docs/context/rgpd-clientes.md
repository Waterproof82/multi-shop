# RGPD — Ciclo de vida de datos de clientes

> Referencia: RGPD Art.5(1)(e) (limitación del plazo de conservación), Art.17 (derecho de supresión), Ley Orgánica 3/2018 (LOPDGDD, art. 32 bloqueo), Art.66 LGT (obligación fiscal), art. 120 TRLGDCU (garantía 3 años).
>
> **Actualizado 2026-10-01**: el plazo depende de si el tenant tiene TPV (`empresas.tpv_habilitado`), y anonimizar borra ahora también la dirección (en `clientes` y la copia en `pedidos`). Ver `tpv-por-tenant.md`.

---

## Ciclo de vida completo

```
Alta de cliente
  → clientes.ultima_actividad = NOW()  [DEFAULT en migration]
  → clientes.anonimizado_en = NULL

Nuevo pedido (cualquiera)
  → trigger trg_pedidos_ultima_actividad
  → UPDATE clientes SET ultima_actividad = NOW()

... (5 años sin actividad si el tenant tiene TPV; 3 si no) ...

Vercel Cron mensual (día 1, 03:00 UTC)
  → GET /api/cron/rgpd-purge
  → por cada grupo de empresas con el mismo plazo (planDePurga):
       UPDATE clientes SET <CAMPOS_ANONIMIZADOS>, anonimizado_en = NOW()
        WHERE anonimizado_en IS NULL AND empresa_id IN (...) AND ultima_actividad < corte
       UPDATE pedidos SET <CAMPOS_PEDIDO_ANONIMIZADOS> WHERE cliente_id IN (anonimizados)

(En cualquier momento) Derecho al olvido
  → POST /api/admin/rgpd/anonimizar-cliente { clienteId }
  → Mismo efecto que el cron, pero inmediato y por cliente individual
```

---

## Plazo de conservación — depende del TPV del tenant

| Tenant | Plazo | Por qué |
|---|---|---|
| **Con TPV** (`tpv_habilitado = true`) | **5 años** sin actividad | El TPV emite los tickets/facturas: los pedidos son registros fiscales de este sistema (Art.66 LGT) |
| **Sin TPV** | **3 años** sin actividad | Factura un programa externo: aquí no hay registro fiscal. 3 años = garantía legal (art. 120 TRLGDCU), para poder atender una reclamación |

Única fuente de verdad: `retencionClientesAnios()` en `src/lib/empresa/tpv-legal.ts`. La usan la purga (`planDePurga`) y `/privacidad` (sección 5 y finalidades). Si cambias un plazo, cambia ahí y nada más.

---

## Qué se borra al anonimizar

`src/lib/rgpd/plan-purga.ts` — compartido por la purga mensual y el derecho de supresión:

| Tabla | Campos | Constante |
|---|---|---|
| `clientes` | `nombre` → `'ANONIMIZADO'`, `email`, `telefono`, `direccion` → `NULL` | `CAMPOS_ANONIMIZADOS` |
| `pedidos` (copia del domicilio) | `direccion_entrega`, `codigo_postal`, `latitude_entrega`, `longitude_entrega` → `NULL` | `CAMPOS_PEDIDO_ANONIMIZADOS` |

**Fallo corregido el 2026-10-01:** hasta esa fecha solo se borraban `nombre/email/telefono`. La dirección del cliente y la copia del domicilio con coordenadas exactas en cada pedido se quedaban para siempre. La migración `20261001000001` limpió a los ya anonimizados (0 filas afectadas en producción).

**Seguro respecto a triggers:** los triggers `AFTER UPDATE` de `pedidos` solo vigilan `estado` (`pedidos_notify_estado_update`, y `notify_waiter_order_validated`/`push_on_pedido_validated` actúan solo si cambia) y `detalle_pedido, total` (`pedidos_notify_item_update`). Borrar el domicilio no dispara Realtime ni push. Si se añade un trigger nuevo sin columnas, revisar.

---

## Alta de cliente

Cuando un usuario introduce sus datos en el carrito o en cualquier formulario de pedido, se crea un registro en `clientes`:

- `nombre`, `email`, `telefono`, `direccion` — datos personales identificables (PII)
- `ultima_actividad = NOW()` — se establece en el momento del alta vía `DEFAULT NOW()`
- `anonimizado_en = NULL` — el cliente no está anonimizado

**Archivos:**
- `src/core/infrastructure/database/supabase-cliente.repository.ts` → `create()`
- `supabase/migrations/20260720100005_clientes_rgpd.sql`

---

## Actualización de actividad

Cada vez que el cliente realiza un pedido, el trigger de DB actualiza `ultima_actividad`:

```sql
-- trigger trg_pedidos_ultima_actividad (AFTER INSERT ON pedidos)
UPDATE clientes SET ultima_actividad = NOW()
WHERE id = NEW.cliente_id AND anonimizado_en IS NULL;
```

El reloj de retención parte del **último pedido**, no del alta.

**Nota:** cambios de perfil sin pedido asociado no actualizan `ultima_actividad`. Es correcto: la actividad comercial relevante es el pedido.

---

## Purga automática (Vercel Cron)

**Mecanismo:** Vercel Cron (no pg_cron — no disponible en plan Free de Supabase).

| Parámetro | Valor |
|---|---|
| Endpoint | `GET /api/cron/rgpd-purge` |
| Frecuencia | Mensual — día 1 a las 03:00 UTC (`0 3 1 * *`) |
| Autenticación | `Authorization: Bearer {CRON_SECRET}` |
| Plazo | Por tenant: 5 años con TPV, 3 sin TPV |
| Registro | Cada ejecución queda en `rgpd_purge_log` (solo inserción) |

**Cómo decide:** lee `empresas (id, tpv_habilitado)`, `planDePurga()` las agrupa por plazo (grupos vacíos se omiten: nunca un `IN ()`), y por cada grupo anonimiza clientes y luego sus pedidos en lotes de 200 ids. El UPDATE de clientes reintenta una vez ante `/timeout|gateway/i` (idempotente).

**Respuesta:** `{ "anonymized": 3 }` (total de todos los grupos).

**Archivos:**
- `src/app/api/cron/rgpd-purge/route.ts`
- `src/core/application/use-cases/rgpd/purge-expired-clientes.use-case.ts`
- `src/core/infrastructure/database/supabase-cliente.repository.ts` → `purgeExpiredClientes()`
- `src/lib/rgpd/plan-purga.ts`
- `vercel.json`

---

## Derecho de supresión (Art. 17 RGPD)

```
POST /api/admin/rgpd/anonimizar-cliente
Authorization: admin/superadmin token
Body: { "clienteId": "uuid" }
```

**Efecto:** los mismos `CAMPOS_ANONIMIZADOS` + `anonimizado_en = NOW()`, y `CAMPOS_PEDIDO_ANONIMIZADOS` en todos sus pedidos (filtrado también por `empresa_id`).

**Garantías:**
- **Idempotente** — el UPDATE de clientes filtra `anonimizado_en IS NULL`.
- **Integridad referencial** — `id` y FKs con `pedidos` se preservan.
- **Acceso restringido** — solo `admin` y `superadmin`.

**Archivos:**
- `src/app/api/admin/rgpd/anonimizar-cliente/route.ts`
- `src/core/application/use-cases/rgpd/anonimizar-cliente.use-case.ts`
- `supabase-cliente.repository.ts` → `anonimizarCliente()`

---

## Qué datos SE CONSERVAN

| Tabla | Por qué |
|---|---|
| `pedidos` (productos, importes, fechas — sin datos personales tras anonimizar) | Documentación mercantil (art. 30 C. Comercio, 6 años), justificante ante Hacienda, garantías y devoluciones de cargos. DELETE bloqueado para TODOS los tenants (trigger `pedidos_no_delete`), tengan TPV o no |
| `tpv_cobros` | Registros fiscales — RD 1619/2012. DELETE bloqueado por trigger |
| `tpv_turnos` | Turnos Z — Ley 11/2021. DELETE bloqueado por trigger |

Tras anonimizar, un pedido queda como _"Batería ES290 — 89,90 € — 12/03/2026"_: no identifica a nadie.

## Copias de seguridad

Los datos anonimizados siguen en las copias anteriores (`db-backup.yml`: diarias 30 días, mensuales 6 años) hasta que caducan. Es legal porque quedan **bloqueados** (art. 32 LOPDGDD): no se usan y, si se restaura una copia, se vuelve a aplicar la anonimización (re-ejecutar la purga). Así lo dice `/privacidad`. Las copias son de TODA la BD: no dependen del TPV del tenant.

---

## Preguntas frecuentes

**¿El cron mensual no viola el RGPD si se pasa un mes del plazo?**
No. Un margen de ~30 días sobre 3–5 años es jurídicamente irrelevante. Lo que importa es tener el mecanismo y que funcione.

**¿Qué pasa si un cliente se crea pero nunca hace un pedido?**
`ultima_actividad = created_at`. Se anonimiza tras el plazo de su tenant contado desde el alta.

**Si un tenant no tiene TPV, ¿se pueden BORRAR sus pedidos?**
No. Siguen siendo documentación de su negocio (6 años, art. 30 C. Comercio), justificante ante Hacienda y prueba frente a reclamaciones y devoluciones de cargos. Además somos ENCARGADOS del tratamiento: borrar registros del tenant por decisión propia va contra el art. 28 RGPD. Lo que exige el RGPD (quitar los datos personales) ya lo hace la anonimización. Si un tenant pidiera borrar su histórico, sería decisión suya, por escrito y con su asesor.

**¿Puede el admin borrar un cliente completamente?**
Existe `DELETE /api/admin/clientes/[id]` en el repositorio, pero no está expuesto por defecto. La anonimización es el camino recomendado porque preserva la integridad referencial con `pedidos`.

**¿Qué pasa con los clientes de un tenant al apagarle el TPV?**
En la siguiente purga mensual su plazo pasa de 5 a 3 años: los que lleven más de 3 años sin actividad se anonimizan. No se puede deshacer — avisar antes de apagar el TPV a un tenant con histórico.
