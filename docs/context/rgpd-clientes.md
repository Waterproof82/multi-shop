# RGPD — Ciclo de vida de datos de clientes

> Referencia: RGPD Art.5(1)(e) (limitación del plazo de conservación), Art.17 (derecho de supresión), Ley Orgánica 3/2018 (LOPDGDD), Art.66 LGT (obligación fiscal 5 años).

---

## Ciclo de vida completo

```
Alta de cliente
  → clientes.ultima_actividad = NOW()  [DEFAULT en migration]
  → clientes.anonimizado_en = NULL

Nuevo pedido (cualquiera)
  → trigger trg_pedidos_ultima_actividad
  → UPDATE clientes SET ultima_actividad = NOW()

... (5 años sin actividad) ...

Vercel Cron mensual (día 1, 03:00 UTC)
  → GET /api/cron/rgpd-purge
  → UPDATE clientes SET nombre='ANONIMIZADO', email=NULL, telefono=NULL,
                        anonimizado_en=NOW()
     WHERE anonimizado_en IS NULL
       AND ultima_actividad < NOW() - 5 años

(En cualquier momento) Derecho al olvido
  → POST /api/admin/rgpd/anonimizar-cliente { clienteId }
  → Mismo efecto que el cron, pero inmediato y por cliente individual
```

---

## Alta de cliente

Cuando un usuario introduce sus datos en el carrito o en cualquier formulario de pedido, se crea un registro en `clientes`:

- `nombre`, `email`, `telefono` — datos personales identificables (PII)
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

Esto garantiza que el reloj de retención siempre parte del **último pedido**, no del alta. Un cliente registrado hace 6 años que pidió hace 2 NO será anonimizado.

**Nota:** Cambios de perfil (email, dirección) sin pedido asociado no actualizan `ultima_actividad`. Esto es correcto — la actividad comercial relevante para RGPD es el pedido.

---

## Purga automática (Vercel Cron)

**Mecanismo:** Vercel Cron (no pg_cron — no disponible en plan Free de Supabase).

| Parámetro | Valor |
|---|---|
| Endpoint | `GET /api/cron/rgpd-purge` |
| Frecuencia | Mensual — día 1 a las 03:00 UTC (`0 3 1 * *`) |
| Autenticación | `Authorization: Bearer {CRON_SECRET}` |
| Plazo | 5 años de inactividad (alineado con Art.66 LGT) |

**Configuración requerida en Vercel:**
- `CRON_SECRET` → Settings → Environment Variables

**Qué hace:**
```ts
UPDATE clientes
SET nombre = 'ANONIMIZADO', email = NULL, telefono = NULL, anonimizado_en = NOW()
WHERE anonimizado_en IS NULL
  AND ultima_actividad < NOW() - 5 años
```

Los pedidos y cobros vinculados se conservan íntegros (obligación fiscal LGT). Solo se elimina la información personal identificable.

**Respuesta del endpoint:**
```json
{ "anonymized": 3 }
```

**Archivos:**
- `src/app/api/cron/rgpd-purge/route.ts`
- `src/core/application/use-cases/rgpd/purge-expired-clientes.use-case.ts`
- `vercel.json`

---

## Derecho de supresión (Art. 17 RGPD)

Cuando un cliente solicita la eliminación de sus datos, el admin ejecuta la anonimización manual:

```
POST /api/admin/rgpd/anonimizar-cliente
Authorization: admin/superadmin token
Body: { "clienteId": "uuid" }
```

**Efecto:**
- `nombre` → `'ANONIMIZADO'`
- `email` → `NULL`
- `telefono` → `NULL`
- `anonimizado_en` → timestamp actual

**Garantías:**
- **Idempotente** — segunda llamada devuelve 200 sin modificar datos (el UPDATE filtra `IS NULL anonimizado_en`)
- **Integridad referencial** — `id` y FKs con `pedidos` se preservan. Los registros fiscales no se alteran.
- **Acceso restringido** — solo roles `admin` y `superadmin`

**Archivos:**
- `src/app/api/admin/rgpd/anonimizar-cliente/route.ts`
- `src/core/application/use-cases/rgpd/anonimizar-cliente.use-case.ts`

---

## Qué datos SE CONSERVAN (obligación fiscal)

Los siguientes datos **nunca se borran**, aunque el cliente sea anonimizado:

| Tabla | Por qué se conserva |
|---|---|
| `pedidos` | Historial de ventas — Art.66 LGT |
| `tpv_cobros` | Registros fiscales — RD 1619/2012. DELETE bloqueado por trigger. |
| `tpv_turnos` | Turnos Z — Ley 11/2021. DELETE bloqueado por trigger. |

Tras la anonimización, un cobro queda como: _"Pedido #1234 — Cliente: ANONIMIZADO — Total: 45,20€"_ — útil para Hacienda, sin exponer a la persona.

---

## Preguntas frecuentes

**¿El cron mensual no viola el RGPD si un cliente lleva 5 años y 1 mes sin actividad?**
No. El RGPD no exige anonimización exacta al día. Un margen de ~30 días sobre un período de 5 años (1.826 días) es jurídicamente irrelevante. Lo que importa es tener el mecanismo implementado y funcionando.

**¿Qué pasa si un cliente se crea pero nunca hace un pedido?**
`ultima_actividad = created_at`. El cron lo anonimizará tras 5 años desde el alta.

**¿Puede el admin borrar un cliente completamente?**
Sí, existe `DELETE /api/admin/clientes/[id]` en el repositorio, pero no está expuesto en ningún endpoint de admin por defecto. La anonimización es el camino recomendado porque preserva la integridad referencial con `pedidos`.
