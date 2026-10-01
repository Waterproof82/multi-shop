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
Debajo de la tabla de empresas (`src/app/superadmin/seccion-legal.tsx`). Por empresa: interruptor de TPV y el resumen derivado (`resumenLegalEmpresa`): quién factura (y modo VeriFactu), registro de jornada y plazo de anonimización de clientes. Desactivar el TPV pide confirmación y avisa de que es irreversible para los clientes de más de 3 años sin actividad; activarlo se guarda directo; si el guardado falla, el interruptor vuelve a su estado y se avisa. Detalle completo en `tpv-por-tenant.md`.

### Banner flotante en modo superadmin
- Componente `src/components/superadmin-banner.tsx`, montado desde `src/app/admin/(protected)/layout.tsx`
- Banner fixed con z-index alto
- Muestra empresa actual y botón "Volver al panel"
