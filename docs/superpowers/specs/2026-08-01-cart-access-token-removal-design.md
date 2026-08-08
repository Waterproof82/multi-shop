# Cart Access Token — Eliminación del flujo legacy

## Contexto

Un audit de seguridad anterior (`e4f448f`, 26 marzo 2026) dejó pendiente en
`docs/context/security.md` — tabla "Pendientes conocidos" — el ítem *"Cart
token generación con `jti`"*: el proxy valida `aud: 'cart-access'` y llama
`isTokenRevoked(jti)` si el claim está presente, pero nada en el repo genera
ese token.

Investigación (ver `git log`, hallazgos completos en la conversación que
originó este spec):

1. El generador original era `scripts/generate-token.ts`, una herramienta de
   **desarrollo local** (`dfcf829`) — se corría a mano para generar un link
   `http://localhost:3000/?access=<jwt>` válido 1 minuto y así desbloquear el
   carrito en local. Nunca fue un endpoint ni una feature de cara al cliente.
2. Ese script se borró en `625883d` ("Remove obsolete files and scripts
   folder"), casi 3 semanas **antes** del audit que dejó el pendiente.
3. El audit de `e4f448f` hardeneó la verificación (`isTokenRevoked(jti)`) de
   un mecanismo cuyo único generador ya no existía.
4. `docs/context/cart_flow.md` confirma que el propósito original de este
   token — controlar la visibilidad del carrito — fue reemplazado por
   detección de subdominio (`isPedidosSubdomain`), que es el mecanismo activo
   hoy.
5. Búsqueda exhaustiva en todo el repo (`src/`, `e2e/`, `scripts/`,
   `supabase/`, docs) confirma cero consumidores: nadie lee la cookie
   `access_token`, ningún test lo cubre, no aparece en Electron ni Capacitor.

Conclusión: no es un pendiente a terminar de implementar — es código muerto
que un audit blindó en lugar de eliminar. Se decidió eliminarlo en vez de
completar la generación (no hay caso de uso real detrás).

Nota aparte (para no perder el hilo): el sistema de pedidos por mesa vía QR
(`docs/context/mesa-ordering.md`) sí usa un token de sesión activo y en uso
(`MesaClientTokenUseCase`), pero es un token opaco validado contra Supabase,
no un JWT — no tiene relación con este flujo y no se toca en este cambio.

## Alcance

Eliminación quirúrgica, sin lógica nueva. Dos archivos de código, tres de
documentación.

## Cambios

### Código

- **`src/proxy.ts`**
  - Eliminar la función `handleCartAccessToken` completa.
  - Eliminar el bloque que la invoca:
    ```ts
    const accessToken = url.searchParams.get('access');
    if (accessToken) {
      return handleCartAccessToken(url, accessToken);
    }
    ```
  - Un `?access=` que llegue de ahora en más se ignora — query string sin
    efecto, como cualquier param desconocido. No requiere redirect ni 410.

- **`src/core/infrastructure/env-validation.ts`**
  - Eliminar la entrada `{ name: 'CART_TOKEN_SECRET', required: true }`.
  - Efecto: un deploy sin esa var en Vercel deja de fallar por
    env-validation (hoy fallaría con 500, aunque nada la usa).

### Documentación

- **`docs/context/security.md`**
  - Quitar la fila `CART_TOKEN_SECRET` de las dos tablas de env vars
    (líneas ~402 y ~893).
  - Quitar la sección completa "## Cart Access Token" (~793-807).
  - Quitar la fila "Cart token generación con `jti`" de "Pendientes
    conocidos" (~1172).

- **`docs/context/cart_flow.md`**
  - Reemplazar la sección "## Legacy: Token JWT de Acceso" — de "aún
    soportado" a "eliminado en [fecha], ver
    `docs/superpowers/specs/2026-08-01-cart-access-token-removal-design.md`
    para el historial completo".

- **`README.md`**
  - Quitar la línea `CART_TOKEN_SECRET=` del bloque de env vars de ejemplo
    (línea 345).

## Fuera de alcance

- El módulo `token-revocation.ts` (`isTokenRevoked`) se mantiene intacto —
  lo usan `auth-admin.use-case.ts` e `inspector-token.ts`, ambos activos.
- El sistema de tokens de mesa (`MesaClientTokenUseCase`) no se toca.
- No se borra `CART_TOKEN_SECRET` de Vercel automáticamente — recordatorio
  manual al usuario al cerrar el cambio.

## Adenda (post-implementación)

La verificación final (Task 4) encontró que `.env.example` también tenía una
línea `CART_TOKEN_SECRET=...` que este documento no había inventariado. Se
eliminó en un commit de seguimiento (`chore(env): remove unused
CART_TOKEN_SECRET from .env.example`). La lista de archivos en "Cambios" de
este spec no era exhaustiva — quedó afuera un archivo real.

## Testing

No existen tests que cubran este flujo (confirmado por búsqueda en `e2e/`),
así que no hay nada que actualizar ahí. Verificación:

- `pnpm lint && pnpm build` (regla del proyecto) tras el cambio.
- Confirmación manual de que el proxy sigue respondiendo normalmente en
  rutas no afectadas (no hace falta un test dedicado para una remoción sin
  consumidores).

## Riesgo

Bajo. Cero consumidores confirmados. Único costo: si `CART_TOKEN_SECRET`
sigue en Vercel tras este cambio, queda huérfana hasta que el usuario la
borre manualmente (recordatorio pendiente, no bloqueante).
