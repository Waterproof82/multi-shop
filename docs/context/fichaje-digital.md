# Fichaje Digital — Registro de Jornada

> Art. 34.9 ET · RD-Ley 8/2019 · Cadena SHA-256 inmutable

---

## ¿Qué es un fichaje?

Un **fichaje** es un evento de jornada laboral registrado digitalmente. Cada vez que un empleado entra al trabajo, hace una pausa, retoma la actividad o sale, se genera un registro en la base de datos con:

- **Quién**: `empleado_id` + `actor_id` (la misma persona si ficha él mismo, distinto si lo registra un supervisor)
- **Qué**: `tipo` del evento (`entrada | salida | inicio_pausa | fin_pausa`)
- **Cuándo**: `timestamp_evento` (hora según el dispositivo) + `timestamp_servidor` (hora del servidor, fuente de verdad)
- **Huella**: `chain_hash` SHA-256 calculado automáticamente en la base de datos

---

## Ciclo de vida de un fichaje

```
Empleado introduce PIN en /tpv/fichajes (modo kiosk)
        ↓
POST /api/laborcontrol/fichaje/kiosk
  Fase 1 { pin }        → identifica empleado + tipo sugerido
  Fase 2 { pin, tipo }  → registra el fichaje
        ↓
RegistrarFichajeUseCase
  ├── Verifica perfil laboral activo
  ├── Lee último fichaje (para detectar orphans)
  └── SupabaseFichajeRepository.registrar()
        ↓
  BEFORE INSERT trigger (Postgres)
        ├── Obtiene chain_seq (secuencia global)
        ├── Lee prev_hash del último fichaje de la empresa
        ├── Calcula SHA-256 del payload canónico
        └── Escribe chain_hash + prev_hash en la fila
        ↓
IAuditRepository.insert() → lc_audit_log
```

---

## Tipos de evento

| `tipo` | Cuándo ocurre |
|--------|---------------|
| `entrada` | El empleado empieza su jornada |
| `salida` | El empleado termina su jornada |
| `inicio_pausa` | Comienza un descanso (comida, descanso reglamentario) |
| `fin_pausa` | Retoma la actividad tras la pausa |
| `correccion` | Un supervisor modifica o anula un fichaje anterior |

---

## Estado derivado (panel supervisor)

El estado actual de cada empleado se calcula a partir de su **último fichaje** (excluyendo correcciones):

| Último evento | Estado mostrado |
|---------------|-----------------|
| `entrada` ó `fin_pausa` | 🟢 En jornada |
| `inicio_pausa` | 🟡 En pausa |
| `salida` | ⚫ Fuera |
| Sin fichajes | — Sin datos |

El panel `/laborcontrol/supervisor` se actualiza en tiempo real vía Supabase Realtime (canal `postgres_changes` en `lc_fichajes`).

---

## Correcciones

Un supervisor (`admin` o `encargado`) puede corregir un fichaje erróneo:

- **Anular** (`accion: 'anular'`): el fichaje original se marca como superseded. Queda en la cadena pero visualmente aparece tachado como anulado.
- **Rectificar** (`accion: 'rectificar'`): se anula el original y se crea un nuevo registro con el timestamp correcto.

> El fichaje original **nunca se borra**. Borrar registros violaría el Art. 34.9 ET. La corrección es un evento adicional que referencia al original.

### Resolución de superseded

El campo `superseded` no existe en la base de datos. Se calcula en `ObtenerMisFichajesUseCase`:

```typescript
for (const f of fichajes) {
  if (f.tipo === 'correccion' && f.refCorreccion) {
    if (f.accion === 'anular')     annulledIds.add(f.refCorreccion);
    if (f.accion === 'rectificar') rectifiedIds.add(f.refCorreccion);
  }
}
// superseded = annulledIds.has(f.recordId) || rectifiedIds.has(f.recordId)
```

---

## La cadena de integridad

### ¿Por qué existe?

La ley exige que los registros sean **verídicos, fiables e inalterables**. Una base de datos relacional por sí sola permite a cualquier administrador con acceso borrar o editar filas. La cadena SHA-256 hace que cualquier manipulación sea **matemáticamente detectable**.

### ¿Cómo funciona?

Cada fichaje contiene el hash del anterior. Es como una lista encadenada donde romper cualquier eslabón invalida todos los posteriores.

```
Fichaje #1
  chain_hash = SHA-256("v1|chain_seq=1|empresa_id=X|empleado_id=Y|tipo=entrada|ts=T1|prev=GENESIS")
  prev_hash  = "GENESIS" (primer registro)

Fichaje #2
  chain_hash = SHA-256("v1|chain_seq=2|...|ts=T2|prev={chain_hash del #1}")
  prev_hash  = chain_hash del fichaje #1

Fichaje #3
  chain_hash = SHA-256("v1|chain_seq=3|...|ts=T3|prev={chain_hash del #2}")
  prev_hash  = chain_hash del fichaje #2
```

Si alguien modifica el `timestamp_evento` del fichaje #1, su `chain_hash` ya no coincide con el `prev_hash` del fichaje #2. La verificación lo detecta inmediatamente.

### Payload canónico

```
v1|chain_seq=N|empresa_id=UUID|empleado_id=UUID|tipo=TIPO|ts=ISO8601|prev=HASH_ANTERIOR
```

Este formato es idéntico en Postgres (`lc_canonical_payload()`) y en TypeScript (`src/lib/laborcontrol/chain-hash.ts`). Una herramienta de auditoría puede verificar la cadena desde ambos lados.

### Verificación

```
GET /api/laborcontrol/chain/verify?year=2026&month=7
Authorization: Bearer [admin token]

→ { "segment": "2026-07", "status": "ok", "totalRows": 247, "brokenAt": null }
```

Si hay manipulación: `{ "status": "tampered", "brokenAt": 183 }` — el `brokenAt` es el `chain_seq` del primer eslabón roto.

---

## Particionado mensual

`lc_fichajes` está particionada por `timestamp_servidor` en franjas mensuales:

```
lc_fichajes_2026_07  → julio 2026
lc_fichajes_2026_08  → agosto 2026
lc_fichajes_2026_09  → septiembre 2026
...
```

**Beneficios:**
- Queries por período enormemente más rápidas (solo lee la partición relevante)
- Purga de particiones antiguas sin afectar al resto (después del período legal de 4 años)
- Sellado mensual de anclas para verificación rápida sin recorrer toda la tabla

**Gestión automática (Vercel Cron):**
- Día 25 de cada mes a las 01:00 UTC → crea la partición del mes siguiente
- Día 2 de cada mes a las 02:00 UTC → sella los anclas del mes anterior

---

---

## Conservación legal

El Art. 34.9 ET exige conservar los registros de jornada durante **4 años**. La plataforma implementa:

- `lc_legal_holds`: retenciones manuales que bloquean cualquier purga para un empleado o empresa
- Offboarding suave: al eliminar un empleado con perfil laboral, sus fichajes se conservan (el perfil se desactiva, no se borra)
- Particiones con nombre por mes: permiten una purga quirúrgica en el futuro cuando expire el período legal

---

## Ruta de acceso por rol

| Rol | Puede hacer |
|-----|-------------|
| `cajero` / `encargado` / `admin` | Fichar desde `/tpv/fichajes` (modo kiosk por PIN) |
| `encargado` | Ver panel jornada (`/tpv/jornada`), registrar correcciones |
| `admin` | Todo lo anterior + exportar PDF/Excel + verificar cadena + gestionar holds |
| RLT | Vista de solo lectura en `/laborcontrol/rlt` |

---

## Archivos clave

| Archivo | Propósito |
|---------|-----------|
| `src/components/laborcontrol/FichajeDialog.tsx` | Modal de fichaje (online/offline) |
| `src/app/tpv/fichajes/page.tsx` | Vista "Mis fichajes" del empleado |
| `src/app/laborcontrol/supervisor/page.tsx` | Panel supervisor en tiempo real |
| `src/app/laborcontrol/rlt/page.tsx` | Vista RLT (solo lectura) |
| `src/lib/laborcontrol/offline-queue.ts` | Cola offline IndexedDB + AES-GCM |
| `src/lib/laborcontrol/chain-hash.ts` | Implementación TS del hash canónico |
| `src/core/laborcontrol/domain/types.ts` | Todos los tipos de dominio |
| `src/core/laborcontrol/infrastructure/SupabaseFichajeRepository.ts` | Acceso a DB |
| `supabase/migrations/20260724000002_lc_fichajes_chain.sql` | Trigger + tabla particionada |
