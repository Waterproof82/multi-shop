# Optimistic UI — borrado de item en mesa y envío de carrito — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que borrar un item del ticket de mesa (camarero suplantando mesa) y enviar el carrito (mesa + checkout general con Redsys) se sientan instantáneos, con rollback seguro si el servidor falla.

**Architecture:** Dos patrones, ambos ya alineados con el spec (`docs/superpowers/specs/2026-08-14-optimistic-ui-mesa-carrito-design.md`):
1. **Overlay optimista** para el borrado de item — un `Map` local que resta cantidades en el render, sin tocar `sessionData`.
2. **Cierre instantáneo + continuación diferida** para el envío del carrito — el drawer se cierra y aparece un overlay de "confirmando" al instante; los items del carrito no se tocan hasta que se conoce el resultado real. Rollback = reabrir el drawer + banner de error.

Ambas funciones de orquestación (`executeMesaOrder`, `processStandardOrderResponse`) ya reciben sus dependencias por parámetro (`handlers`/`opts`) — se extiende ese mismo patrón de inyección para poder testearlas sin montar el árbol completo de `CartDrawer`.

**Tech Stack:** Next.js, React, TypeScript, Vitest + @testing-library/react (proyecto `ui`).

---

## Task 1: Helpers puros del overlay de borrado optimista

**Files:**
- Modify: `src/components/mesa-orders-client.tsx` (agrega funciones exportadas cerca de `mergeOrderItems`, línea ~90)
- Test: `tests/ui/mesa-delete-item-overlay.test.ts` (crear)

- [ ] **Step 1: Escribir los tests que fallan**

```ts
// tests/ui/mesa-delete-item-overlay.test.ts
import { describe, it, expect } from 'vitest';
import {
  mergeKeyFor,
  applyPendingDeleteOverlay,
  withPendingDelete,
  withoutPendingDelete,
  type OrderItem,
} from '@/components/mesa-orders-client';

describe('mergeKeyFor', () => {
  it('combina nombre + precio + complementos ordenados en una key estable', () => {
    expect(
      mergeKeyFor('Tortilla', 5, [
        { nombre: 'Queso', precio: 1 },
        { nombre: 'Bacon', precio: 1 },
      ]),
    ).toBe('Tortilla||5||Bacon,Queso');
  });

  it('el orden de los complementos de entrada no cambia la key', () => {
    const a = mergeKeyFor('Tortilla', 5, [{ nombre: 'Queso', precio: 1 }, { nombre: 'Bacon', precio: 1 }]);
    const b = mergeKeyFor('Tortilla', 5, [{ nombre: 'Bacon', precio: 1 }, { nombre: 'Queso', precio: 1 }]);
    expect(a).toBe(b);
  });

  it('sin complementos, la key termina en ||', () => {
    expect(mergeKeyFor('Agua', 2)).toBe('Agua||2||');
  });
});

describe('withPendingDelete', () => {
  it('agrega una key nueva al mapa', () => {
    const overlay = withPendingDelete(new Map(), 'Tortilla||5||', 2);
    expect(overlay.get('Tortilla||5||')).toBe(2);
  });

  it('acumula sobre una key existente', () => {
    const overlay = withPendingDelete(new Map([['Tortilla||5||', 1]]), 'Tortilla||5||', 2);
    expect(overlay.get('Tortilla||5||')).toBe(3);
  });

  it('no muta el mapa original', () => {
    const original = new Map<string, number>();
    withPendingDelete(original, 'Tortilla||5||', 2);
    expect(original.size).toBe(0);
  });
});

describe('withoutPendingDelete', () => {
  it('al quitar toda la cantidad pendiente, borra la key del mapa', () => {
    const overlay = withoutPendingDelete(new Map([['Tortilla||5||', 2]]), 'Tortilla||5||', 2);
    expect(overlay.has('Tortilla||5||')).toBe(false);
  });

  it('al quitar solo parte, deja el resto', () => {
    const overlay = withoutPendingDelete(new Map([['Tortilla||5||', 3]]), 'Tortilla||5||', 1);
    expect(overlay.get('Tortilla||5||')).toBe(2);
  });

  it('quitar de una key que no existe no rompe (queda en negativo, se trata como 0 en el render)', () => {
    const overlay = withoutPendingDelete(new Map(), 'Tortilla||5||', 1);
    expect(overlay.has('Tortilla||5||')).toBe(false);
  });
});

describe('applyPendingDeleteOverlay', () => {
  const items: OrderItem[] = [
    { nombre: 'Tortilla', precio: 5, cantidad: 3 },
    { nombre: 'Agua', precio: 2, cantidad: 1 },
  ];

  it('sin overlay, devuelve los items tal cual (misma cantidad)', () => {
    const result = applyPendingDeleteOverlay(items, new Map());
    expect(result.map(i => i.cantidad)).toEqual([3, 1]);
  });

  it('resta la cantidad pendiente al item que matchea', () => {
    const result = applyPendingDeleteOverlay(items, new Map([['Tortilla||5||', 1]]));
    expect(result.find(i => i.nombre === 'Tortilla')?.cantidad).toBe(2);
    expect(result.find(i => i.nombre === 'Agua')?.cantidad).toBe(1);
  });

  it('si la cantidad pendiente iguala o supera la cantidad real, el item desaparece', () => {
    const result = applyPendingDeleteOverlay(items, new Map([['Tortilla||5||', 3]]));
    expect(result.find(i => i.nombre === 'Tortilla')).toBeUndefined();
    expect(result).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `pnpm exec vitest run tests/ui/mesa-delete-item-overlay.test.ts`
Expected: FAIL — `mergeKeyFor`/`applyPendingDeleteOverlay`/`withPendingDelete`/`withoutPendingDelete` no existen en `@/components/mesa-orders-client`.

- [ ] **Step 3: Implementar los helpers**

En `src/components/mesa-orders-client.tsx`, exportar la interfaz `OrderItem` (línea 19) y agregar las cuatro funciones justo después de `mergeOrderItems` (línea ~103):

```ts
// línea 19 — agregar `export`
export interface OrderItem {
  nombre: string;
  cantidad: number;
  precio: number;
  tipo_producto?: 'comida' | 'bebida';
  complementos?: { nombre: string; precio: number }[];
  translations?: Record<string, { name?: string } | undefined>;
  cancelled?: boolean;
}
```

```ts
// después de mergeOrderItems (línea ~103)

/**
 * Key estable para matchear un item entre la vista mergeada y el overlay
 * optimista de borrado. Mismo criterio que `mergeOrderItems`.
 */
export function mergeKeyFor(
  nombre: string,
  precio: number,
  complementos?: { nombre: string; precio: number }[],
): string {
  const compsKey = (complementos ?? []).map(c => c.nombre).sort((a, b) => a.localeCompare(b)).join(',');
  return `${nombre}||${precio}||${compsKey}`;
}

/** Suma `cantidad` a la entrada pendiente de `key`, sin mutar el mapa original. */
export function withPendingDelete(overlay: Map<string, number>, key: string, cantidad: number): Map<string, number> {
  const next = new Map(overlay);
  next.set(key, (next.get(key) ?? 0) + cantidad);
  return next;
}

/**
 * Resta `cantidad` a la entrada pendiente de `key`. Si llega a 0 o menos,
 * borra la key. Se usa tanto al confirmar el borrado (éxito) como al
 * revertirlo (fallo) — ver `handleDeleteItem`.
 */
export function withoutPendingDelete(overlay: Map<string, number>, key: string, cantidad: number): Map<string, number> {
  const restante = (overlay.get(key) ?? 0) - cantidad;
  const next = new Map(overlay);
  if (restante > 0) next.set(key, restante); else next.delete(key);
  return next;
}

/**
 * Aplica el overlay optimista sobre la vista mergeada: resta la cantidad
 * pendiente de borrado a cada item y descarta los que llegan a 0. Vista
 * pura para render — no toca `sessionData`.
 */
export function applyPendingDeleteOverlay(items: OrderItem[], overlay: Map<string, number>): OrderItem[] {
  if (overlay.size === 0) return items;
  return items
    .map(item => {
      const pendiente = overlay.get(mergeKeyFor(item.nombre, item.precio, item.complementos)) ?? 0;
      return pendiente > 0 ? { ...item, cantidad: item.cantidad - pendiente } : item;
    })
    .filter(item => item.cantidad > 0);
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `pnpm exec vitest run tests/ui/mesa-delete-item-overlay.test.ts`
Expected: PASS (12 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/mesa-orders-client.tsx tests/ui/mesa-delete-item-overlay.test.ts
git commit -m "feat(mesa): helpers puros para overlay optimista de borrado de item"
```

---

## Task 2: Cablear el overlay en la UI del ticket (borrado optimista real)

**Files:**
- Modify: `src/components/mesa-orders-client.tsx:2391-2394` (nuevo estado), `:2550-2580` (`handleDeleteItem`), `:2601` (`allItems`), `:2761` (banner de error)

- [ ] **Step 1: Agregar el estado del overlay y del banner**

En `src/components/mesa-orders-client.tsx`, junto a los estados existentes de borrado (línea 2391-2394):

```ts
  const [pendingDelete, setPendingDelete] = useState<ItemPendienteDeBorrar | null>(null);
  const [deleteQty, setDeleteQty] = useState(1);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [pendingDeleteOverlay, setPendingDeleteOverlay] = useState<Map<string, number>>(new Map());
  const [deleteBannerError, setDeleteBannerError] = useState<string | null>(null);
```

- [ ] **Step 2: Reescribir `handleDeleteItem` para que sea optimista**

Reemplazar el bloque actual (línea 2550-2580):

```ts
  const handleDeleteItem = useCallback(async () => {
    if (!pendingDelete) return;
    const { nombre, precio, complementos } = pendingDelete;
    const qty = deleteQty;
    const key = mergeKeyFor(nombre, precio, complementos);

    // Optimista: el modal se cierra y el item baja de cantidad ya, sin
    // esperar al servidor. `finally` deshace el overlay tanto en éxito
    // (refresh() ya trajo el dato real) como en fallo (rollback visual).
    setPendingDelete(null);
    setDeleteError(null);
    setDeleteBannerError(null);
    setDeleting(true);
    setPendingDeleteOverlay(prev => withPendingDelete(prev, key, qty));

    try {
      const res = await fetchWithCsrf(`/api/waiter/mesas/${encodeURIComponent(mesaId)}/orders/items`, {
        method: 'DELETE',
        body: JSON.stringify({ nombre, precio, cantidadAEliminar: qty }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: string } | null;
        setDeleteBannerError(body?.error ?? `Error al eliminar (${res.status})`);
        return;
      }
      const body = await res.json().catch(() => null) as { totalRemoved?: number } | null;
      if (!body?.totalRemoved) {
        setDeleteBannerError('No se encontró el ítem en la comanda — puede que ya se haya eliminado.');
        return;
      }
      await refresh();
    } catch {
      setDeleteBannerError('Error de red al eliminar el ítem.');
    } finally {
      setPendingDeleteOverlay(prev => withoutPendingDelete(prev, key, qty));
      setDeleting(false);
    }
  }, [pendingDelete, deleteQty, mesaId, refresh]);
```

- [ ] **Step 3: Aplicar el overlay a `allItems`**

Reemplazar la línea 2601:

```ts
  const allItems = applyPendingDeleteOverlay(
    mergeOrderItems(sessionData?.orders.flatMap((o) => o.items.filter(i => !i.cancelled)) ?? []),
    pendingDeleteOverlay,
  );
```

- [ ] **Step 4: Renderizar el banner de error no bloqueante**

Insertar justo antes de `{/* Column headers */}` (línea 2761), dentro del mismo bloque donde se pinta el ticket:

```tsx
              {isWaiterMode && deleteBannerError && (
                <div
                  role="alert"
                  className="flex items-center justify-between gap-2 mb-2 px-3 py-2 rounded-lg text-xs"
                  style={{ background: "oklch(35% 0.14 25 / 0.12)", color: "oklch(45% 0.18 25)" }}
                >
                  <span>{deleteBannerError}</span>
                  <button
                    type="button"
                    onClick={() => setDeleteBannerError(null)}
                    className="font-bold shrink-0 w-5 h-5 flex items-center justify-center"
                    aria-label="Cerrar aviso"
                  >
                    ×
                  </button>
                </div>
              )}
```

- [ ] **Step 5: Verificar que la suite existente de borrado sigue en verde**

Run: `pnpm exec vitest run tests/compliance/mesa-remove-item.test.ts tests/ui/mesa-delete-item-overlay.test.ts`
Expected: PASS — la lógica del use case (18 tests) no se tocó; los helpers del overlay (12 tests) siguen en verde.

- [ ] **Step 6: Lint + build (REGLA DE ORO)**

Run: `pnpm lint && pnpm build`
Expected: sin errores. No marcar la tarea como completa si falla.

- [ ] **Step 7: Commit**

```bash
git add src/components/mesa-orders-client.tsx
git commit -m "feat(mesa): borrado de item optimista con rollback via overlay"
```

---

## Task 3: `SendingOverlay` — pantalla de transición al enviar el carrito

**Files:**
- Modify: `src/components/cart-drawer.tsx:5` (import), `src/lib/translations.ts` (nueva key `orderSending` en `es`/`en`/`fr`/`it`/`de`)
- Test: `tests/ui/order-sending-overlay.test.tsx` (crear)

- [ ] **Step 1: Escribir el test que falla**

```tsx
// tests/ui/order-sending-overlay.test.tsx
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';
import { SendingOverlay } from '@/components/cart-drawer';

afterEach(() => cleanup());

describe('SendingOverlay', () => {
  it('no renderiza nada cuando show=false', () => {
    const { container } = render(<SendingOverlay show={false} language="es" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('muestra el mensaje de confirmación cuando show=true', () => {
    render(<SendingOverlay show={true} language="es" />);
    expect(screen.getByText('Confirmando pedido...')).toBeInTheDocument();
  });

  it('respeta el idioma', () => {
    render(<SendingOverlay show={true} language="en" />);
    expect(screen.getByText('Confirming order...')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `pnpm exec vitest run tests/ui/order-sending-overlay.test.tsx`
Expected: FAIL — `SendingOverlay` no está exportado desde `@/components/cart-drawer`.

- [ ] **Step 3: Agregar la traducción `orderSending`**

En `src/lib/translations.ts`, agregar la key justo después de `mesaOrderConfirmed` en cada bloque de idioma:

```ts
// es (línea ~760)
    mesaOrderConfirmed: "¡Pedido confirmado!",
    orderSending: "Confirmando pedido...",
```
```ts
// en (línea ~1755)
    mesaOrderConfirmed: "Order confirmed!",
    orderSending: "Confirming order...",
```
```ts
// fr (línea ~2270)
    mesaOrderConfirmed: "Commande confirmée !",
    orderSending: "Confirmation de la commande...",
```
```ts
// it (línea ~2766)
    mesaOrderConfirmed: "Ordine confermato!",
    orderSending: "Conferma dell'ordine in corso...",
```
```ts
// de (línea ~3262)
    mesaOrderConfirmed: "Bestellung bestätigt!",
    orderSending: "Bestellung wird bestätigt...",
```

- [ ] **Step 4: Implementar y exportar `SendingOverlay`**

En `src/components/cart-drawer.tsx`, agregar `Loader2` al import de `lucide-react` (línea 5):

```ts
import { Minus, Plus, Trash2, ShoppingBag, User, Phone, Mail, Check, Gift, UtensilsCrossed, Loader2 } from "lucide-react"
```

Agregar el componente justo después de `OrderToast` (línea ~939):

```tsx
export function SendingOverlay({ show, language }: Readonly<{ show: boolean; language: Language }>) {
  if (!show) return null;
  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center pointer-events-none">
      <div className="bg-card/95 backdrop-blur-md border border-border shadow-2xl rounded-3xl px-10 py-8 flex flex-col items-center gap-4 animate-in fade-in zoom-in-90 duration-300">
        <div className="w-16 h-16 rounded-full bg-primary/10 border-2 border-primary/25 flex items-center justify-center">
          <Loader2 className="size-8 text-primary animate-spin" strokeWidth={2.5} />
        </div>
        <p className="text-base font-bold text-foreground text-center leading-snug">
          {t('orderSending', language)}
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Correr el test y verificar que pasa**

Run: `pnpm exec vitest run tests/ui/order-sending-overlay.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add src/components/cart-drawer.tsx src/lib/translations.ts tests/ui/order-sending-overlay.test.tsx
git commit -m "feat(carrito): componente SendingOverlay para la transicion de envio"
```

---

## Task 4: `executeMesaOrder` — cierre instantáneo + rollback (modo mesa)

**Files:**
- Modify: `src/components/cart-drawer.tsx:868-924` (interfaz `MesaOrderHandlers` + `executeMesaOrder`)
- Test: `tests/ui/execute-mesa-order.test.ts` (crear)

- [ ] **Step 1: Escribir los tests que fallan**

```ts
// tests/ui/execute-mesa-order.test.ts
import { describe, it, expect, vi } from 'vitest';
import { executeMesaOrder, type MesaOrderHandlers } from '@/components/cart-drawer';
import type { CartItem } from '@/lib/cart-context';
import type { MenuItemVM } from '@/core/application/dtos/menu-view-model';

const ITEM: CartItem = {
  cartId: 'c1',
  item: { id: 'p1', name: 'Tortilla', price: 5 } as unknown as MenuItemVM,
  quantity: 1,
};

function buildHandlers(): MesaOrderHandlers & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    setSending: () => calls.push('setSending'),
    closeCart: () => calls.push('closeCart'),
    openCart: () => calls.push('openCart'),
    setQrGateState: () => calls.push('setQrGateState'),
    clearCart: () => calls.push('clearCart'),
    setShowOrderToast: () => calls.push('setShowOrderToast'),
    setErrors: () => calls.push('setErrors'),
    attemptKey: { current: () => 'k', renew: () => {}, reset: () => calls.push('attemptKey.reset') },
  };
}

describe('executeMesaOrder — modo camarero (isWaiterMode=true, sin client token)', () => {
  it('cierra el carrito ANTES de que la promesa de envío resuelva (optimista)', async () => {
    const handlers = buildHandlers();
    let closedBeforeResolve = false;
    const sendFlow = vi.fn(async () => {
      closedBeforeResolve = handlers.calls.includes('closeCart');
      return { ok: true, trackingToken: 'tok', pedidoId: 'p1' };
    });

    await executeMesaOrder('mesa-1', true, [ITEM], 'es', handlers, sendFlow);

    expect(closedBeforeResolve).toBe(true);
  });

  it('éxito: limpia el carrito y muestra el toast, sin reabrir', async () => {
    const handlers = buildHandlers();
    const sendFlow = vi.fn(async () => ({ ok: true, trackingToken: 'tok', pedidoId: 'p1' }));

    await executeMesaOrder('mesa-1', true, [ITEM], 'es', handlers, sendFlow);

    expect(handlers.calls).toContain('clearCart');
    expect(handlers.calls).toContain('setShowOrderToast');
    expect(handlers.calls).not.toContain('openCart');
  });

  it('fallo del servidor: reabre el carrito y muestra el error, sin limpiarlo', async () => {
    const handlers = buildHandlers();
    const sendFlow = vi.fn(async () => ({ ok: false, error: 'stock agotado' }));

    await executeMesaOrder('mesa-1', true, [ITEM], 'es', handlers, sendFlow);

    expect(handlers.calls).toContain('openCart');
    expect(handlers.calls).toContain('setErrors');
    expect(handlers.calls).not.toContain('clearCart');
  });

  it('fallo de red: reabre el carrito y muestra el error', async () => {
    const handlers = buildHandlers();
    const sendFlow = vi.fn(async () => { throw new Error('network down'); });

    await executeMesaOrder('mesa-1', true, [ITEM], 'es', handlers, sendFlow);

    expect(handlers.calls).toContain('openCart');
    expect(handlers.calls).toContain('setErrors');
    expect(handlers.calls).not.toContain('clearCart');
  });
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `pnpm exec vitest run tests/ui/execute-mesa-order.test.ts`
Expected: FAIL — `executeMesaOrder` no está exportado, y no acepta un 6º parámetro `sendFlow`.

- [ ] **Step 3: Implementar — exportar, inyectar `sendMesaOrderFlow` y agregar rollback**

En `src/components/cart-drawer.tsx`, la interfaz (línea 868-876):

```ts
export interface MesaOrderHandlers {
  setSending: (b: boolean) => void;
  closeCart: () => void;
  openCart: () => void;
  setQrGateState: (s: QRGateState | null) => void;
  clearCart: () => void;
  setShowOrderToast: (b: boolean) => void;
  setErrors: (e: { general: string }) => void;
  attemptKey: AttemptKey;
}
```

Reemplazar `executeMesaOrder` completa (línea 878-924):

```ts
export async function executeMesaOrder(
  mesaId: string,
  isWaiterMode: boolean,
  items: CartItem[],
  language: Language,
  handlers: MesaOrderHandlers,
  sendMesaOrderFlowFn: typeof sendMesaOrderFlow = sendMesaOrderFlow,
): Promise<void> {
  let clientToken: string | null = null;
  if (!isWaiterMode) {
    const storedClientToken = getMesaClientToken(mesaId);
    if (!storedClientToken || isMesaClientTokenExpired(storedClientToken.expiresAt)) {
      handlers.closeCart();
      handlers.setQrGateState('TOKEN_EXPIRED');
      return;
    }
    clientToken = storedClientToken.token;
  }

  handlers.setSending(true);
  // Optimista: el carrito se cierra ya, antes de conocer el resultado real.
  // Los items NO se tocan todavía — si falla, no hay nada que restaurar.
  handlers.closeCart();
  try {
    const result = await sendMesaOrderFlowFn(mesaId, clientToken, items, language, handlers.attemptKey);
    if (result.ok && result.trackingToken) {
      // El pedido está confirmado: la clave del intento ya cumplió su función y
      // se descarta. Si no se descartara, el SIGUIENTE pedido de esta mesa
      // reutilizaría la clave y el servidor lo tomaría por un reenvío.
      handlers.attemptKey.reset();
      addTrackingToken(result.trackingToken);
      handlers.clearCart();
      handlers.setShowOrderToast(true);
      setTimeout(() => handlers.setShowOrderToast(false), 2000);
      window.dispatchEvent(new CustomEvent('mesa-order-placed'));
    } else if (result.code === 'SESSION_CLOSED') {
      handlers.setQrGateState('SESSION_CLOSED');
    } else if (result.code === 'TOKEN_EXPIRED') {
      handlers.setQrGateState('TOKEN_EXPIRED');
    } else {
      // Rollback: nunca se encola un pedido para reintento automático (ver
      // CLAUDE.md) — se reabre el carrito intacto y el camarero reintenta a mano.
      handlers.openCart();
      handlers.setErrors({ general: result.error || t('validationOrderError', language) });
    }
  } catch {
    handlers.openCart();
    handlers.setErrors({ general: t('connectionError', language) });
  } finally {
    handlers.setSending(false);
  }
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `pnpm exec vitest run tests/ui/execute-mesa-order.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/cart-drawer.tsx tests/ui/execute-mesa-order.test.ts
git commit -m "feat(carrito): executeMesaOrder cierra optimista y revierte si falla"
```

---

## Task 5: `processStandardOrderResponse` — cierre instantáneo + rollback (checkout general)

**Files:**
- Modify: `src/components/cart-drawer.tsx:672-791`
- Test: `tests/ui/process-standard-order-response.test.ts` (crear)

- [ ] **Step 1: Escribir los tests que fallan**

```ts
// tests/ui/process-standard-order-response.test.ts
import { describe, it, expect, vi } from 'vitest';
import { processStandardOrderResponse } from '@/components/cart-drawer';

function buildOpts(overrides: Partial<Record<string, unknown>> = {}) {
  const calls: string[] = [];
  const sendStandardOrderFlow = vi.fn(async () => ({ ok: true, data: { numeroPedido: 42 } }));
  return {
    calls,
    opts: {
      t: (key: string) => key,
      language: 'es',
      isRestaurant: false,
      pagosPickupHabilitados: false,
      deliveryMethod: null,
      deliveryAddress: '',
      deliveryPostalCode: '',
      deliveryLatitude: null,
      deliveryLongitude: null,
      estimatedFeeCents: null,
      clearCart: () => calls.push('clearCart'),
      closeCart: () => calls.push('closeCart'),
      openCart: () => calls.push('openCart'),
      addTrackingToken: () => calls.push('addTrackingToken'),
      setOrderSuccess: () => calls.push('setOrderSuccess'),
      setErrors: () => calls.push('setErrors'),
      setNombre: () => {},
      setTelefono: () => {},
      setEmail: () => {},
      router: {},
      sendStandardOrderFlow,
      setSending: () => calls.push('setSending'),
      attemptKey: { current: () => 'k', renew: () => {}, reset: () => calls.push('attemptKey.reset') },
      ...overrides,
    },
  };
}

describe('processStandardOrderResponse', () => {
  it('cierra el carrito ANTES de que la promesa de envío resuelva (optimista)', async () => {
    const { calls, opts } = buildOpts();
    let closedBeforeResolve = false;
    opts.sendStandardOrderFlow = vi.fn(async () => {
      closedBeforeResolve = calls.includes('closeCart');
      return { ok: true, data: { numeroPedido: 42 } };
    });

    await processStandardOrderResponse({}, opts as any);

    expect(closedBeforeResolve).toBe(true);
  });

  it('éxito sin trackingToken: muestra el éxito, sin reabrir el carrito', async () => {
    const { calls, opts } = buildOpts();

    await processStandardOrderResponse({}, opts as any);

    expect(calls).toContain('setOrderSuccess');
    expect(calls).not.toContain('openCart');
  });

  it('fallo del servidor (ok=false): reabre el carrito y muestra el error', async () => {
    const { calls, opts } = buildOpts({
      sendStandardOrderFlow: vi.fn(async () => ({ ok: false, data: { error: 'pago rechazado' } })),
    });

    await processStandardOrderResponse({}, opts as any);

    expect(calls).toContain('openCart');
    expect(calls).toContain('setErrors');
    expect(calls).not.toContain('clearCart');
  });

  it('fallo de red: reabre el carrito y muestra el error', async () => {
    const { calls, opts } = buildOpts({
      sendStandardOrderFlow: vi.fn(async () => { throw new Error('network down'); }),
    });

    await processStandardOrderResponse({}, opts as any);

    expect(calls).toContain('openCart');
    expect(calls).toContain('setErrors');
    expect(calls).not.toContain('clearCart');
  });
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `pnpm exec vitest run tests/ui/process-standard-order-response.test.ts`
Expected: FAIL — `processStandardOrderResponse` no está exportada, y no acepta `opts.openCart`.

- [ ] **Step 3: Implementar — exportar, cerrar al inicio, revertir en fallo**

En `src/components/cart-drawer.tsx`, agregar `openCart` al tipo de `opts` (línea ~696) y exportar la función (línea 673):

```ts
// Helper: process standard (non-mesa) order response and side-effects
export async function processStandardOrderResponse(
  payload: Record<string, unknown>,
  opts: {
    t: any;
    language: string;
    isRestaurant: boolean;
    pagosPickupHabilitados: boolean;
    deliveryMethod: DeliveryMethod;
    deliveryAddress: string;
    deliveryPostalCode: string;
    deliveryLatitude: number | null;
    deliveryLongitude: number | null;
    estimatedFeeCents: number | null;
    clearCart: () => void;
    closeCart: () => void;
    openCart: () => void;
    addTrackingToken: (token: string) => void;
    setOrderSuccess: (v: { numeroPedido: number } | null) => void;
    setErrors: (e: any) => void;
    setNombre: (s: string) => void;
    setTelefono: (s: string) => void;
    setEmail: (s: string) => void;
    router: any;
    sendStandardOrderFlow: (payload: Record<string, unknown>, attemptKey: AttemptKey) => Promise<{ ok: boolean; data: any }>;
    setSending: (b: boolean) => void;
    attemptKey: AttemptKey;
  }
): Promise<void> {
  const {
    t,
    language,
    isRestaurant,
    pagosPickupHabilitados,
    deliveryMethod,
    deliveryAddress,
    deliveryPostalCode,
    deliveryLatitude,
    deliveryLongitude,
    estimatedFeeCents,
    clearCart,
    closeCart,
    openCart,
    addTrackingToken,
    setOrderSuccess,
    setErrors,
    setNombre,
    setTelefono,
    setEmail,
    router,
    sendStandardOrderFlow,
    setSending,
    attemptKey,
  } = opts;

  setSending(true);
  // Optimista: el carrito se cierra ya. Los items no se tocan hasta que se
  // conoce el resultado real — si falla, no hay nada que restaurar.
  closeCart();
  try {
    attachDeliveryFields(payload, {
      isRestaurant,
      deliveryMethod,
      deliveryAddress,
      deliveryPostalCode,
      deliveryLatitude,
      deliveryLongitude,
      estimatedFeeCents,
    });

    const { ok, data } = await sendStandardOrderFlow(payload, attemptKey);

    if (!ok) {
      openCart();
      setErrors({ general: data.error || t('validationOrderError', language) });
      return;
    }

    // Confirmado: la clave del intento se descarta para que el siguiente pedido
    // no se confunda con un reenvío de este. Ver `AttemptKey`.
    attemptKey.reset();

    // Requires payment redirect
    if (data.trackingToken && data.pedidoId && requiresRedsysRedirect(pagosPickupHabilitados, deliveryMethod, isRestaurant)) {
      addTrackingToken(data.trackingToken);
      clearCart();
      await submitRedsysPayment(data.pedidoId, language, data.trackingToken, router, addTrackingToken);
      return;
    }

    // Restaurante-specific tracking behavior
    if (data.trackingToken && data.tipo === 'restaurante') {
      addTrackingToken(data.trackingToken);
      clearCart();
      if (window.history.state?.cartOpen) {
        window.history.replaceState({}, '', window.location.href);
      }
      const restauranteTrackingUrl = `/tracking/${data.trackingToken}`;
      setTimeout(() => { window.location.href = restauranteTrackingUrl; }, 0);
      return;
    }

    // Generic tracking redirect
    if (data.trackingToken) {
      redirectToTracking(data.trackingToken, {
        setNombre,
        setTelefono,
        setEmail,
        addTrackingTokenFn: addTrackingToken,
      });
      clearCart();
      return;
    }

    // No tracking token: show success with order number
    setOrderSuccess({ numeroPedido: data.numeroPedido });
  } catch (e) {
    openCart();
    const errorMsg = e instanceof Error ? e.message : t('connectionError', language);
    setErrors({ general: errorMsg || t('connectionError', language) });
  } finally {
    setSending(false);
  }
}
```

Nota: se sacaron los tres `closeCart()` redundantes de las ramas de éxito (Redsys, restaurante, tracking genérico) — el carrito ya está cerrado desde el arranque de la función.

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `pnpm exec vitest run tests/ui/process-standard-order-response.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/cart-drawer.tsx tests/ui/process-standard-order-response.test.ts
git commit -m "feat(carrito): processStandardOrderResponse cierra optimista y revierte si falla"
```

---

## Task 6: Cablear todo en `CartDrawer` (componente)

**Files:**
- Modify: `src/components/cart-drawer.tsx:1215` (handlers de `executeMesaOrder`), `:1246` (opts de `processStandardOrderResponse`), `:1334` (render de `SendingOverlay`)

- [ ] **Step 1: Pasar `openCart` a `executeMesaOrder`**

En `handleConfirmOrder` (línea ~1214), agregar `openCart` al objeto de handlers:

```ts
    if (mesaToken) {
      await executeMesaOrder(mesaInfo?.id ?? mesaToken, isWaiterMode, items, language, {
        setSending, closeCart, openCart, setQrGateState, clearCart, setShowOrderToast, setErrors, attemptKey,
      });
      return;
    }
```

- [ ] **Step 2: Pasar `openCart` a `processStandardOrderResponse`**

En el mismo `handleConfirmOrder` (línea ~1234-1257), agregar `openCart` al objeto de opts:

```ts
    await processStandardOrderResponse(payload, {
      t,
      language,
      isRestaurant,
      pagosPickupHabilitados,
      deliveryMethod,
      deliveryAddress,
      deliveryPostalCode,
      deliveryLatitude,
      deliveryLongitude,
      estimatedFeeCents,
      clearCart,
      closeCart,
      openCart,
      addTrackingToken,
      setOrderSuccess,
      setErrors,
      setNombre,
      setTelefono,
      setEmail,
      router,
      sendStandardOrderFlow,
      setSending,
      attemptKey,
    });
```

Y agregar `openCart` al array de dependencias de `handleConfirmOrder` (línea ~1258, junto a `closeCart`).

- [ ] **Step 3: Renderizar `SendingOverlay`**

Junto a `OrderToast` (línea 1334):

```tsx
      <OrderToast show={showOrderToast} language={language} />
      <SendingOverlay show={sending} language={language} />
```

- [ ] **Step 4: Lint + build (REGLA DE ORO)**

Run: `pnpm lint && pnpm build`
Expected: sin errores. No marcar la tarea como completa si falla.

- [ ] **Step 5: Correr toda la suite de UI nueva + la de mesa, como regresión**

Run: `pnpm exec vitest run tests/ui/mesa-delete-item-overlay.test.ts tests/ui/order-sending-overlay.test.tsx tests/ui/execute-mesa-order.test.ts tests/ui/process-standard-order-response.test.ts tests/compliance/mesa-remove-item.test.ts tests/ui/carrito-por-mesa.test.tsx`
Expected: PASS — todo en verde, incluyendo la suite de aislamiento de carrito por mesa (no debería verse afectada, pero es la más cercana en riesgo).

- [ ] **Step 6: Commit**

```bash
git add src/components/cart-drawer.tsx
git commit -m "feat(carrito): cablear openCart y SendingOverlay en CartDrawer"
```

---

## Self-Review

**Cobertura del spec:**
- Flujo 1 (borrar item) → Tasks 1-2. ✅
- Flujo 2, modo mesa → Tasks 3-4, 6. ✅
- Flujo 2, checkout general → Tasks 3, 5, 6. ✅
- Regla de rollback común (red y servidor tratados igual, sin cola de reintento) → verificada explícitamente en los tests de fallo de Task 4 y 5. ✅
- "Qué NO cambia" del spec (`removeSessionItemUseCase.ts`, `sendMesaOrderFlow`, `sendStandardOrderFlow`, `submitRedsysPayment`, `attemptKey`) → ningún task los modifica; `sendMesaOrderFlow` se sigue usando tal cual, solo se inyecta como parámetro por defecto para poder testear `executeMesaOrder` con un mock. ✅

**Sin placeholders:** todos los steps tienen código completo, comandos exactos y expectativas concretas.

**Consistencia de tipos:** `MesaOrderHandlers.openCart`, `opts.openCart` y `SendingOverlay({ show, language })` usan los mismos nombres en todos los tasks donde aparecen.
