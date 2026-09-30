# Copias de seguridad

> Estado a 2026-09-30. **La copia completa (`db-backup.yml`) está escrita pero NO ACTIVA hasta configurar sus secretos** (ver "Puesta en marcha"). Hasta entonces, la única copia existente es la del catálogo, que NO cubre pedidos, cobros, clientes ni fichajes.

## Por qué importa

Supabase en plan **Free no guarda copias propias** (verificado con `pnpm exec supabase backups list --project-ref ugvjrlmoerhvwsqozqfh` → `"backups": []`, `"pitr_enabled": false`). Si una migración, un bug o un borrado corrompe datos, sin copia propia no hay forma de recuperarlos.

Obligaciones que dependen de poder restaurar:

| Datos | Obligación | Plazo |
|---|---|---|
| Pedidos / ventas de cualquier tenant | Conservación de documentación mercantil (art. 30 Código de Comercio) y prescripción tributaria (LGT) | 6 años / 4-5 años |
| Registros de facturación y cadena de hashes (si el sistema EMITE el ticket/factura) | RD 1007/2023 (VeriFactu) — inalterabilidad y conservación | Mientras dure la prescripción |
| Fichajes (LaborControl) | Art. 34.9 ET (RD-Ley 8/2019) | 4 años |
| Clientes | RGPD art. 32.1.c: capacidad de restaurar la disponibilidad tras un incidente | — |

VeriFactu no aplica solo al TPV: aplica a cualquier sistema que EMITA facturas o tickets. Una tienda que factura con su propio programa y solo usa nuestra web para vender no está en su ámbito; pero sus pedidos siguen sujetos a la conservación mercantil. Por eso la copia completa es para TODOS los tenants.

## Las dos copias

### 1. Copia completa de la BD — `.github/workflows/db-backup.yml`

- **Qué:** `supabase db dump` → `roles.sql` + `schema.sql` + `data.sql` (toda la BD: pedidos, cobros, clientes, fichajes, auditoría...).
- **Cómo:** tar.gz cifrado con `gpg --symmetric --cipher-algo AES256` → R2.
- **Dónde:** `s3://$R2_BACKUP_BUCKET_NAME/db/daily/YYYY-MM-DD.tar.gz.gpg` y `db/monthly/YYYY-MM.tar.gz.gpg`.
- **Retención:** diarias 30 días; mensual (la primera copia de cada mes) 72 meses.
- **Cuándo:** 02:30 UTC diario (GitHub puede retrasar u OMITIR ejecuciones programadas — pasó el 2026-09-28 con la otra copia).
- **Salvaguardas:** falla si el volcado sale vacío o sin la tabla `pedidos`; avisa por Telegram si falla o si al arrancar no encuentra la copia de ayer.

### 2. Copia del catálogo por tenant — `.github/workflows/tenant-backup.yml` → Edge Function `tenant-backup`

- **Qué:** por empresa, JSON con `empresas` (SIN `redsys_secret_key`, `glovo_private_key`, `waiter_pin_hash`), `categorias`, `productos`, `mesas`, `ingredientes`, `empleados_tpv`, `receta_items`.
- **Dónde:** `backups/{slug}/YYYY-MM-DD.json`, sin cifrar.
- **Para qué:** deshacer cambios de catálogo desde el admin (`POST /api/admin/backup/restore`). **No sirve para un desastre.**
- **No incluye:** complementos, menús virtuales, modalidades de entrega, textos legales, landing, promociones.
- **Pendiente conocido:** `empleados_tpv.pin_hash` sí va en la copia (sin él, restaurar un empleado borrado fallaría). Un PIN corto es recuperable por fuerza bruta a partir del hash: el bucket DEBE seguir siendo privado. Solución completa: cifrar también esta copia.
- **Copias anteriores al 2026-09-30** contienen las credenciales de pago de `empresas` en texto plano. Borrarlas de R2 (o rotar las credenciales) antes de meter tenants reales.

## Puesta en marcha de la copia completa

En GitHub → Settings → Secrets and variables → Actions:

| Tipo | Nombre | Valor |
|---|---|---|
| Secret | `SUPABASE_DB_URL` | Cadena de conexión del **Session pooler** (Supabase → Connect → Session pooler; los runners de GitHub no tienen IPv6 y la conexión directa falla) |
| Secret | `BACKUP_ENCRYPTION_PASSPHRASE` | `openssl rand -base64 48`. **Guardarla FUERA de GitHub (gestor de contraseñas).** Sin ella las copias son irrecuperables |
| Secret | `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | Token de R2 con escritura en el bucket de backups |
| Variable | `R2_ENDPOINT` | `https://<account_id>.r2.cloudflarestorage.com` |
| Variable | `R2_BACKUP_BUCKET_NAME` | El mismo bucket que usa `tenant-backup` |
| Secret (opcional) | `TELEGRAM_BOT_TOKEN` / `OPS_TELEGRAM_CHAT_ID` | Avisos de fallo y de copia omitida |

Después: Actions → "DB Backup" → Run workflow, y **probar una restauración** (abajo). Una copia que nunca se ha restaurado no es una copia.

## Restaurar

```bash
aws s3 cp s3://$BUCKET/db/daily/2026-10-01.tar.gz.gpg . --endpoint-url $R2_ENDPOINT
gpg --decrypt 2026-10-01.tar.gz.gpg | tar -xz        # pide la passphrase
psql --single-transaction --variable ON_ERROR_STOP=1 \
  --file roles.sql --file schema.sql \
  --command 'SET session_replication_role = replica' \
  --file data.sql \
  --dbname "$URL_DE_UN_PROYECTO_NUEVO"
```

- Restaurar SIEMPRE en un proyecto nuevo o de pruebas, nunca encima de producción.
- `session_replication_role = replica` desactiva triggers durante la carga: imprescindible porque `pedidos_no_delete`, `pedidos_es_prueba_inmutable` y la cadena de hashes rechazarían la reinserción.
- Tras restaurar: `pnpm db:smoke` contra el proyecto restaurado.

## Cuando haya tenants en producción (checklist)

- [ ] Secretos configurados y primera ejecución de `db-backup.yml` en verde.
- [ ] Restauración probada en un proyecto de pruebas; repetir cada trimestre.
- [ ] Borradas de R2 las copias de catálogo anteriores al 2026-09-30 (llevan credenciales en claro).
- [ ] Telegram de avisos configurado.
- [ ] Valorar Supabase Pro (copias diarias propias 7 días) o PITR si el volumen de pedidos lo justifica. NO sustituye a `db-backup.yml`: 7 días no cubren la conservación legal.
- [ ] Ciclo de vida del bucket R2 revisado (que ninguna regla borre `db/monthly/` antes de 6 años).
- [ ] Solo entonces: mencionar "copias de seguridad" en `/privacidad` (sección Seguridad) y firmar DPAs con la cláusula 3.1 de `docs/legal/dpa-template.md`.
