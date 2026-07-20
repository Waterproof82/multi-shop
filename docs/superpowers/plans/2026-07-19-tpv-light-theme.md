# TPV Light Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Reemplazar el tema oscuro del TPV por un tema claro profesional para mayor legibilidad en luz ambiental.

**Architecture:** Cambios puramente de presentación en 5 archivos (1 layout + 4 componentes). Se reemplazan tokens de color oscuros por equivalentes claros sin tocar lógica, hooks ni contratos de props.

**Tech Stack:** Next.js 14 App Router, React, Tailwind CSS v4, TypeScript.

---

## File Map

| Archivo | Cambio |
|---|---|
| `src/app/tpv/layout.tsx` | bg-[#0f1117] → bg-[#f1f5f9], text-[#e8eaf0] → text-[#0f172a] |
| `src/components/tpv/TpvHeader.tsx` | Header blanco, nav tabs claros, dropdown claro |
| `src/components/tpv/AccionesActions.tsx` | Sidebar blanco, resolve functions actualizadas |
| `src/components/tpv/TicketPanel.tsx` | Panel blanco, texto oscuro, botones ajustados |
| `src/components/tpv/MenuPanel.tsx` | Fondo claro, cards blancas, ComplementDialog claro |

---

## Task 1: Layout + TpvHeader — fondo global y header

**Files:**
- Modify: `src/app/tpv/layout.tsx`
- Modify: `src/components/tpv/TpvHeader.tsx`

### layout.tsx

- [x] **Step 1: Actualizar fondo del layout**

Localizar la línea (~129) con `bg-[#0f1117] text-[#e8eaf0]` y reemplazar:

```tsx
// ANTES:
<div className="flex flex-col h-screen bg-[#0f1117] text-[#e8eaf0] overflow-hidden">

// DESPUÉS:
<div className="flex flex-col h-screen bg-[#f1f5f9] text-[#0f172a] overflow-hidden">
```

### TpvHeader.tsx

- [x] **Step 2: Actualizar `<header>` background**

```tsx
// ANTES:
<header className="flex items-center justify-between h-14 px-5 bg-[#1a1d27] border-b border-[#2e3347] shrink-0">

// DESPUÉS:
<header className="flex items-center justify-between h-14 px-5 bg-white border-b border-[#e2e8f0] shrink-0">
```

- [x] **Step 3: Actualizar colores del logo y empresa**

```tsx
// ANTES:
<span className="font-bold text-[#4f72ff] text-sm tracking-wide">TPV</span>
<span className="text-xs text-[#6b7280]">{empresaNombre}</span>

// DESPUÉS:
<span className="font-bold text-[#2563eb] text-sm tracking-wide">TPV</span>
<span className="text-xs text-[#64748b]">{empresaNombre}</span>
```

- [x] **Step 4: Actualizar nav tabs**

```tsx
// ANTES:
className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
  pathname.startsWith(activePrefix)
    ? 'bg-[#22263a] text-[#e8eaf0]'
    : 'text-[#6b7280] hover:text-[#e8eaf0]'
}`}

// DESPUÉS:
className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
  pathname.startsWith(activePrefix)
    ? 'bg-[#eff6ff] text-[#1e40af] border border-[#93c5fd]'
    : 'text-[#64748b] hover:text-[#0f172a]'
}`}
```

- [x] **Step 5: Actualizar botón Admin (gear)**

```tsx
// ANTES:
className={`p-1.5 rounded-md border transition-colors ${
  adminOpen
    ? 'bg-[#2e3347] border-[#4f72ff] text-[#4f72ff]'
    : 'bg-[#22263a] border-[#2e3347] text-[#6b7280] hover:border-[#4f72ff] hover:text-[#e8eaf0]'
}`}

// DESPUÉS:
className={`p-1.5 rounded-md border transition-colors ${
  adminOpen
    ? 'bg-[#eff6ff] border-[#2563eb] text-[#2563eb]'
    : 'bg-[#f8fafc] border-[#e2e8f0] text-[#64748b] hover:border-[#2563eb] hover:text-[#0f172a]'
}`}
```

- [x] **Step 6: Actualizar admin dropdown**

```tsx
// ANTES (wrapper):
<div className="absolute right-0 top-full mt-2 w-48 bg-[#1a1d27] border border-[#2e3347] rounded-lg shadow-xl z-50 overflow-hidden">

// DESPUÉS:
<div className="absolute right-0 top-full mt-2 w-48 bg-white border border-[#e2e8f0] rounded-lg shadow-xl z-50 overflow-hidden">

// ANTES (items):
className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm text-[#c4c8d8] hover:bg-[#22263a] hover:text-[#e8eaf0] transition-colors text-left ${
  idx === ADMIN_SHORTCUTS.length - 1 ? 'border-t border-[#2e3347] mt-1' : ''
}`}

// DESPUÉS:
className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm text-[#374151] hover:bg-[#f1f5f9] hover:text-[#0f172a] transition-colors text-left ${
  idx === ADMIN_SHORTCUTS.length - 1 ? 'border-t border-[#e2e8f0] mt-1' : ''
}`}

// ANTES (icono):
<Icon className="h-4 w-4 text-[#4f72ff] flex-shrink-0" />

// DESPUÉS:
<Icon className="h-4 w-4 text-[#2563eb] flex-shrink-0" />
```

- [x] **Step 7: Actualizar botón Lock y botón Cierre**

```tsx
// Lock button — ANTES:
className="p-1.5 rounded-md border bg-[#22263a] border-[#2e3347] text-[#6b7280] hover:border-[#ef4444] hover:text-[#ef4444] transition-colors disabled:opacity-50"

// Lock button — DESPUÉS:
className="p-1.5 rounded-md border bg-[#f8fafc] border-[#e2e8f0] text-[#64748b] hover:border-[#ef4444] hover:text-[#ef4444] transition-colors disabled:opacity-50"

// Cierre button — ANTES:
className="text-xs bg-[#ef444412] border border-[#ef444455] text-[#ef4444] px-3 py-1.5 rounded-md hover:bg-[#ef444420] transition-colors flex items-center gap-1.5"

// Cierre button — DESPUÉS:
className="text-xs bg-[#fef2f2] border border-[#fca5a5] text-[#ef4444] px-3 py-1.5 rounded-md hover:bg-[#fee2e2] transition-colors flex items-center gap-1.5"
```

- [x] **Step 8: Verificar lint**

```bash
pnpm lint
```

Esperado: sin errores en `layout.tsx` ni `TpvHeader.tsx`.

- [x] **Step 9: Commit**

```bash
git add src/app/tpv/layout.tsx src/components/tpv/TpvHeader.tsx
git commit -m "feat(tpv): tema claro en layout y TpvHeader"
```

---

## Task 2: AccionesActions — sidebar blanco con labels visibles

**Files:**
- Modify: `src/components/tpv/AccionesActions.tsx`

- [x] **Step 1: Actualizar `resolveVariantClass`**

```tsx
// REEMPLAZAR función completa:
function resolveVariantClass(variant: ActionVariant): string {
  if (variant === 'active') return 'bg-[#eff6ff] border-[#93c5fd]';
  if (variant === 'danger') return 'bg-[#fef2f2] border-[#fca5a5]';
  return 'border-[#e2e8f0] hover:bg-[#f1f5f9] hover:border-[#cbd5e1]';
}
```

- [x] **Step 2: Actualizar `resolveLabelClass`**

```tsx
// REEMPLAZAR función completa:
function resolveLabelClass(variant: ActionVariant): string {
  if (variant === 'active') return 'text-[#2563eb]';
  if (variant === 'danger') return 'text-[#ef4444]';
  return 'text-[#64748b]';
}
```

- [x] **Step 3: Actualizar sidebar y separador**

```tsx
// <aside> — ANTES:
<aside className="w-16 shrink-0 bg-[#1a1d27] border-l border-[#2e3347] flex flex-col items-center py-3 gap-1.5">

// <aside> — DESPUÉS:
<aside className="w-16 shrink-0 bg-white border-l border-[#e2e8f0] flex flex-col items-center py-3 gap-1.5">

// Separador — ANTES:
<div className="w-7 h-px bg-[#2e3347] my-1" role="separator" />

// Separador — DESPUÉS:
<div className="w-7 h-px bg-[#e2e8f0] my-1" role="separator" />
```

- [x] **Step 4: Verificar lint**

```bash
pnpm lint
```

Esperado: sin errores en `AccionesActions.tsx`.

- [x] **Step 5: Commit**

```bash
git add src/components/tpv/AccionesActions.tsx
git commit -m "feat(tpv): tema claro en AccionesPanel"
```

---

## Task 3: TicketPanel — panel blanco, texto oscuro

**Files:**
- Modify: `src/components/tpv/TicketPanel.tsx`

Hay muchos cambios en este archivo. Aplicarlos todos antes de hacer lint.

- [x] **Step 1: Actualizar `<aside>` y header del panel**

```tsx
// <aside> — ANTES:
<aside className="w-[300px] shrink-0 bg-[#1a1d27] border-r border-[#2e3347] flex flex-col">

// <aside> — DESPUÉS:
<aside className="w-[300px] shrink-0 bg-white border-r border-[#e2e8f0] flex flex-col">

// Header div — ANTES:
<div className="px-4 py-3.5 border-b border-[#2e3347] flex justify-between items-center">

// Header div — DESPUÉS:
<div className="px-4 py-3.5 border-b border-[#e2e8f0] flex justify-between items-center">

// "Ticket activo" label — ANTES:
<span className="text-xs font-bold text-[#6b7280] uppercase tracking-wider">Ticket activo</span>

// DESPUÉS:
<span className="text-xs font-bold text-[#64748b] uppercase tracking-wider">Ticket activo</span>

// Mesa label — ANTES:
<span className="text-xs text-[#4f72ff] font-semibold">{mesaLabel}</span>

// DESPUÉS:
<span className="text-xs text-[#2563eb] font-semibold">{mesaLabel}</span>
```

- [x] **Step 2: Actualizar estado vacío y filas de orders existentes**

```tsx
// Empty state — ANTES:
<p className="px-4 py-8 text-center text-sm text-[#6b7280]">

// DESPUÉS:
<p className="px-4 py-8 text-center text-sm text-[#94a3b8]">

// Order border — ANTES:
<div key={order.id} className="border-b border-[#2e3347]/50 last:border-b-0">

// DESPUÉS:
<div key={order.id} className="border-b border-[#e2e8f0] last:border-b-0">

// Order header button — ANTES:
className="w-full flex items-center justify-between px-4 py-1.5 hover:bg-[#22263a]/40 transition-colors"

// DESPUÉS:
className="w-full flex items-center justify-between px-4 py-1.5 hover:bg-[#f8fafc] transition-colors"

// Order label "Pedido #N" — ANTES:
<span className="text-[10px] font-bold text-[#6b7280] uppercase tracking-wider">

// DESPUÉS:
<span className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider">

// Nota indicator ✎ — ANTES:
<span className="ml-1.5 text-[#4f72ff]">✎</span>

// DESPUÉS:
<span className="ml-1.5 text-[#2563eb]">✎</span>

// Pase short label — ANTES:
<span className="ml-2 text-[#4f72ff]">{paseShortLabel(order.pase)}</span>

// DESPUÉS:
<span className="ml-2 text-[#2563eb]">{paseShortLabel(order.pase)}</span>
```

- [x] **Step 3: Actualizar items de orders existentes**

```tsx
// Item row — ANTES:
<div key={`${order.id}-${idx}`} className="flex items-start gap-2.5 px-4 py-2 hover:bg-[#22263a]/50 transition-colors">

// DESPUÉS:
<div key={`${order.id}-${idx}`} className="flex items-start gap-2.5 px-4 py-2 hover:bg-[#f8fafc] transition-colors">

// Cantidad badge — ANTES:
<span className="w-5 h-5 rounded bg-[#22263a] text-[#6b7280] text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">

// DESPUÉS:
<span className="w-5 h-5 rounded bg-[#f1f5f9] text-[#475569] text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">

// Nombre item — ANTES:
<p className="text-sm font-medium truncate text-[#c8cad4]">{item.nombre}</p>

// DESPUÉS:
<p className="text-sm font-medium truncate text-[#0f172a]">{item.nombre}</p>

// Precio item — ANTES:
<span className="text-sm font-semibold shrink-0 text-[#c8cad4]">

// DESPUÉS:
<span className="text-sm font-semibold shrink-0 text-[#0f172a]">

// Nota textarea (existing orders) — ANTES:
className="w-full bg-[#0f1117] border border-[#2e3347] rounded-lg px-3 py-2 text-xs text-[#e8eaf0] placeholder:text-[#4b5563] focus:outline-none focus:border-[#4f72ff] transition-colors resize-none"

// DESPUÉS:
className="w-full bg-[#f8fafc] border border-[#e2e8f0] rounded-lg px-3 py-2 text-xs text-[#0f172a] placeholder:text-[#94a3b8] focus:outline-none focus:border-[#2563eb] transition-colors resize-none"
```

- [x] **Step 4: Actualizar sección "Nuevo pedido" (pending items)**

```tsx
// Border top pending — ANTES:
<div className="border-t border-[#4f72ff]/30">

// DESPUÉS:
<div className="border-t border-[#93c5fd]/50">

// "Nuevo pedido" label — ANTES:
<span className="text-[10px] font-bold text-[#4f72ff] uppercase tracking-wider">Nuevo pedido</span>

// DESPUÉS:
<span className="text-[10px] font-bold text-[#2563eb] uppercase tracking-wider">Nuevo pedido</span>

// Item border — ANTES:
<div key={itemKey} className="border-b border-[#2e3347]/30 last:border-b-0">

// DESPUÉS:
<div key={itemKey} className="border-b border-[#e2e8f0] last:border-b-0">

// Item hover wrapper — ANTES:
<div className="flex items-start gap-2.5 px-4 py-2.5 hover:bg-[#22263a] transition-colors">

// DESPUÉS:
<div className="flex items-start gap-2.5 px-4 py-2.5 hover:bg-[#f8fafc] transition-colors">

// Nombre pending — ANTES:
<p className="text-sm font-medium truncate">{item.nombre}</p>

// DESPUÉS:
<p className="text-sm font-medium truncate text-[#0f172a]">{item.nombre}</p>

// Precio pending — ANTES:
<span className="text-sm font-semibold shrink-0">{fmt(item.precioTotal * item.cantidad)}</span>

// DESPUÉS:
<span className="text-sm font-semibold shrink-0 text-[#0f172a]">{fmt(item.precioTotal * item.cantidad)}</span>

// Nota button — ANTES (parte del ternario en className):
'text-[#6b7280] hover:text-[#a78bfa]'

// DESPUÉS:
'text-[#94a3b8] hover:text-[#a78bfa]'

// Remove button — ANTES:
className="text-[#6b7280] hover:text-red-400 text-base leading-none shrink-0 mt-0.5"

// DESPUÉS:
className="text-[#94a3b8] hover:text-red-500 text-base leading-none shrink-0 mt-0.5"

// Nota textarea (pending items) — ANTES:
className="w-full bg-[#0f1117] border border-[#2e3347] rounded-lg px-3 py-2 text-xs text-[#e8eaf0] placeholder:text-[#4b5563] focus:outline-none focus:border-[#a78bfa] transition-colors resize-none"

// DESPUÉS:
className="w-full bg-[#f8fafc] border border-[#e2e8f0] rounded-lg px-3 py-2 text-xs text-[#0f172a] placeholder:text-[#94a3b8] focus:outline-none focus:border-[#a78bfa] transition-colors resize-none"
```

- [x] **Step 5: Actualizar sección inferior (totales, pases, botones)**

```tsx
// Border top bottom section — ANTES:
<div className="border-t border-[#2e3347] p-4 flex flex-col gap-3">

// DESPUÉS:
<div className="border-t border-[#e2e8f0] p-4 flex flex-col gap-3">

// Subtotal y IVA divs — ANTES:
<div className="flex justify-between text-sm text-[#6b7280]">   (×2)

// DESPUÉS:
<div className="flex justify-between text-sm text-[#64748b]">   (×2)

// Total amount — ANTES:
<div className="text-2xl font-bold mt-1">{fmt(total)}</div>

// DESPUÉS:
<div className="text-2xl font-bold mt-1 text-[#0f172a]">{fmt(total)}</div>

// Error — ANTES:
<p className="text-xs text-red-400 text-center">{sendError}</p>

// DESPUÉS:
<p className="text-xs text-red-600 text-center">{sendError}</p>

// Pase buttons (1er / 2º / Postre) — ANTES:
className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors ${
  pendingPase === p && !directoACocina
    ? 'bg-[#4f72ff] border-[#4f72ff] text-white'
    : 'border-[#2e3347] text-[#6b7280] hover:text-white hover:border-[#4f72ff]'
}`}

// DESPUÉS:
className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors ${
  pendingPase === p && !directoACocina
    ? 'bg-[#2563eb] border-[#2563eb] text-white'
    : 'border-[#e2e8f0] text-[#475569] hover:border-[#2563eb] hover:text-[#1e40af]'
}`}

// Directo button — ANTES (parte inactiva):
'border-[#2e3347] text-[#6b7280] hover:text-white hover:border-amber-600'

// DESPUÉS (parte inactiva):
'border-[#e2e8f0] text-[#475569] hover:border-amber-600 hover:text-amber-700'

// Nota pedido textarea — ANTES:
className="w-full bg-[#0f1117] border border-[#2e3347] rounded-xl px-3 py-2 text-xs text-[#e8eaf0] placeholder:text-[#4b5563] focus:outline-none focus:border-[#4f72ff] transition-colors resize-none"

// DESPUÉS:
className="w-full bg-[#f8fafc] border border-[#e2e8f0] rounded-xl px-3 py-2 text-xs text-[#0f172a] placeholder:text-[#94a3b8] focus:outline-none focus:border-[#2563eb] transition-colors resize-none"

// Enviar button — ANTES:
className="w-full bg-[#4f72ff] text-white rounded-xl py-3 text-sm font-bold hover:brightness-110 transition-all disabled:opacity-50 flex items-center justify-center gap-2"

// DESPUÉS:
className="w-full bg-[#2563eb] text-white rounded-xl py-3 text-sm font-bold hover:brightness-110 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
```

- [x] **Step 6: Actualizar cajas de advertencia y botón Cobrar**

```tsx
// Warning "pedidos sin servir" — ANTES:
<div className="flex items-start gap-2 rounded-xl px-3 py-2.5 bg-[#f9731615] border border-[#f9731640]">
  <span className="text-sm leading-none mt-0.5">🍽</span>
  <p className="text-xs leading-snug text-[#f97316]">

// DESPUÉS:
<div className="flex items-start gap-2 rounded-xl px-3 py-2.5 bg-[#fff7ed] border border-[#fed7aa]">
  <span className="text-sm leading-none mt-0.5">🍽</span>
  <p className="text-xs leading-snug text-[#ea580c]">

// "Mesa cobrada" box — ANTES:
<div className="flex items-start gap-2 rounded-xl px-3 py-2.5 bg-[#22c55e15] border border-[#22c55e40]">
  <span className="text-sm leading-none mt-0.5">✓</span>
  <p className="text-xs leading-snug text-[#22c55e]">

// DESPUÉS:
<div className="flex items-start gap-2 rounded-xl px-3 py-2.5 bg-[#f0fdf4] border border-[#bbf7d0]">
  <span className="text-sm leading-none mt-0.5">✓</span>
  <p className="text-xs leading-snug text-[#16a34a]">

// Cobrar button — ANTES:
className="w-full bg-[#22c55e] text-white rounded-xl py-4 text-lg font-extrabold disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110 transition-all flex items-center justify-center gap-2"

// DESPUÉS:
className="w-full bg-[#16a34a] text-white rounded-xl py-4 text-lg font-extrabold disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110 transition-all flex items-center justify-center gap-2"
```

- [x] **Step 7: Verificar lint**

```bash
pnpm lint
```

Esperado: sin errores en `TicketPanel.tsx`.

- [x] **Step 8: Commit**

```bash
git add src/components/tpv/TicketPanel.tsx
git commit -m "feat(tpv): tema claro en TicketPanel"
```

---

## Task 4: MenuPanel — cards blancas, ComplementDialog claro

**Files:**
- Modify: `src/components/tpv/MenuPanel.tsx`

Este archivo tiene dos áreas: la función `MenuPanel` y la función interna `ComplementDialog`. Aplicar todos los cambios antes de lint.

### Cambios en `MenuPanel`

- [x] **Step 1: Actualizar `<section>`, tabs y search**

```tsx
// Section — ANTES:
<section className="flex-1 flex flex-col overflow-hidden bg-[#0f1117]">

// DESPUÉS:
<section className="flex-1 flex flex-col overflow-hidden bg-[#f1f5f9]">

// Tab bar container — ANTES:
<div className="flex items-center gap-2 px-4 py-3 border-b border-[#2e3347] overflow-x-auto shrink-0">

// DESPUÉS:
<div className="flex items-center gap-2 px-4 py-3 border-b border-[#e2e8f0] overflow-x-auto shrink-0 bg-white">

// Tab "Todo" — ANTES:
className={`shrink-0 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
  activeCatId === ALL_CAT_ID
    ? 'bg-[#4f72ff] text-white'
    : 'bg-[#1a1d27] text-[#6b7280] hover:text-white'
}`}

// DESPUÉS:
className={`shrink-0 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
  activeCatId === ALL_CAT_ID
    ? 'bg-[#2563eb] text-white'
    : 'bg-[#f1f5f9] text-[#475569] border border-[#e2e8f0] hover:text-[#0f172a]'
}`}

// Tab categoría — ANTES:
className={`shrink-0 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
  activeCatId === cat.id
    ? 'bg-[#4f72ff] text-white'
    : 'bg-[#1a1d27] text-[#6b7280] hover:text-white'
}`}

// DESPUÉS:
className={`shrink-0 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
  activeCatId === cat.id
    ? 'bg-[#2563eb] text-white'
    : 'bg-[#f1f5f9] text-[#475569] border border-[#e2e8f0] hover:text-[#0f172a]'
}`}

// Search container — ANTES:
<div className="px-4 py-3 border-b border-[#2e3347] shrink-0">

// DESPUÉS:
<div className="px-4 py-3 border-b border-[#e2e8f0] shrink-0 bg-white">

// Search input — ANTES:
className="w-full bg-[#1a1d27] border border-[#2e3347] rounded-lg px-3 py-2 text-sm text-[#e8eaf0] placeholder:text-[#6b7280] focus:outline-none focus:border-[#4f72ff]"

// DESPUÉS:
className="w-full bg-white border border-[#e2e8f0] rounded-lg px-3 py-2 text-sm text-[#0f172a] placeholder:text-[#94a3b8] focus:outline-none focus:border-[#2563eb]"
```

- [x] **Step 2: Actualizar overlay no-mesa y estado vacío**

```tsx
// Overlay no-mesa — ANTES:
<div className="absolute inset-0 z-10 flex items-center justify-center bg-[#0f1117]/80 backdrop-blur-[2px]">

// DESPUÉS:
<div className="absolute inset-0 z-10 flex items-center justify-center bg-[#f1f5f9]/90 backdrop-blur-[2px]">

// Título no-mesa — ANTES:
<p className="text-sm font-semibold text-[#e8eaf0]">Selecciona una mesa</p>

// DESPUÉS:
<p className="text-sm font-semibold text-[#0f172a]">Selecciona una mesa</p>

// Subtítulo no-mesa — ANTES:
<p className="text-xs text-[#6b7280]">Elige una mesa en el panel izquierdo para añadir productos.</p>

// DESPUÉS:
<p className="text-xs text-[#64748b]">Elige una mesa en el panel izquierdo para añadir productos.</p>

// Sin productos — ANTES:
<p className="text-center text-sm text-[#6b7280] py-12">Sin productos</p>

// DESPUÉS:
<p className="text-center text-sm text-[#94a3b8] py-12">Sin productos</p>
```

- [x] **Step 3: Actualizar product cards**

```tsx
// Card button — ANTES:
className="bg-[#1a1d27] border border-[#2e3347] rounded-xl overflow-hidden flex flex-col hover:border-[#4f72ff] hover:bg-[#22263a] transition-all text-left active:scale-95"

// DESPUÉS:
className="bg-white border border-[#e2e8f0] rounded-xl overflow-hidden flex flex-col hover:border-[#2563eb] hover:bg-[#f8fafc] transition-all text-left active:scale-95 shadow-sm"

// Image area — ANTES:
<div className="w-full aspect-square bg-[#0f1117] relative">

// DESPUÉS:
<div className="w-full aspect-square bg-[#f8fafc] relative">

// Placeholder "+" — ANTES:
<div className="w-full h-full flex items-center justify-center text-2xl text-[#2e3347]">

// DESPUÉS:
<div className="w-full h-full flex items-center justify-center text-2xl text-[#cbd5e1]">

// Nombre producto — ANTES:
<p className="text-xs font-medium leading-tight line-clamp-2">{p.titulo_es}</p>

// DESPUÉS:
<p className="text-xs font-semibold leading-tight line-clamp-2 text-[#0f172a] uppercase tracking-wide">{p.titulo_es}</p>

// Precio — ANTES:
<p className="text-base font-bold text-[#4f72ff]">

// DESPUÉS:
<p className="text-base font-bold text-[#2563eb]">
```

### Cambios en `ComplementDialog`

- [x] **Step 4: Actualizar dialog wrapper, header y grupo names**

```tsx
// Dialog wrapper — ANTES:
<div className="fixed inset-0 z-50 flex flex-col bg-[#1a1d27]">

// DESPUÉS:
<div className="fixed inset-0 z-50 flex flex-col bg-white">

// Header border — ANTES:
<div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-[#2e3347] shrink-0">

// DESPUÉS:
<div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-[#e2e8f0] shrink-0">

// Label "Complementos" — ANTES:
<p className="text-[10px] font-bold text-[#6b7280] uppercase tracking-wider mb-0.5">Complementos</p>

// DESPUÉS:
<p className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider mb-0.5">Complementos</p>

// Product title — ANTES:
<p className="text-base font-bold text-[#e8eaf0]">{state.product.titulo_es}</p>

// DESPUÉS:
<p className="text-base font-bold text-[#0f172a]">{state.product.titulo_es}</p>

// Close button — ANTES:
className="w-8 h-8 flex items-center justify-center rounded-lg text-[#6b7280] hover:text-[#e8eaf0] hover:bg-[#2e3347] transition-colors"

// DESPUÉS:
className="w-8 h-8 flex items-center justify-center rounded-lg text-[#64748b] hover:text-[#0f172a] hover:bg-[#f1f5f9] transition-colors"

// Group name — ANTES:
<span className="text-xs font-semibold text-[#9ca3af]">{grupo.name}</span>

// DESPUÉS:
<span className="text-xs font-semibold text-[#475569]">{grupo.name}</span>

// Progress bar track — ANTES:
<div className="h-0.5 rounded-full mb-2 overflow-hidden bg-[#2e3347]">

// DESPUÉS:
<div className="h-0.5 rounded-full mb-2 overflow-hidden bg-[#e2e8f0]">
```

- [x] **Step 5: Actualizar progress bar fill (inline style)**

```tsx
// ANTES:
style={{
  width: isComplete ? '100%' : '0%',
  background: isRequired ? (isComplete ? '#22c55e' : '#ef4444') : '#4f72ff',
}}

// DESPUÉS:
style={{
  width: isComplete ? '100%' : '0%',
  background: isRequired ? (isComplete ? '#16a34a' : '#ef4444') : '#2563eb',
}}
```

- [x] **Step 6: Actualizar option buttons (inline styles)**

```tsx
// Option button style — ANTES:
style={{
  background: isSelected ? 'oklch(28% 0.10 260 / 0.5)' : 'oklch(20% 0.03 252 / 0.5)',
  borderColor: isSelected ? 'oklch(60% 0.18 260)' : 'oklch(35% 0.04 252)',
}}

// DESPUÉS:
style={{
  background: isSelected ? '#eff6ff' : '#f8fafc',
  borderColor: isSelected ? '#2563eb' : '#e2e8f0',
}}

// Radio/checkbox indicator — ANTES:
style={{
  borderRadius: grupo.tipo === 'radio' ? '50%' : '4px',
  borderColor: isSelected ? 'oklch(60% 0.18 260)' : '#4b5563',
}}

// DESPUÉS:
style={{
  borderRadius: grupo.tipo === 'radio' ? '50%' : '4px',
  borderColor: isSelected ? '#2563eb' : '#d1d5db',
}}

// Radio fill — ANTES:
<span className="w-2 h-2 rounded-full bg-[#4f72ff]" />

// DESPUÉS:
<span className="w-2 h-2 rounded-full bg-[#2563eb]" />

// Checkbox tick — ANTES:
<span className="text-[10px] font-bold leading-none text-[#4f72ff]">✓</span>

// DESPUÉS:
<span className="text-[10px] font-bold leading-none text-[#2563eb]">✓</span>

// Option label — ANTES:
<span className="flex-1 text-sm text-[#c8cad4] font-medium">{opt.name}</span>

// DESPUÉS:
<span className="flex-1 text-sm text-[#0f172a] font-medium">{opt.name}</span>

// Option price — ANTES:
<span className="text-xs text-[#4f72ff] shrink-0">+{fmt(opt.precio)}</span>

// DESPUÉS:
<span className="text-xs text-[#2563eb] shrink-0">+{fmt(opt.precio)}</span>
```

- [x] **Step 7: Actualizar footer del dialog**

```tsx
// Footer border — ANTES:
<div className="px-5 py-4 border-t border-[#2e3347] shrink-0 flex flex-col gap-3">

// DESPUÉS:
<div className="px-5 py-4 border-t border-[#e2e8f0] shrink-0 flex flex-col gap-3">

// Total label — ANTES:
<span className="text-sm text-[#9ca3af]">Total</span>

// DESPUÉS:
<span className="text-sm text-[#64748b]">Total</span>

// Total amount — ANTES:
<span className="text-base font-bold text-[#e8eaf0]">{fmt(precioTotal)}</span>

// DESPUÉS:
<span className="text-base font-bold text-[#0f172a]">{fmt(precioTotal)}</span>

// Cancel button — ANTES:
className="flex-1 py-3 rounded-xl border border-[#2e3347] text-sm text-[#9ca3af] hover:border-[#4b5563] transition-colors"

// DESPUÉS:
className="flex-1 py-3 rounded-xl border border-[#e2e8f0] text-sm text-[#64748b] hover:border-[#cbd5e1] transition-colors"
```

- [x] **Step 8: Añadir `resolveConfirmClass` y actualizar confirm button**

El botón de confirmar actualmente tiene `text-white` hardcodeado. En tema claro, cuando está deshabilitado el fondo es `#e2e8f0` (gris claro) y el texto blanco sería invisible. Se necesita una función de módulo (SonarLint S3358 prohíbe ternarios anidados en JSX).

Añadir la función antes de `ComplementDialog`:

```tsx
function resolveConfirmClass(valid: boolean): string {
  return valid ? 'text-white' : 'text-[#64748b]';
}
```

Actualizar el confirm button:

```tsx
// ANTES:
<button
  type="button"
  onClick={handleConfirm}
  disabled={!isValid}
  className="flex-1 py-3 rounded-xl text-sm font-semibold text-white transition-colors disabled:opacity-40"
  style={{ background: isValid ? 'oklch(60% 0.18 260)' : '#374151' }}
>

// DESPUÉS:
<button
  type="button"
  onClick={handleConfirm}
  disabled={!isValid}
  className={`flex-1 py-3 rounded-xl text-sm font-semibold transition-colors disabled:opacity-40 ${resolveConfirmClass(isValid)}`}
  style={{ background: isValid ? '#2563eb' : '#e2e8f0' }}
>
```

- [x] **Step 9: Verificar lint**

```bash
pnpm lint
```

Esperado: sin errores en `MenuPanel.tsx`.

- [x] **Step 10: Commit**

```bash
git add src/components/tpv/MenuPanel.tsx
git commit -m "feat(tpv): tema claro en MenuPanel y ComplementDialog"
```

---

## Self-review

**Spec coverage:**
- [x] Layout bg → Task 1, Step 1
- [x] TpvHeader blanco → Task 1, Steps 2-7
- [x] AccionesActions sidebar blanco, labels visibles → Task 2
- [x] TicketPanel panel blanco, texto oscuro → Task 3
- [x] TicketPanel botones azul/verde oscuro → Task 3, Steps 5-6
- [x] MenuPanel fondo claro, cards blancas → Task 4, Steps 1-3
- [x] ComplementDialog claro → Task 4, Steps 4-8
- [x] Nombre producto uppercase + semibold → Task 4, Step 3

**Placeholder scan:** Sin TBD, sin "similar a", todo el código está completo.

**Type consistency:** `resolveConfirmClass` definida en Task 4 Step 8 y usada en el mismo step. Sin referencias cruzadas entre tareas.
