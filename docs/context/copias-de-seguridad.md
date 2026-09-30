# Copias de seguridad

> Estado a 2026-09-30: **copia completa ACTIVA**. Primera ejecución correcta (run 36734722312): volcado de 94 tablas, 796 KB cifrado, subido a `db/daily/2026-09-30` y `db/monthly/2026-09`. **Restauración verificada** el mismo día con el simulacro (run 36763385954): 62 tablas, 72 funciones, 190 políticas RLS, 0 tablas sin RLS, trigger fiscal presente, 220 pedidos, smoke OK. Se repite solo cada mes (`db-restore-drill.yml`).
>
> La passphrase está en `.env.local` (`BACKUP_ENCRYPTION_PASSPHRASE`) y en GitHub. Debe estar TAMBIÉN en un gestor de contraseñas: si se pierde el equipo, sin ella las copias son irrecuperables.

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

### Simulacro mensual de restauración — `.github/workflows/db-restore-drill.yml`

- **Qué:** el día 3 de cada mes descarga la última copia, la descifra y la restaura en un contenedor `supabase/postgres` de la MISMA versión que producción (actualizar el tag si Supabase sube la versión: `supabase projects list`).
- **Verifica:** nº de tablas/funciones/políticas, que NINGUNA tabla de `public` quede sin RLS, el trigger `pedidos_no_delete`, filas en `empresas`, usuarios de Auth dentro de la copia, y `supabase/tests/smoke-db-functions.sql`. Resumen en la pestaña Summary del run.
- **Límite conocido:** los esquemas de Supabase (`auth`, `storage`...) NO se cargan en el simulacro: sus tablas las migran los servicios de Supabase (GoTrue, Storage API) y en un Postgres "pelado" les faltan columnas (`auth.audit_log_entries.ip_address`). Se CUENTAN sus filas dentro de la copia. En una restauración real a un proyecto de Supabase sí se cargan, porque esos servicios ya han migrado su esquema.
- **Filtros:** `.github/scripts/backup/*.awk` (en ficheros a propósito: los escapes de `\.` dentro de YAML+shell+awk son frágiles).
- Los datos restaurados viven solo en el runner efímero; el log solo muestra recuentos.

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

### Lecciones de la puesta en marcha (2026-09-30)

- **"password authentication failed for user postgres"** con la cadena bien formada = la contraseña guardada no es la actual. En Supabase, *Generate* solo propone una contraseña: no se aplica hasta pulsar **Reset password**. El `user "postgres"` del mensaje es cómo lo reporta el pooler, no un fallo del usuario `postgres.<ref>`.
- El job valida la forma de `SUPABASE_DB_URL` (sin imprimir la contraseña) y prueba la conexión con `psql` ANTES del volcado: si falla `psql`, el problema es la cadena/contraseña; si falla solo el volcado, es el CLI.
- `supabase db dump` descarga una imagen Docker de `ghcr.io`; puede dar `toomanyrequests: Data limit exceeded`. El CLI reintenta y en la primera ejecución bastó. Si se vuelve habitual: instalar `postgresql-client-17` (PGDG) y usar `pg_dump`/`pg_dumpall` directamente.
- En `.env.local` y `.env`, `R2_BACKUP_BUCKET_NAME` tenía un espacio final que el SDK rechaza (`InvalidBucketName`). Recortar SIEMPRE los valores al leerlos.

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

- [x] Secretos configurados y primera ejecución de `db-backup.yml` en verde (2026-09-30).
- [x] Descarga + descifrado verificados (2026-09-30).
- [x] Restauración probada (2026-09-30, simulacro) y repetida automáticamente cada mes.
- [ ] Restauración de `auth` a un proyecto de Supabase real: solo se puede probar con un segundo proyecto. Hacerlo una vez antes de tener tenants que dependan del acceso admin.
- [x] Borradas de R2 las copias de catálogo anteriores al 2026-09-30 (143 objetos con credenciales en claro).
- [ ] Telegram de avisos: falta el secreto `OPS_TELEGRAM_CHAT_ID` (el bot ya está configurado).
- [x] Passphrase guardada en un gestor de contraseñas (2026-09-30).
- [ ] Valorar Supabase Pro (copias diarias propias 7 días) o PITR si el volumen de pedidos lo justifica. NO sustituye a `db-backup.yml`: 7 días no cubren la conservación legal.
- [ ] Ciclo de vida del bucket R2 revisado (que ninguna regla borre `db/monthly/` antes de 6 años).
- [x] "Copias de seguridad" mencionadas en `/privacidad` (sección Seguridad, con el bloqueo de datos suprimidos, art. 32 LOPDGDD) y cláusula 3.1 del DPA vigente (2026-09-30).
