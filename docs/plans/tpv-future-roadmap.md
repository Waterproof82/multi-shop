# TPV & F&B — Roadmap de Funcionalidades Futuras

> Funcionalidades identificadas durante el análisis pre-Electron (julio 2026) pero diferidas por impacto/complejidad.
> Cada bloque es candidato a un ciclo independiente de brainstorming → plan → implementación.

---

## Pases por Ítem + Flujo Pendientes

**Estado:** 🔶 EN CURSO — T1-T9 completados, falta T10 (kitchen standalone badge)
**Plan detallado:** `docs/superpowers/plans/2026-07-16-pases-por-item.md`
**Dependencias:** ninguna

### Pendiente
- **T10** — `src/app/kitchen/page.tsx`: mostrar badge de pase en cada tarjeta de ítem si `pase !== null`

---

## Bloque 1 — Gestión de Proveedores y Compras

**Estado:** ✅ COMPLETADO Y ARCHIVADO (2026-07-15)
**Dependencias:** Stock de ingredientes (ya existe)
**Complejidad:** Alta (nuevo módulo completo)

### Sub-features

#### 1.1 Fichas de Proveedores
- CRUD de proveedores: nombre, CIF, email, teléfono, condiciones de pago, observaciones
- Tabla `proveedores` con `empresa_id` (aislamiento multi-tenant)
- Página `/admin/compras/proveedores`

#### 1.2 Catálogos de Compra
- Cada proveedor tiene un catálogo de artículos que vende
- Tabla `catalogo_compra` con: `proveedor_id`, `ingrediente_id`, `precio_compra`, `unidad_compra`, `factor_conversion`
- Permite registrar que un proveedor vende "caja de 5 kg" cuando la unidad interna es "kg"

#### 1.3 Pedidos de Compra
- Flujo: seleccionar proveedor → seleccionar artículos → generar PDF → enviar por email
- Tabla `pedidos_compra` + `pedido_compra_items`
- Estados: borrador → enviado → recibido

#### 1.4 Albaranes / Recepción de Mercancía
- Al recibir un pedido, crear un albarán que actualiza el stock automáticamente
- Genera movimiento `entrada` en `movimientos_stock`
- Permite recepción parcial

---

## Bloque 2 — Food Cost Avanzado

**Estado:** ✅ COMPLETADO Y ARCHIVADO (2026-07-16) — CMP, food-cost, rentabilidad implementados
**Dependencias:** Escandallos + Stock + Movimientos
**Complejidad:** Media

### Sub-features

#### 2.1 CMP en Escandallos (Coste Medio Ponderado)
- Actualmente `precio_compra` en ingredientes es un valor estático
- CMP = promedio ponderado del historial de compras de ese ingrediente
- Al registrar un albarán, recalcular el CMP del ingrediente afectado
- Añadir columna `precio_cmp` a `ingredientes`, actualizable solo por el sistema

#### 2.2 Food Cost Real vs Teórico
- **Teórico**: suma de escandallos × unidades vendidas en el período
- **Real**: suma de movimientos de stock tipo `deduccion`, `merma`, `inventario` en el período
- Desviación = (real - teórico) / teórico × 100
- Informe por período (semana/mes) desglosado por familia de producto
- Página `/admin/analytics/food-cost`

#### 2.3 Margen por Producto
- Precio de venta - food cost real unitario = margen bruto
- Tabla en `/admin/analytics/rentabilidad` ordenable por margen

---

## Bloque 3 — Analítica Avanzada

**Estado:** ✅ COMPLETADO Y ARCHIVADO (2026-07-18) — BCG, heatmap ocupación, cierre diario, comparativa períodos
**Dependencias:** Historial de pedidos
**Complejidad:** Media-Alta

### Sub-features

#### 3.1 Matriz BCG de Menú (Menu Engineering)
- Cuadrantes: Estrellas (alto volumen + alto margen), Vaca (alto volumen + bajo margen), Perro (bajo + bajo), Enigma (bajo + alto)
- Eje X = popularidad (nº ventas), Eje Y = contribución marginal
- Visualización scatter plot interactivo
- Página `/admin/analytics/menu-engineering`

#### 3.2 Heatmap de Ocupación por Hora/Día
- Cruzar `mesa_sesiones.created_at` y `cerrada_at` con día de semana y hora
- Detectar horas pico y horas valle
- Útil para dimensionar personal

#### 3.3 Informe de Cierre Diario
- Generado automáticamente al cerrar turno
- Resumen: ventas, covers, ticket medio, métodos de pago, propinas, mermas
- Exportable a PDF

#### 3.4 Comparativa de Períodos
- Semana actual vs semana anterior, mes actual vs mes anterior
- Variación % en ventas, covers, ticket medio

---

## Bloque 4 — RBAC Completo

**Estado:** ❌ Diferido — 4.1 y 4.2 descartados; 4.3 (Auditoría) pendiente de implementar
**Dependencias:** `perfiles_admin.rol`
**Complejidad:** Media

### Decisión (julio 2026)

Los sub-features 4.1 y 4.2 se descartan por ahora. Motivos:

- El sistema ya tiene **dos capas de acceso bien separadas**: panel admin (email+contraseña, dueño) y TPV empleados (PIN, cajero/encargado). No hay ambigüedad real.
- El "acceso admin parcial" (encargado con login de admin restringido) solo tiene sentido en organizaciones medianas/grandes donde el encargado necesita ver analytics sin que el dueño le dé su contraseña. Para restaurantes pequeños y medianos es sobre-ingeniería.
- Si en el futuro aparece un cliente con ese requisito concreto, la infraestructura ya está lista: `requireRole()` existe, el proxy inyecta `x-admin-rol`, y las rutas TPV ya aceptan `cajero`/`encargado`. Solo faltaría agregar esos roles a `perfiles_admin` y poner guards en el sidebar.

**Lo que SÍ tiene valor independiente:**

#### 4.3 Auditoría de Acciones ← pendiente de implementar
- Log de quién hizo qué: abre turno, cierra sesión de mesa, ajusta stock
- Tabla `audit_log` con `admin_id`, `action`, `payload`, `created_at`
- Útil en cualquier tamaño de negocio para resolver disputas y detectar errores operativos

---

## Bloque 5 — Integraciones Externas

**Estado:** ❌ No iniciado
**Complejidad:** Alta

### Sub-features

#### 5.1 Exportación a Contabilidad
- Formato FacturaE para la factura electrónica obligatoria (España 2025+)
- Exportación CSV/XLSX compatible con A3, ContaPlus, Sage

#### 5.2 Conexión con Deliveroo / Just Eat / Uber Eats
- Webhook receptor para pedidos de plataformas
- Convierte pedido externo en pedido TPV automáticamente
- Requiere API keys por plataforma

#### 5.3 Reservas Online
- Módulo de gestión de reservas vinculado a la grilla de mesas
- Bloquea mesa en rango horario reservado
- Integración con Google Calendar / widget público

---

## Notas Técnicas

- **Bloque 1** es el más urgente para restaurantes que quieren cerrar el ciclo de F&B real. Sin él, el food cost teórico no tiene forma de compararse con el real de compra.
- **Bloque 2.1 (CMP)** depende de Bloque 1.4 (albaranes) para ser preciso.
- **Bloque 3 (BCG)** puede construirse sobre datos actuales sin esperar Bloque 1 o 2.
- **Bloque 4 (RBAC)** es independiente y de bajo riesgo — puede hacerse en cualquier momento.
- El empaquetado **Electron + Capacitor** (fase siguiente) no depende de ninguno de estos bloques. Se puede empaquetar antes e iterar post-release.
