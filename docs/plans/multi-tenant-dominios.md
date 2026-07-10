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

### 3. Empresa sin dominio propio (pendiente)
- URL: `<slug>.digitalizatenerife.es`
- La empresa no necesita contratar hosting ni configurar nada
- Se usa el dominio base propio `digitalizatenerife.es` con un wildcard DNS
- Estado: **pendiente de implementar**

## Plan de implementación (caso 3)

### Infraestructura
1. Añadir registro DNS wildcard: `*.digitalizatenerife.es → cname.vercel-dns.com`
2. Añadir `*.digitalizatenerife.es` como dominio wildcard en Vercel

### Código
Cambio mínimo en `src/core/infrastructure/database/supabase-empresa.repository.ts`:
- En `findByDomainPublic` y `findByDomain`, detectar si el host entrante es `*.digitalizatenerife.es`
- Extraer el slug del subdominio
- Hacer `WHERE slug = <slug>` en lugar de `WHERE dominio = <domain>`

Cambio de soporte en `src/lib/domain-utils.ts`:
- Añadir `isBaseDomain(domain)` para detectar `*.digitalizatenerife.es`
- Añadir `extractSlugFromBaseDomain(domain)` para extraer el slug

### Configuración por empresa
- Solo requiere que `empresas.slug` esté relleno en Supabase
- No requiere `empresas.dominio`

## Notas
- Los tres casos son completamente compatibles entre sí y no interfieren
- `digitalizatenerife.es` (apex) y `www.digitalizatenerife.es` no se ven afectados por el wildcard DNS
- El wildcard solo actúa cuando no existe un registro más específico
