# TPV Light Theme — Design Spec

**Date:** 2026-07-19
**Status:** Approved

---

## Goal

Reemplazar el tema oscuro del TPV por un tema claro profesional optimizado para uso en luz ambiental (restaurante, barra, mostrador). Cambio exclusivamente de presentación: tokens de color y tamaños de texto. Sin tocar lógica de negocio ni contratos de props.

---

## Motivación

En entornos con luz ambiental intensa, los fondos oscuros (#0f1117, #1a1d27) generan bajo contraste contra el entorno → fatiga visual y errores de lectura. Los TPV profesionales (Square, Toast, Lightspeed) usan paletas claras por este motivo. Un fondo claro con texto oscuro tiene mayor ratio de contraste WCAG en luz ambiental.

---

## Nueva paleta de tokens

| Token anterior | Token nuevo | Uso |
|---|---|---|
| `#0f1117` | `#f1f5f9` | Fondo de página / secciones |
| `#1a1d27` | `#ffffff` | Cards, paneles, header |
| `#22263a` | `#f1f5f9` | Hover / fondo secundario |
| `#2e3347` | `#e2e8f0` | Bordes |
| `#e8eaf0` / `#c8cad4` | `#0f172a` | Texto primario |
| `#6b7280` / `#9ca3af` | `#64748b` | Texto secundario |
| `#4b5563` | `#94a3b8` | Placeholders / deshabilitado |
| `#4f72ff` | `#2563eb` | Acento azul (activo, precio, CTA) |
| `#4f72ff18` / `#4f72ff22` | `#eff6ff` | Fondo activo |
| `#4f72ff55` | `#93c5fd` | Borde activo |
| `#22c55e` | `#16a34a` | Verde (Cobrar, listo) |
| `#22c55e15` / `#22c55e40` | `#f0fdf4` / `#bbf7d0` | Fondo/borde cobrado |
| `#ef444415` / `#ef444433` | `#fef2f2` / `#fca5a5` | Fondo/borde danger |
| `#ef4444` | `#ef4444` | Rojo (sin cambio) |
| `#f97316` | `#ea580c` | Naranja (más oscuro para fondo claro) |
| `#f9731615` / `#f9731640` | `#fff7ed` / `#fed7aa` | Fondo/borde advertencia |

---

## Reglas generales de implementación

1. **Solo presentación**: No modificar lógica, hooks, API, ni contratos de props.
2. **`pnpm lint` obligatorio** tras cada componente modificado.
3. **`Readonly<Props>`** ya aplicado en todos los componentes — mantener.
4. **SonarLint**: S3358 (sin ternario anidado), S3776 (complejidad ≤15), S2004 (≤4 niveles).
5. **Sin `any`**.
6. **Commits convencionales**: `feat(tpv): tema claro en <componente>`.

---

## Archivos a modificar

| Archivo | Descripción del cambio |
|---|---|
| `src/components/tpv/TpvHeader.tsx` | Header blanco, nav tabs claros, admin dropdown claro |
| `src/components/tpv/AccionesActions.tsx` | Sidebar blanco, labels más visibles |
| `src/components/tpv/TicketPanel.tsx` | Panel blanco, texto oscuro, botones ajustados |
| `src/components/tpv/MenuPanel.tsx` | Fondo claro, cards blancas con sombra, nombre producto uppercase |

---

## Componente 1: `TpvHeader.tsx`

### Cambios exactos

**Header element** (`<header>`):
- `bg-[#1a1d27] border-b border-[#2e3347]` → `bg-white border-b border-[#e2e8f0]`

**"TPV" label**:
- `text-[#4f72ff]` → `text-[#2563eb]`

**Empresa nombre**:
- `text-[#6b7280]` → `text-[#64748b]`

**Nav tab activo**:
- `bg-[#22263a] text-[#e8eaf0]` → `bg-[#eff6ff] text-[#1e40af] border border-[#93c5fd]`

**Nav tab inactivo**:
- `text-[#6b7280] hover:text-[#e8eaf0]` → `text-[#64748b] hover:text-[#0f172a]`

**Gear button — cerrado**:
- `bg-[#22263a] border-[#2e3347] text-[#6b7280] hover:border-[#4f72ff] hover:text-[#e8eaf0]`
- → `bg-[#f8fafc] border-[#e2e8f0] text-[#64748b] hover:border-[#2563eb] hover:text-[#0f172a]`

**Gear button — abierto**:
- `bg-[#2e3347] border-[#4f72ff] text-[#4f72ff]`
- → `bg-[#eff6ff] border-[#2563eb] text-[#2563eb]`

**Admin dropdown wrapper**:
- `bg-[#1a1d27] border border-[#2e3347] shadow-xl` → `bg-white border border-[#e2e8f0] shadow-xl`

**Admin dropdown items**:
- `text-[#c4c8d8] hover:bg-[#22263a] hover:text-[#e8eaf0]` → `text-[#374151] hover:bg-[#f1f5f9] hover:text-[#0f172a]`
- Iconos Lucide: `text-[#4f72ff]` → `text-[#2563eb]`
- Separador border-t: `border-[#2e3347]` → `border-[#e2e8f0]`

**Lock button**:
- `bg-[#22263a] border-[#2e3347] text-[#6b7280] hover:border-[#ef4444] hover:text-[#ef4444]`
- → `bg-[#f8fafc] border-[#e2e8f0] text-[#64748b] hover:border-[#ef4444] hover:text-[#ef4444]`

**Cierre de Caja button**:
- `bg-[#ef444412] border border-[#ef444455] text-[#ef4444] hover:bg-[#ef444420]`
- → `bg-[#fef2f2] border border-[#fca5a5] text-[#ef4444] hover:bg-[#fee2e2]`

---

## Componente 2: `AccionesActions.tsx`

### Cambios exactos

**`<aside>` sidebar**:
- `bg-[#1a1d27] border-l border-[#2e3347]` → `bg-white border-l border-[#e2e8f0]`

**Separador**:
- `bg-[#2e3347]` → `bg-[#e2e8f0]`

**`resolveVariantClass`** — reemplazar función completa:
```ts
function resolveVariantClass(variant: ActionVariant): string {
  if (variant === 'active') return 'bg-[#eff6ff] border-[#93c5fd]';
  if (variant === 'danger') return 'bg-[#fef2f2] border-[#fca5a5]';
  return 'border-[#e2e8f0] hover:bg-[#f1f5f9] hover:border-[#cbd5e1]';
}
```

**`resolveLabelClass`** — reemplazar función completa:
```ts
function resolveLabelClass(variant: ActionVariant): string {
  if (variant === 'active') return 'text-[#2563eb]';
  if (variant === 'danger') return 'text-[#ef4444]';
  return 'text-[#64748b]';
}
```

> Nota: el `text-[8px]` del label se mantiene (ya fue subido a 8px en el rediseño anterior, en el contexto claro ya es suficientemente legible con el nuevo color).

---

## Componente 3: `TicketPanel.tsx`

### Cambios exactos

**`<aside>` panel**:
- `bg-[#1a1d27] border-r border-[#2e3347]` → `bg-white border-r border-[#e2e8f0]`

**Header "Ticket activo" label**:
- `text-[#6b7280]` → `text-[#64748b]`

**Header border**:
- `border-b border-[#2e3347]` → `border-b border-[#e2e8f0]`

**Mesa label**:
- `text-[#4f72ff]` → `text-[#2563eb]`

**Empty state**:
- `text-[#6b7280]` → `text-[#94a3b8]`

**Existing orders — filas**:
- `border-b border-[#2e3347]/50` → `border-b border-[#e2e8f0]`
- Row button hover: `hover:bg-[#22263a]/40` → `hover:bg-[#f8fafc]`
- Header label (Pedido #N): `text-[#6b7280]` → `text-[#64748b]`
- Nota indicator `✎`: `text-[#4f72ff]` → `text-[#2563eb]`
- Pase short label: `text-[#4f72ff]` → `text-[#2563eb]`

**Item rows (existing)**:
- Item hover: `hover:bg-[#22263a]/50` → `hover:bg-[#f8fafc]`
- Cantidad badge: `bg-[#22263a] text-[#6b7280]` → `bg-[#f1f5f9] text-[#475569]`
- Nombre: `text-[#c8cad4]` → `text-[#0f172a]`
- Precio: `text-[#c8cad4]` → `text-[#0f172a]`

**Nota textarea (orders existentes)**:
- `bg-[#0f1117] border border-[#2e3347] text-[#e8eaf0] placeholder:text-[#4b5563] focus:border-[#4f72ff]`
- → `bg-[#f8fafc] border border-[#e2e8f0] text-[#0f172a] placeholder:text-[#94a3b8] focus:border-[#2563eb]`

**Pending items section**:
- Border-t: `border-[#4f72ff]/30` → `border-[#93c5fd]/50`
- Header "Nuevo pedido": `text-[#4f72ff]` → `text-[#2563eb]`
- Item border: `border-b border-[#2e3347]/30` → `border-b border-[#e2e8f0]`
- Item hover: `hover:bg-[#22263a]` → `hover:bg-[#f8fafc]`
- Cantidad badge pending: `bg-[#4f72ff] text-white` → mantener (azul sobre blanco es OK)
- Nombre pending: sin color explícito → añadir `text-[#0f172a]`
- Nota pending (italic): `text-[#a78bfa]` → mantener (violeta visible en claro)
- Precio pending: sin color explícito → añadir `text-[#0f172a]`
- Nota icon button: `text-[#6b7280] hover:text-[#a78bfa]` → `text-[#94a3b8] hover:text-[#a78bfa]`
- Remove button: `text-[#6b7280] hover:text-red-400` → `text-[#94a3b8] hover:text-red-500`

**Nota textarea (pending items)**:
- `bg-[#0f1117] border border-[#2e3347] text-[#e8eaf0] placeholder:text-[#4b5563] focus:border-[#a78bfa]`
- → `bg-[#f8fafc] border border-[#e2e8f0] text-[#0f172a] placeholder:text-[#94a3b8] focus:border-[#a78bfa]`

**Bottom section**:
- Border top: `border-t border-[#2e3347]` → `border-t border-[#e2e8f0]`
- Subtotal/IVA labels y valores: `text-[#6b7280]` → `text-[#64748b]`
- Total amount (`text-2xl font-bold`): sin color → añadir `text-[#0f172a]`
- Error: `text-red-400` → `text-red-600`

**Pase buttons (1er / 2º / Postre)**:
- Activo: `bg-[#4f72ff] border-[#4f72ff] text-white` → `bg-[#2563eb] border-[#2563eb] text-white`
- Inactivo: `border-[#2e3347] text-[#6b7280] hover:text-white hover:border-[#4f72ff]`
  → `border-[#e2e8f0] text-[#475569] hover:border-[#2563eb] hover:text-[#1e40af]`

**Directo button**:
- Inactivo: `border-[#2e3347] text-[#6b7280] hover:text-white hover:border-amber-600`
  → `border-[#e2e8f0] text-[#475569] hover:border-amber-600 hover:text-amber-700`
- Activo: `bg-amber-600 border-amber-600 text-white` → mantener

**Pending nota textarea**:
- `bg-[#0f1117] border border-[#2e3347]` → `bg-[#f8fafc] border border-[#e2e8f0]`
- `text-[#e8eaf0] placeholder:text-[#4b5563] focus:border-[#4f72ff]`
- → `text-[#0f172a] placeholder:text-[#94a3b8] focus:border-[#2563eb]`

**Enviar button**:
- `bg-[#4f72ff]` → `bg-[#2563eb]` (text-white, resto sin cambio)

**Warning "pedidos sin servir"**:
- `bg-[#f9731615] border border-[#f9731640]` → `bg-[#fff7ed] border border-[#fed7aa]`
- `text-[#f97316]` → `text-[#ea580c]`

**"Mesa cobrada" box**:
- `bg-[#22c55e15] border border-[#22c55e40]` → `bg-[#f0fdf4] border border-[#bbf7d0]`
- `text-[#22c55e]` → `text-[#16a34a]`

**Cobrar button**:
- `bg-[#22c55e]` → `bg-[#16a34a]` (text-white, resto sin cambio)

---

## Componente 4: `MenuPanel.tsx`

### Cambios en `MenuPanel` (función principal)

**`<section>` raíz**:
- `bg-[#0f1117]` → `bg-[#f1f5f9]`

**Tab bar container** (`<div className="flex items-center gap-2 px-4 py-3 border-b...">`):
- Añadir `bg-white` explícito
- `border-b border-[#2e3347]` → `border-b border-[#e2e8f0]`

**Tab "Todo" — activo**:
- `bg-[#4f72ff] text-white` → `bg-[#2563eb] text-white`

**Tab "Todo" — inactivo**:
- `bg-[#1a1d27] text-[#6b7280] hover:text-white` → `bg-[#f1f5f9] text-[#475569] border border-[#e2e8f0] hover:text-[#0f172a]`

**Tab categoría — activo**:
- `bg-[#4f72ff] text-white` → `bg-[#2563eb] text-white`

**Tab categoría — inactivo**:
- `bg-[#1a1d27] text-[#6b7280] hover:text-white` → `bg-[#f1f5f9] text-[#475569] border border-[#e2e8f0] hover:text-[#0f172a]`

**Search container**:
- Añadir `bg-white` explícito
- `border-b border-[#2e3347]` → `border-b border-[#e2e8f0]`

**Search input**:
- `bg-[#1a1d27] border border-[#2e3347] text-[#e8eaf0] placeholder:text-[#6b7280] focus:border-[#4f72ff]`
- → `bg-white border border-[#e2e8f0] text-[#0f172a] placeholder:text-[#94a3b8] focus:border-[#2563eb]`

**No-mesa overlay**:
- `bg-[#0f1117]/80` → `bg-[#f1f5f9]/90`
- Título "Selecciona una mesa": `text-[#e8eaf0]` → `text-[#0f172a]`
- Subtítulo: `text-[#6b7280]` → `text-[#64748b]`

**Sin productos text**:
- `text-[#6b7280]` → `text-[#94a3b8]`

**Product card button**:
- `bg-[#1a1d27] border border-[#2e3347] hover:border-[#4f72ff] hover:bg-[#22263a]`
- → `bg-white border border-[#e2e8f0] shadow-sm hover:border-[#2563eb] hover:bg-[#f8fafc]`

**Product image area** (`<div className="w-full aspect-square bg-[#0f1117] relative">`):
- `bg-[#0f1117]` → `bg-[#f8fafc]`

**Product placeholder "+"**:
- `text-[#2e3347]` → `text-[#cbd5e1]`

**Product nombre** (`<p className="text-xs font-medium leading-tight line-clamp-2">`):
- → `<p className="text-xs font-semibold leading-tight line-clamp-2 text-[#0f172a] uppercase tracking-wide">`

**Product precio** (`<p className="text-base font-bold text-[#4f72ff]">`):
- `text-[#4f72ff]` → `text-[#2563eb]`

### Cambios en `ComplementDialog` (función interna)

**Dialog wrapper** (`<div className="fixed inset-0 z-50 ... bg-[#1a1d27]">`):
- `bg-[#1a1d27]` → `bg-white`

**Header border**:
- `border-b border-[#2e3347]` → `border-b border-[#e2e8f0]`

**Label "Complementos"**:
- `text-[#6b7280]` → `text-[#64748b]`

**Product title en dialog**:
- `text-[#e8eaf0]` → `text-[#0f172a]`

**Close button**:
- `text-[#6b7280] hover:text-[#e8eaf0] hover:bg-[#2e3347]` → `text-[#64748b] hover:text-[#0f172a] hover:bg-[#f1f5f9]`

**Group name**:
- `text-[#9ca3af]` → `text-[#475569]`

**Progress bar track** (`<div className="h-0.5 ... bg-[#2e3347]">`):
- `bg-[#2e3347]` → `bg-[#e2e8f0]`

**Progress bar fill** (inline style `background: isRequired ? ...`):
- `'#22c55e'` → `'#16a34a'`
- `'#ef4444'` → mantener
- `'#4f72ff'` → `'#2563eb'`

**Option button** (inline style `background`/`borderColor`):
- bg selected: `oklch(28% 0.10 260 / 0.5)` → `'#eff6ff'`
- bg unselected: `oklch(20% 0.03 252 / 0.5)` → `'#f8fafc'`
- border selected: `oklch(60% 0.18 260)` → `'#2563eb'`
- border unselected: `oklch(35% 0.04 252)` → `'#e2e8f0'`

**Radio/checkbox indicator border** (inline `borderColor`):
- unselected: `'#4b5563'` → `'#d1d5db'`

**Radio fill**:
- `bg-[#4f72ff]` → `bg-[#2563eb]`

**Checkbox tick**:
- `text-[#4f72ff]` → `text-[#2563eb]`

**Option label**:
- `text-[#c8cad4]` → `text-[#0f172a]`

**Option precio adicional**:
- `text-[#4f72ff]` → `text-[#2563eb]`

**Footer border**:
- `border-t border-[#2e3347]` → `border-t border-[#e2e8f0]`

**Total label**:
- `text-[#9ca3af]` → `text-[#64748b]`

**Total amount**:
- `text-[#e8eaf0]` → `text-[#0f172a]`

**Cancel button**:
- `border border-[#2e3347] text-[#9ca3af] hover:border-[#4b5563]`
- → `border border-[#e2e8f0] text-[#64748b] hover:border-[#cbd5e1]`

**Confirm button** (inline style `background`):
- `isValid ? 'oklch(60% 0.18 260)' : '#374151'`
- → `isValid ? '#2563eb' : '#e2e8f0'`
- Añadir `className` con `text-[#64748b]` cuando `!isValid` para que el texto se vea sobre fondo claro. Implementar con función de módulo para evitar ternario en JSX:

```ts
function resolveConfirmClass(isValid: boolean): string {
  return isValid ? 'text-white' : 'text-[#64748b]';
}
```

Usar en el button: `className={\`flex-1 py-3 rounded-xl text-sm font-semibold transition-colors disabled:opacity-40 \${resolveConfirmClass(isValid)}\`}`

---

## Criterio de aceptación

- Toda la interfaz del TPV tiene fondos claros (blanco / #f1f5f9).
- El texto de productos es negro sobre fondo blanco — legible a 50cm con sol directo.
- Las labels del sidebar de acciones son visibles sin acercarse a la pantalla.
- `pnpm lint` y `pnpm build` pasan sin errores.
- La semántica de color se mantiene: azul = acción primaria, verde = cobrar/listo, rojo = peligro/cierre, naranja = en cocina.

---

## Archivos NO tocados

- Hooks, API routes, use cases, repositories.
- `src/app/tpv/layout.tsx` — el fondo de layout puede necesitar ajuste si tiene `bg-[#0f1117]` hardcodeado, pero se revisará post-implementación.
- Componentes fuera de `/tpv/` (waiter, kitchen, etc.).
