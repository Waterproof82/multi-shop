# Marketing — Flujo del Sistema

## Visión general

Plataforma multi-tenant que convierte la carta digital de un negocio en un canal de marketing directo con el cliente, sin intermediarios.

---

## 1. Descubrimiento — Cómo llega el cliente

El cliente accede a la carta digital del negocio a través de tres puntos de entrada:

| Canal | Descripción |
|---|---|
| **Carta en local** | QR impreso en mesa, mostrador o menú físico |
| **Perfil de Google** | Enlace directo desde la ficha de Google Business |
| **Tarjeta NFC** | Acercamiento del móvil → redirige a la carta digital |

Los tres canales llevan al mismo destino: la carta digital del negocio.

---

## 2. Captación — Alta del cliente

### 2a. Al hacer un pedido *(flujo principal)*

El cliente navega la carta, selecciona productos y realiza un pedido. En ese momento:

1. Se le solicitan sus **datos de contacto** (nombre, teléfono, email opcional).
2. El pedido se **envía por WhatsApp**:
   - Al **negocio**: notificación inmediata con el detalle del pedido.
   - Al **cliente**: confirmación con resumen del pedido.
3. El pedido queda **registrado en el sistema** (panel admin).
4. El cliente queda **creado o actualizado** en la base de datos del negocio (identificado por teléfono, único por negocio).

### 2b. Pop-up de suscripción *(propuesto — no implementado aún)*

Al entrar a la carta por primera vez, un pop-up invita al cliente a dejar su email para suscribirse a:
- Promociones y descuentos del negocio.
- Alertas de Magic Bags (TooGoodToGo).

> Este punto de captación permite crear la base de clientes **sin necesidad de que hagan un pedido**.

---

## 3. Fidelización — Canales de marketing

Una vez el cliente está en la base de datos, el negocio dispone de dos herramientas de comunicación directa por email.

---

### 3a. Promociones

Permite enviar una campaña de marketing a todos los clientes suscritos.

**Flujo:**
1. El admin redacta el mensaje (texto + imagen).
2. Selecciona la fecha/ocasión (descuento del día, evento especial, novedad, etc.).
3. Lanza el envío → los clientes suscritos reciben el email.

**Casos de uso típicos:**
- Descuento del día / menú especial.
- Anuncio de nueva carta o producto.
- Evento o celebración especial.

---

### 3b. TooGoodToGo (Magic Bags)

Permite al negocio rentabilizar el excedente de comida del día, evitando el desperdicio y generando ingresos adicionales.

**Flujo:**
1. El admin crea una campaña con:
   - Descripción del lote (lo que sobre del día).
   - Precio especial.
   - Número de cupones disponibles.
   - Franja horaria de recogida.
2. Se envía el email a los clientes suscritos.
3. El cliente hace clic en el enlace → reserva su cupón.
4. El cupón incluye la **fecha y hora de recogida** → el cliente se presenta en el negocio.
5. Una vez enviado, la campaña queda bloqueada (no se puede modificar ni re-enviar).

**Beneficios:**
- Reduce el desperdicio alimentario.
- Genera tráfico en franja horaria específica.
- Fideliza clientes con precios exclusivos.

---

## 4. Gestión — Panel de administración

Todo el flujo anterior se gestiona desde un único panel admin por negocio:

| Sección | Funcionalidad |
|---|---|
| **Pedidos** | Ver, gestionar y actualizar estado de pedidos en tiempo real |
| **Clientes** | Base de datos de clientes, estado de suscripción a marketing |
| **Promociones** | Crear y enviar campañas de email con imagen |
| **TooGoodToGo** | Crear campañas de Magic Bags, gestionar cupones y reservas |
| **Carta digital** | Gestión de productos, categorías e imágenes |
| **Configuración** | Datos del negocio, colores de marca, logo, contacto |

---

## 5. Resumen del flujo completo

```
Descubrimiento (QR / Google / NFC)
        ↓
Carta digital
        ↓
    ┌───┴───────────────────────┐
    │                           │
Hace pedido             Pop-up suscripción
(se crea cliente)       (deja solo el email)
    │                           │
    └───────────┬───────────────┘
                ↓
        Base de clientes
                ↓
    ┌───────────┴──────────────┐
    │                          │
Promociones              TooGoodToGo
(descuentos,             (Magic Bags,
 novedades)               excedente)
    │                          │
    └───────────┬──────────────┘
                ↓
        Email al cliente
                ↓
    Cliente vuelve al negocio
```

---

## 6. Diferencial competitivo

- **Sin comisiones por pedido** — el negocio es dueño de su canal de venta.
- **Base de clientes propia** — no depende de plataformas de terceros.
- **Marketing directo integrado** — desde el mismo panel donde gestionan la carta y los pedidos.
- **TooGoodToGo propio** — funcionalidad similar a la app TooGoodToGo pero sin ceder la relación con el cliente ni pagar comisiones.
- **Multi-canal de captación** — QR, Google, NFC y pop-up cubren todos los puntos de contacto.
