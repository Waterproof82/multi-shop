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

### Banner flotante en modo superadmin
- Componente `src/components/superadmin-banner.tsx`, montado desde `src/app/admin/(protected)/layout.tsx`
- Banner fixed con z-index alto
- Muestra empresa actual y botón "Volver al panel"
