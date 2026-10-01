# Panel Superadmin

> Superadmin = rol global con `empresaId` null. Gestiona cualquier tenant "entrando" en su panel de admin mediante una cookie de contexto.

### Archivos clave
- `src/app/superadmin/page.tsx` - Dashboard con lista de empresas y estadísticas globales
- `src/app/superadmin/layout.tsx` - Layout autenticado (verifica rol superadmin)
- `src/app/api/superadmin/switch-empresa/route.ts` - Establece cookie y redirige
- `src/app/api/superadmin/empresas/route.ts` - Lista empresas con stats
- `src/core/application/use-cases/superadmin.use-case.ts` - Lógica de negocio
- `src/core/domain/repositories/ISuperAdminRepository.ts` - Interfaz del repositorio
- `src/core/infrastructure/database/SupabaseSuperAdminRepository.ts` - Implementación

### Flujo de edición de empresa
1. Superadmin hace click en "Editar" en `/superadmin`
2. Llama a `/api/superadmin/switch-empresa?empresaId=xxx`
3. La API:
   - Verifica JWT (proxy valida token + rol superadmin)
   - Establece cookie `superadmin_empresa_id` con expiry 1 hora
   - Redirige a `/admin`
4. El layout de admin:
   - Detecta que es superadmin (cookie presente)
   - Lee empresa de la cookie
   - Pasa `overrideEmpresaId` al AdminProvider
5. Las páginas de admin usan `effectiveEmpresaId` para todas las operaciones
6. Las APIs aceptan `empresaId` como query param para superadmin

### Cambios en APIs para soportar superadmin
- `requireAuth()` retorna `isSuperAdmin` flag
- `requireRole()` acepta `['admin', 'superadmin']`
- **APIs que soportan superadmin:**
  - `/api/admin/empresa` - GET/PUT requieren `empresaId` query param
  - `/api/admin/upload-image` - POST requiere `empresaId` query param
  - `/api/admin/productos` - GET/POST/PUT/DELETE requieren `empresaId` query param
  - `/api/admin/categorias`, `/api/admin/clientes`, etc. - similarly

### Interruptores de producto — solo superadmin
`PUT /api/superadmin/empresas/[id]` valida con `superadminUpdateEmpresaSchema`; `/api/admin/empresa` (admin de tenant) con `updateEmpresaSchema`, que NO contiene: `tpv_habilitado`, `tipo`, `delivery_habilitado`, `mesas_habilitadas`, `pagos_mesa_habilitados`, `pagos_pickup_habilitados`, `validacion_pedidos_habilitada`. Hasta el 2026-10-01 los seis últimos estaban en el esquema compartido y un tenant podía cambiarlos con una petición a mano. Un interruptor de producto nuevo va SIEMPRE en el esquema del superadmin (test `tpv-habilitado-solo-superadmin.test.ts`).

### Sección "Cumplimiento legal"
Columna "TPV" de la tabla de empresas (`src/app/superadmin/interruptor-tpv.tsx`). Cambiarlo en CUALQUIER sentido abre un diálogo con el resumen derivado tras el cambio (`resumenLegalEmpresa`): quién factura (y modo VeriFactu), registro de jornada y plazo de anonimización de clientes; al desactivar añade el aviso irreversible (clientes de más de 3 años sin actividad). Nada se guarda sin confirmar; si el guardado falla, el interruptor vuelve a su estado y se avisa. Debajo de la tabla, una nota genérica (`nota-legal.tsx`). Columnas Mesas / Pagos Mesa / Validación se ocultan si ninguna empresa es restaurante. "Activar pagos" = `pagos_pickup_habilitados` (cobro online por Redsys de los pedidos web). Detalle completo en `tpv-por-tenant.md`.

### Tabla de empresas — columnas
- Las columnas que solo aplican a restaurante (Mesas, Pagos Mesa, Validación, TGTG validados) se ocultan si ninguna empresa es restaurante. Si las hay, en las filas de tienda muestran "—" (`NoAplica`). El `tipo` vive en `EmpresasTable` (no en la fila) para que las columnas reaparezcan al cambiar una empresa a restaurante sin recargar.
- "Activar pagos · online · Redsys" = `pagos_pickup_habilitados`: decide si los pedidos web pasan por la pasarela (`pasaPorPasarela`). No tiene que ver solo con la recogida, aunque el nombre de la columna lo sugiera.
- Se quitó la columna "Clientes" (el total sigue en las tarjetas de arriba).

### Reset de empresas de prueba
- Botón "Resetear datos de prueba" en la celda de Acciones (`reset-prueba.tsx`), visible solo si `empresas.es_prueba`. Para confirmar hay que escribir el nombre exacto de la empresa.
- `POST /api/superadmin/empresas/[id]/reset-prueba` → `SuperAdminUseCase.resetEmpresaPrueba` → RPC `reset_empresa_prueba(empresa_id, actor)` (migración `20261001000002`). Borra pedidos, cobros del TPV (la cadena entera), turnos y sus eventos, y clientes. Conserva catálogo, fotos, landing, configuración, mesas, empleados y fichajes.
- **La autorización real está en la BD:** la función rechaza empresas sin `es_prueba` o con `verifactu_mode = 'verifactu'`, y los triggers de bloqueo de DELETE solo dejan pasar filas de empresas de prueba. `es_prueba` es inmutable y no está en ningún DTO (test `empresa-es-prueba-no-expuesto.test.ts`). Para marcar una empresa nueva como prueba: fijarlo en el INSERT o en una migración con su id.
- **Los fichajes NO se borran en el reset** (decisión del 2026-10-01): La Casa de la Batería conserva 42 fichajes de prueba (24/07–10/08/2026, pruebas de LaborControl). Por eso en "Conservación de datos" aparece el apartado Fichajes en una empresa ya reseteada: no es un fallo. Incluirlos es una tarea pendiente y exige comprobar antes si la cadena de `lc_fichajes` es por empresa o global (`chain_seq` usa una secuencia global, y además están `lc_chain_anchors` y `lc_audit_log`, ambos inmutables). Si es global, borrar los fichajes de una empresa rompería la verificación de integridad de las demás.
- Cada reset queda en `empresas_prueba_reset_log` (solo inserción; `reseteado_por` = `superadmin:<x-admin-id>`).
- **Trampa:** `handleResult` responde con los datos SIN envolver (`{ pedidos, ... }`, no `{ data }`). La primera versión del botón leía `body.data` y mostraba "No se pudo resetear" tras un reset que SÍ se había hecho.

### Conservación de datos
Debajo de la nota legal, un desplegable por empresa con la cuenta atrás de cada apartado y ejercicio (`conservacion-superadmin.tsx`). Sin descargas: el superadmin entra con "Editar" y descarga desde `/admin/conservacion`. Detalle en `conservacion-datos.md`.

### Banner flotante en modo superadmin
- Componente `src/components/superadmin-banner.tsx`, montado desde `src/app/admin/(protected)/layout.tsx`
- Banner fixed con z-index alto
- Muestra empresa actual y botón "Volver al panel"
