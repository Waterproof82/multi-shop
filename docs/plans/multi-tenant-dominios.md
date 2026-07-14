# Plan: Estrategia de dominios multi-tenant

## Casos cubiertos actualmente

### 1. Empresa con dominio propio
- URL: `sudominio.com`
- La empresa registra su dominio en Vercel y en Supabase `empresas.dominio = 'sudominio.com'`
- Estado: **ya funciona**

### 2. Empresa con dominio propio, solo pedidos online
- URL: `pedidos.sudominio.com`
- La empresa añade un registro CNAME en su DNS: `pedidos → cname.vercel-dns.com`
- Se añade `pedidos.sudominio.com` en Vercel
- En Supabase `empresas.dominio = 'sudominio.com'` (sin cambios)
- El sistema detecta el prefijo `pedidos.` y resuelve la empresa por el dominio base automáticamente (`parseMainDomain` + fallback en `findByDomainPublic`)
- No afecta en absoluto a la web principal de la empresa
- Estado: **ya funciona**

### 3. Empresa sin dominio propio
- URL: `<slug>.digitalizatenerife.es`
- La empresa no necesita contratar hosting ni configurar nada
- Se usa el dominio base propio con un wildcard DNS
- Estado: **implementado**

## Implementación (caso 3)

### Código implementado
- `src/lib/domain-utils.ts` — `isBaseDomain(domain)` y `extractSlugFromBaseDomain(domain)`
- `src/core/infrastructure/database/supabase-empresa.repository.ts` — fallback por `slug` en `findByDomainPublic` y `findByDomain`

### Variable de entorno
El dominio base se configura con `BASE_DOMAIN` (sin prefijo `NEXT_PUBLIC_`, solo server-side).
Si no está definida, usa `digitalizatenerife.es` como fallback.

### Para cambiar el dominio base (futuro)
1. Cambiar `BASE_DOMAIN=tunuevodominio.com` en Vercel (Settings → Environment Variables) y en `.env.local`
2. Actualizar el registro DNS wildcard: `*.tunuevodominio.com → cname.vercel-dns.com`
3. Actualizar el dominio wildcard en Vercel (Settings → Domains): reemplazar `*.digitalizatenerife.es` por `*.tunuevodominio.com`
4. No se toca ningún archivo de código

### Configuración por empresa
- Solo requiere que `empresas.slug` esté relleno en Supabase
- No requiere `empresas.dominio`

### Infraestructura pendiente (fuera del código)
1. Añadir registro DNS wildcard: `*.digitalizatenerife.es → cname.vercel-dns.com`
2. Añadir `*.digitalizatenerife.es` como dominio wildcard en Vercel

## Notas
- Los tres casos son completamente compatibles entre sí y no interfieren
- `digitalizatenerife.es` (apex) y `www.digitalizatenerife.es` no se ven afectados por el wildcard DNS
- El wildcard solo actúa cuando no existe un registro más específico
