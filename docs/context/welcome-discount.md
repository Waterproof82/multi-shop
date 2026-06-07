# Welcome Discount - Sistema de Descuento de Bienvenida

## Overview

El sistema de descuento de bienvenida captura emails de nuevos visitantes después de 30 segundos de navegación y les envía un código de descuento único canjeable en el checkout.

## Flujo

1. **Popup**: Después de 30 segundos en el subdomain de pedidos, aparece un modal preguntando por el email
2. **Suscripción**: El usuario ingresa su email → se crea un código `BIENVENIDO-XXXXXX`
3. **Email**: Se envía un email con el código de descuento (porcentaje configurable)
4. **Canje**: En el carrito, el usuario ingresa código + email → se valida server-side
5. **Aplicación**: El descuento se aplica al total del pedido

## Base de Datos

### Tabla `empresas` (extensiones)
```sql
descuento_bienvenida_activo boolean NOT NULL DEFAULT false
descuento_bienvenida_porcentaje numeric(5,2) NOT NULL DEFAULT 5.00
descuento_bienvenida_duracion integer NOT NULL DEFAULT 30  -- días de validez del código
```

### Tabla `codigos_descuento` (nueva)
```sql
id uuid PRIMARY KEY
empresa_id uuid REFERENCES empresas(id)
cliente_email text
codigo text UNIQUE por empresa
porcentaje_descuento numeric(5,2)
fecha_expiracion timestamptz (calculado: NOW + empresa.descuento_bienvenida_duracion)
usado boolean DEFAULT false
pedido_id uuid REFERENCES pedidos(id)
created_at timestamptz
UNIQUE(empresa_id, codigo)
UNIQUE(empresa_id, cliente_email) -- un código por email por empresa
```

> **Nota**: `fecha_expiracion` se calcula en el momento de crear el código usando el valor de `descuento_bienvenida_duracion` configurado en la empresa. Por defecto 30 días si no se especifica.

### Tabla `pedidos` (extensiones)
```sql
codigo_descuento_id uuid REFERENCES codigos_descuento(id)
descuento_porcentaje numeric(5,2)
total_sin_descuento numeric(10,2)
```

## API Endpoints

### POST `/api/descuento/subscribe`
- **Público** (sin auth)
- Rate limit: 20/min
- Body: `{ email: string }`
- Resuelve empresa por dominio
- Valida que el feature esté activo
- Genera código único `BIENVENIDO-{6 chars}`
- Envía email via Brevo
- Retorna: `{ success: true }` o error

### POST `/api/descuento/validate`
- **Público** (sin auth)
- Rate limit: 20/min
- Body: `{ codigo: string, email: string }`
- Valida: código existe, no expirado, no usado, email coincide
- Retorna: `{ valid: boolean, porcentaje: number }`

### POST `/api/pedidos` (modificado)
- Ahora acepta `codigoDescuento?: string`
- **Requiere** email cuando se usa código
- Server-side valida código: expirado, usado, email coincide
- Guarda referencia en pedido + calcula descuento

## Códigos de Error

| Código | Significado |
|--------|-------------|
| DSC_001 | Email ya tiene código para esta empresa |
| DSC_002 | Código no encontrado |
| DSC_003 | Código expirado |
| DSC_004 | Código ya usado |
| DSC_005 | Email no coincide con código |
| DSC_006 | Feature no habilitado |

## Configuración Admin

En `/admin/configuracion`:
- Toggle para activar/desactivar
- Input numérico para porcentaje (1-50%)
- Select dropdown para duración del código: 7, 14, 30, 60, 90 días
- Se guarda en `empresas` table

## Validación de Códigos

Cuando el cliente introduce un código de descuento en el carrito, se validan server-side:
1. ✅ Código existe en la base de datos
2. ✅ No está marcado como `usado`
3. ✅ **No ha expirado** (`fecha_expiracion` > momento actual)
4. ✅ El email del cliente coincide con el email que solicitó el código

La validación ocurre en `descuentoUseCase.validateCode()` tanto al aplicar el código en el carrito como al crear el pedido.

## Componentes

- `WelcomeDiscountPopup` - Modal de suscripción (lazy loaded)
- `DescuentoBienvenidaForm` - Formulario de configuración admin
- `CartDrawer` - Input de código de descuento en el carrito

## Testing Checklist

- [ ] Habilitar feature en admin
- [ ] Visitar subdomain pedidos → popup aparece a los 30s
- [ ] Ingresar email → código enviado
- [ ] Revisar email con código
- [ ] En carrito: aplicar código con email correcto → descuento aplicado
- [ ] Aplicar código con email incorrecto → error
- [ ] Crear pedido con código → total con descuento, columns en DB
- [ ] Reutilizar código → "ya usado" error
- [ ] Código expirado → "expirado" error