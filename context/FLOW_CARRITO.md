# Documentación del Flujo de Acceso al Carrito

Este documento describe el mecanismo de seguridad implementado para ocultar y mostrar la funcionalidad del carrito de compras mediante **tokens JWT** y **cookies HttpOnly**.

## 🎯 Objetivo
El carrito de compras y los botones de "Añadir" deben estar ocultos para el público general. Solo los usuarios con un enlace de acceso válido pueden interactuar con las funciones de compra.

## 🔄 Flujo Completo

### 1. Generación del Enlace Seguro
El administrador genera un enlace que contiene un token JWT firmado.
- **Script:** `scripts/generate-token.ts`
- **Expiración del Token:** 2 horas (configurable).
- **Formato URL:** `https://tudominio.com/?access=TOKEN_JWT`

### 2. Interceptación (Middleware)
Cuando el usuario accede al enlace, el archivo `src/middleware.ts` intercepta la petición antes de que cargue la página.

1.  **Detección:** Busca el parámetro `?access=...` en la URL.
2.  **Sanitización:** Limpia el token de caracteres extraños (ej. paréntesis al final) para evitar errores de copiado.
3.  **Verificación:** Valida la firma del token usando `ACCESS_TOKEN_SECRET`.
4.  **Acción (Éxito):**
    *   Crea una cookie llamada `cart_authorized` con valor `true`.
    *   **Configuración Cookie:** `HttpOnly`, `Secure` (prod), `SameSite=Lax`, Duración 15 minutos.
    *   Redirige a la misma URL **sin** el parámetro `access` (URL limpia).
5.  **Acción (Fallo):**
    *   Redirige a la URL limpia sin crear la cookie.

### 3. Renderizado del Servidor (SSR)
En `src/app/page.tsx`:
1.  El servidor lee las cookies entrantes.
2.  Verifica si existe `cart_authorized === 'true'`.
3.  Pasa una prop `showCart={true/false}` al componente cliente `MenuPage`.

### 4. Interfaz de Usuario (Cliente)
En `src/components/menu-section.tsx` y `client-menu-page.tsx`:
- **Si `showCart` es false:**
    - El botón flotante del carrito no se renderiza.
    - Los botones "Añadir al carrito" en cada producto están ocultos.
    - La interacción (clic) con las tarjetas de producto está deshabilitada.
- **Si `showCart` es true:**
    - Se muestra la interfaz de compra completa.

---

## 🛠️ Configuración Técnica

### Variables de Entorno (.env.local)
```bash
# Clave secreta para firmar y verificar tokens
ACCESS_TOKEN_SECRET="TuClaveSuperSecreta..."
```

### Comandos Útiles

**Generar un nuevo token de acceso:**
```bash
npx tsx scripts/generate-token.ts
```

**Limpiar acceso (Pruebas):**
Para "cerrar sesión" o probar el estado sin carrito, abre las herramientas de desarrollador del navegador (F12) -> Application -> Cookies y elimina `cart_authorized`.

## 🔒 Seguridad
- **HttpOnly:** La cookie no puede ser leída ni modificada por JavaScript del lado del cliente (protección XSS).
- **Secure:** En producción, la cookie solo se envía sobre HTTPS.
- **JWT:** Garantiza que el acceso no ha sido falsificado sin conocer la clave secreta del servidor.
