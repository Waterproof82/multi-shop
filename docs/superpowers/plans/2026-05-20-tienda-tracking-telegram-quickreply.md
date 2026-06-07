# Tienda Tracking + Telegram Quick Reply Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Differentiate Telegram behavior and tracking by subdomain/tipo — `pedidos` subdomain keeps time-selector buttons, all other domains send quick-reply buttons; `tienda` tipo gets a persistent banner + static tracking page.

**Architecture:** The `isPedidos` flag is detected in `api/pedidos/route.ts` by comparing raw domain vs stripped domain, then threaded into the use case. The use case branches into three paths: restaurante+pedidos (current), restaurante+other (quick replies, no tracking), tienda (quick replies + tracking token). The tracking page uses the `tipo` field returned by `/api/orders/status` to decide which UI to render. The banner reacts to new tokens via a custom DOM event.

**Tech Stack:** Next.js 16, TypeScript, Supabase, Telegram Bot API, Zod, Tailwind v4, lucide-react

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/lib/domain-utils.ts` | Modify | Export `isPedidosDomain(domain)` helper |
| `src/core/infrastructure/services/telegram.service.ts` | Modify | Add `sendTelegramWithQuickReplies` |
| `src/app/api/telegram/webhook/route.ts` | Modify | Handle `quick_reply:*` callbacks |
| `src/core/infrastructure/database/supabase-pedido.repository.ts` | Modify | Return `tipo` from `findByTrackingToken` |
| `src/core/application/use-cases/pedido.use-case.ts` | Modify | Add `esPedidos` param, branch Telegram + tracking token |
| `src/app/api/pedidos/route.ts` | Modify | Detect `isPedidos`, pass to use case, return `tipo` |
| `src/app/api/orders/status/route.ts` | Modify | Return `tipo` in response |
| `src/lib/translations.ts` | Modify | Add 4 new keys × 5 languages |
| `src/components/tracking-page-client.tsx` | Modify | Tienda static view |
| `src/components/active-order-banner.tsx` | Modify | Tienda handling, dismiss button, custom event listener |
| `src/components/cart-drawer.tsx` | Modify | Route by `tipo`, dispatch `tracking-token-added` event |

---

### Task 1: Add `isPedidosDomain` to domain-utils

**Files:**
- Modify: `src/lib/domain-utils.ts`

- [ ] **Step 1: Add the exported helper**

Replace the entire file content:

```typescript
import { headers } from 'next/headers';

export function parseMainDomain(domain: string): string {
  const isPedidos = domain.startsWith('pedidos.') || domain.endsWith('-pedidos');
  return isPedidos
    ? domain.replace(/^pedidos\./, '').replace(/-pedidos$/, '')
    : domain;
}

export function isPedidosDomain(domain: string): boolean {
  return domain !== parseMainDomain(domain);
}

export async function getDomainFromHeaders(): Promise<string> {
  const headersList = await headers();
  const host = headersList.get('host');
  if (!host) return '';
  return host.replace(/^www\./, '').toLowerCase().split(':')[0];
}
```

- [ ] **Step 2: Verify lint**

Run: `pnpm lint`
Expected: no errors in `domain-utils.ts`

- [ ] **Step 3: Commit**

```bash
git add src/lib/domain-utils.ts
git commit -m "feat(domain): export isPedidosDomain helper"
```

---

### Task 2: Add `sendTelegramWithQuickReplies` to telegram service

**Files:**
- Modify: `src/core/infrastructure/services/telegram.service.ts`

- [ ] **Step 1: Add the function after `sendTelegramWithInlineButtons`**

Insert after line 134 (after the closing `};` of `sendTelegramWithInlineButtons`):

```typescript
/** Send notification with quick-reply buttons (used by tienda mode and non-pedidos restaurante) */
export const sendTelegramWithQuickReplies = async (
  pedido: Pedido,
  chatId: string
): Promise<Result<{ messageId: number }, AppError>> => {
  if (!TELEGRAM_BOT_TOKEN) {
    return {
      success: false,
      error: { code: 'TELEGRAM_NOT_CONFIGURED', message: 'TELEGRAM_BOT_TOKEN is not set.', module: 'infrastructure' },
    };
  }

  const message = buildOrderMessage(pedido);

  const inlineKeyboard = [
    [{ text: '💬 Te contestaré lo más pronto posible', callback_data: `quick_reply:${pedido.id}:soon` }],
    [{ text: '📞 Te llamo ahora en cuanto tenga un momento', callback_data: `quick_reply:${pedido.id}:call` }],
  ];

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: 'MarkdownV2',
          reply_markup: { inline_keyboard: inlineKeyboard },
        }),
      }
    );

    if (!response.ok) {
      const responseBody = await response.json().catch(() => response.text());
      const error = await logger.logAndReturnError(
        'TELEGRAM_API_ERROR',
        `Telegram API Error (quick-reply): ${response.status}`,
        'infrastructure',
        'sendTelegramWithQuickReplies',
        { details: { status: response.status, body: responseBody } }
      );
      return { success: false, error };
    }

    const json = await response.json() as { ok: boolean; result: { message_id: number } };
    return { success: true, data: { messageId: json.result.message_id } };
  } catch (error) {
    const appError = await logger.logFromCatch(error, 'infrastructure', 'sendTelegramWithQuickReplies');
    return { success: false, error: appError };
  }
};
```

- [ ] **Step 2: Verify lint**

Run: `pnpm lint`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/core/infrastructure/services/telegram.service.ts
git commit -m "feat(telegram): add sendTelegramWithQuickReplies"
```

---

### Task 3: Handle `quick_reply:*` in the Telegram webhook

**Files:**
- Modify: `src/app/api/telegram/webhook/route.ts`

- [ ] **Step 1: Add quick_reply handler before the `order:` match block**

The file currently has the `order:` match at line 74. Insert the following block **before** that match (after the `noop` handler):

```typescript
  // Handle quick reply acknowledgement
  const quickReplyMatch = callbackData.match(/^quick_reply:([0-9a-f-]{36}):(soon|call)$/);
  if (quickReplyMatch) {
    const [, , action] = quickReplyMatch;
    const responseText = action === 'soon'
      ? '💬 Te contestaré lo más pronto posible'
      : '📞 Te llamo ahora en cuanto tenga un momento';
    await answerCallbackQuery(callbackQueryId, responseText);
    if (message) {
      const updatedText = `${message.text ?? ''}\n\n${sanitizeMarkdown(responseText)}`;
      await editMessageText(String(message.chat.id), message.message_id, updatedText, []);
    }
    return NextResponse.json({ ok: true });
  }
```

- [ ] **Step 2: Add `sanitizeMarkdown` helper at the top of the file (after imports)**

The webhook needs to escape the response text for MarkdownV2. Add this helper after the imports:

```typescript
const sanitizeMarkdown = (text: string): string =>
  text.replace(/([_*\[\]()~`>#+\-=|{}.!])/g, '\\$1');
```

- [ ] **Step 3: Verify lint**

Run: `pnpm lint`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/app/api/telegram/webhook/route.ts
git commit -m "feat(telegram): handle quick_reply callbacks in webhook"
```

---

### Task 4: Return `tipo` from `findByTrackingToken`

**Files:**
- Modify: `src/core/infrastructure/database/supabase-pedido.repository.ts`

- [ ] **Step 1: Update the select query to include `tipo` from empresas**

Find the `findByTrackingToken` method. The `.select(...)` call currently reads:

```typescript
.select('id, numero_pedido, estimated_minutes, estimated_ready_at, telegram_message_id, detalle_pedido, empresas(telegram_chat_id)')
```

Replace with:

```typescript
.select('id, numero_pedido, estimated_minutes, estimated_ready_at, telegram_message_id, detalle_pedido, empresas(telegram_chat_id, tipo)')
```

- [ ] **Step 2: Update the return type signature**

The method return type currently includes `items: { nombre: string; cantidad: number; precio: number }[]`. Add `tipo: string` to the return type object:

```typescript
async findByTrackingToken(
  token: string
): Promise<Result<{ id: string; numero_pedido: number; estimated_minutes: number | null; estimated_ready_at: string | null; telegram_message_id: string | null; telegram_chat_id: string | null; tipo: string; items: { nombre: string; translations?: { en?: { name: string }; fr?: { name: string }; it?: { name: string }; de?: { name: string } }; cantidad: number; precio: number }[] } | null>>
```

- [ ] **Step 3: Map `tipo` in the return value**

In the `return { success: true, data: { ... } }` block, add:

```typescript
tipo: (empresa?.['tipo'] as string) ?? 'tienda',
```

The full return object becomes:

```typescript
return {
  success: true,
  data: {
    id: raw['id'] as string,
    numero_pedido: raw['numero_pedido'] as number,
    estimated_minutes: (raw['estimated_minutes'] as number | null) ?? null,
    estimated_ready_at: (raw['estimated_ready_at'] as string | null) ?? null,
    telegram_message_id: (raw['telegram_message_id'] as string | null) ?? null,
    telegram_chat_id: (empresa?.['telegram_chat_id'] as string | null) ?? null,
    tipo: (empresa?.['tipo'] as string) ?? 'tienda',
    items: ((raw['detalle_pedido'] as { nombre: string; translations?: { en?: { name: string }; fr?: { name: string }; it?: { name: string }; de?: { name: string } }; cantidad: number; precio: number }[] | null) ?? []),
  },
};
```

- [ ] **Step 4: Verify lint**

Run: `pnpm lint`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add src/core/infrastructure/database/supabase-pedido.repository.ts
git commit -m "feat(repository): return tipo from findByTrackingToken"
```

---

### Task 5: Update use case — `esPedidos` param, tracking token for tienda, Telegram branching

**Files:**
- Modify: `src/core/application/use-cases/pedido.use-case.ts`

- [ ] **Step 1: Add `esPedidos` parameter to `create`**

Find the `create` method signature:

```typescript
async create(
  empresaId: string,
  data: CreatePedidoDTO,
  empresaTipo: string = 'tienda',
  telegramChatId: string | null = null
): Promise<Result<{ id: string; numero_pedido: number; total: number; trackingToken?: string }>>
```

Replace with:

```typescript
async create(
  empresaId: string,
  data: CreatePedidoDTO,
  empresaTipo: string = 'tienda',
  telegramChatId: string | null = null,
  esPedidos: boolean = false
): Promise<Result<{ id: string; numero_pedido: number; total: number; trackingToken?: string }>>
```

- [ ] **Step 2: Update tracking token generation**

Find:

```typescript
const trackingToken = empresaTipo === 'restaurante' ? crypto.randomUUID() : undefined;
```

Replace with:

```typescript
const trackingToken = (empresaTipo === 'restaurante' && esPedidos) || empresaTipo === 'tienda'
  ? crypto.randomUUID()
  : undefined;
```

- [ ] **Step 3: Update the import of Telegram service**

Find the import at the top of the file. It currently imports `sendTelegramWithInlineButtons`. Add `sendTelegramWithQuickReplies`:

```typescript
import { sendTelegramWithInlineButtons, sendTelegramWithQuickReplies } from '@/core/infrastructure/services/telegram.service';
```

- [ ] **Step 4: Replace the Telegram notification block**

Find:

```typescript
// Step 6: Send Telegram notification
if (empresaTipo === 'restaurante' && telegramChatId && pedidoResult.data) {
  const pedidoParaNotificar: import('@/core/domain/entities/types').Pedido = {
    // ...
  };
  const telegramResult = await sendTelegramWithInlineButtons(pedidoParaNotificar, telegramChatId);
  if (telegramResult.success) {
    await this.pedidoRepo.saveTelegramMessageId(pedidoResult.data.id, telegramResult.data.messageId);
  }
}
```

Replace the entire block with:

```typescript
// Step 6: Send Telegram notification
if (telegramChatId && pedidoResult.data) {
  const pedidoParaNotificar: import('@/core/domain/entities/types').Pedido = {
    id: pedidoResult.data.id,
    empresa_id: empresaId,
    cliente_id: clienteResult.data.clienteId,
    numero_pedido: pedidoResult.data.numero_pedido,
    detalle_pedido: data.items.map(ci => ({
      producto_id: ci.item?.id,
      nombre: ci.item?.name ?? '',
      precio: ci.item?.price ?? 0,
      cantidad: ci.quantity,
    })),
    total: pedidoResult.data.total,
    moneda: null,
    estado: 'pendiente',
    created_at: new Date().toISOString(),
    tracking_token: trackingToken ?? null,
    estimated_minutes: null,
    estimated_ready_at: null,
    clientes: {
      nombre: data.nombre,
      email: data.email ?? '',
      telefono: data.telefono,
    },
  };

  if (empresaTipo === 'restaurante' && esPedidos) {
    const telegramResult = await sendTelegramWithInlineButtons(pedidoParaNotificar, telegramChatId);
    if (telegramResult.success) {
      await this.pedidoRepo.saveTelegramMessageId(pedidoResult.data.id, telegramResult.data.messageId);
    }
  } else {
    const telegramResult = await sendTelegramWithQuickReplies(pedidoParaNotificar, telegramChatId);
    if (telegramResult.success) {
      await this.pedidoRepo.saveTelegramMessageId(pedidoResult.data.id, telegramResult.data.messageId);
    }
  }
}
```

- [ ] **Step 5: Verify lint**

Run: `pnpm lint`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/core/application/use-cases/pedido.use-case.ts
git commit -m "feat(use-case): add esPedidos param, branch telegram, generate tracking for tienda"
```

---

### Task 6: Update `/api/pedidos` route — detect `isPedidos`, pass to use case, return `tipo`

**Files:**
- Modify: `src/app/api/pedidos/route.ts`

- [ ] **Step 1: Import `isPedidosDomain`**

Find:

```typescript
import { parseMainDomain, getDomainFromHeaders } from '@/lib/domain-utils';
```

Replace with:

```typescript
import { parseMainDomain, isPedidosDomain, getDomainFromHeaders } from '@/lib/domain-utils';
```

- [ ] **Step 2: Detect `isPedidos` before `mainDomain`**

Find:

```typescript
const domain = await getDomainFromHeaders();
const mainDomain = parseMainDomain(domain);
```

Replace with:

```typescript
const domain = await getDomainFromHeaders();
const isPedidos = isPedidosDomain(domain);
const mainDomain = parseMainDomain(domain);
```

- [ ] **Step 3: Pass `isPedidos` to the use case**

Find:

```typescript
const pedidoResult = await pedidoUseCase.create(
  empresa.id,
  parsed.data,
  empresa.tipo ?? 'tienda',
  empresa.telegram_chat_id ?? null
);
```

Replace with:

```typescript
const pedidoResult = await pedidoUseCase.create(
  empresa.id,
  parsed.data,
  empresa.tipo ?? 'tienda',
  empresa.telegram_chat_id ?? null,
  isPedidos
);
```

- [ ] **Step 4: Return `tipo` in the response**

Find:

```typescript
return NextResponse.json({
    success: true,
    numeroPedido,
    pedidoId,
    ...(trackingToken && { trackingToken }),
});
```

Replace with:

```typescript
return NextResponse.json({
    success: true,
    numeroPedido,
    pedidoId,
    tipo: empresa.tipo ?? 'tienda',
    ...(trackingToken && { trackingToken }),
});
```

- [ ] **Step 5: Verify lint**

Run: `pnpm lint`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/app/api/pedidos/route.ts
git commit -m "feat(api): detect isPedidos, return tipo in pedidos route"
```

---

### Task 7: Return `tipo` from `/api/orders/status`

**Files:**
- Modify: `src/app/api/orders/status/route.ts`

- [ ] **Step 1: Destructure `tipo` from result and include it in the response**

Find:

```typescript
const { id, numero_pedido, estimated_minutes, estimated_ready_at, telegram_message_id, telegram_chat_id, items } = result.data;
```

Replace with:

```typescript
const { id, numero_pedido, estimated_minutes, estimated_ready_at, telegram_message_id, telegram_chat_id, items, tipo } = result.data;
```

Find:

```typescript
return NextResponse.json({ numero_pedido, estimated_minutes, estimated_ready_at, items });
```

Replace with:

```typescript
return NextResponse.json({ numero_pedido, estimated_minutes, estimated_ready_at, items, tipo });
```

- [ ] **Step 2: Verify lint**

Run: `pnpm lint`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/app/api/orders/status/route.ts
git commit -m "feat(api): return tipo in orders/status response"
```

---

### Task 8: Add translations for tienda tracking + banner

**Files:**
- Modify: `src/lib/translations.ts`

Add these 4 keys to all 5 language blocks. Insert them after the `bannerCta` key in each language.

- [ ] **Step 1: Add to `es` block (after `bannerCta: "Toca para ver el seguimiento"`)**

```typescript
tiendaBannerText: "Tienes un pedido recibido",
tiendaBannerCta: "Toca para ver los detalles",
tiendaTrackingTitle: "Pedido recibido",
tiendaTrackingMessage: "En breve nos pondremos en contacto para procesarlo.",
```

- [ ] **Step 2: Add to `en` block (after `bannerCta: "Tap to track your order"`)**

```typescript
tiendaBannerText: "You have a received order",
tiendaBannerCta: "Tap to view the details",
tiendaTrackingTitle: "Order received",
tiendaTrackingMessage: "We will contact you shortly to process it.",
```

- [ ] **Step 3: Add to `fr` block (after `bannerCta: "Appuyez pour suivre votre commande"`)**

```typescript
tiendaBannerText: "Vous avez une commande reçue",
tiendaBannerCta: "Appuyez pour voir les détails",
tiendaTrackingTitle: "Commande reçue",
tiendaTrackingMessage: "Nous vous contacterons sous peu pour la traiter.",
```

- [ ] **Step 4: Add to `it` block (after `bannerCta: "Tocca per tracciare il tuo ordine"`)**

```typescript
tiendaBannerText: "Hai un ordine ricevuto",
tiendaBannerCta: "Tocca per vedere i dettagli",
tiendaTrackingTitle: "Ordine ricevuto",
tiendaTrackingMessage: "Ti contatteremo a breve per elaborarlo.",
```

- [ ] **Step 5: Add to `de` block (after `bannerCta: "Tippe um deine Bestellung zu verfolgen"`)**

```typescript
tiendaBannerText: "Du hast eine eingegangene Bestellung",
tiendaBannerCta: "Tippe um die Details zu sehen",
tiendaTrackingTitle: "Bestellung eingegangen",
tiendaTrackingMessage: "Wir werden uns in Kürze bei dir melden, um sie zu bearbeiten.",
```

- [ ] **Step 6: Verify lint**

Run: `pnpm lint`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add src/lib/translations.ts
git commit -m "feat(i18n): add tienda tracking and banner translations"
```

---

### Task 9: Tienda static view in tracking page

**Files:**
- Modify: `src/components/tracking-page-client.tsx`

- [ ] **Step 1: Add `tipo` to `OrderStatus` interface**

Find:

```typescript
interface OrderStatus {
  numero_pedido: number;
  estimated_minutes: number | null;
  estimated_ready_at: string | null;
  items: OrderItem[];
}
```

Replace with:

```typescript
interface OrderStatus {
  numero_pedido: number;
  estimated_minutes: number | null;
  estimated_ready_at: string | null;
  items: OrderItem[];
  tipo: string;
}
```

- [ ] **Step 2: Add `tipo` to `normalizeStatus`**

Find:

```typescript
function normalizeStatus(data: OrderStatus): OrderStatus {
  return {
    ...data,
    items: (data.items ?? []).map(item => ({
      ...item,
      cantidad: Number(item.cantidad),
      precio: Number(item.precio),
    })),
  };
}
```

The spread `...data` already copies `tipo`, no change needed here. But add a fallback in case the API returns no `tipo`:

```typescript
function normalizeStatus(data: OrderStatus): OrderStatus {
  return {
    ...data,
    tipo: data.tipo ?? 'restaurante',
    items: (data.items ?? []).map(item => ({
      ...item,
      cantidad: Number(item.cantidad),
      precio: Number(item.precio),
    })),
  };
}
```

- [ ] **Step 3: Add tienda view in the primary order section**

In the primary order render block, the current structure is:

```
primaryOrder.error → error state
!primaryOrder.status → loading
primaryReady → ready state (PartyPopper / CheckCircle)
else → preparation state
```

Add a tienda branch **before** the `primaryReady` check. Find:

```typescript
        ) : primaryReady ? (
          <>
            <CheckCircle className="w-16 h-16 text-green-500" />
```

Replace the entire ternary chain for the non-error, non-loading states:

```typescript
        ) : primaryOrder.status.tipo === 'tienda' ? (
          <>
            <CheckCircle className="w-16 h-16 text-green-500" />
            <div>
              <p className="text-2xl font-bold text-foreground">{t('tiendaTrackingTitle', lang)}</p>
              <p className="text-muted-foreground mt-1">{t('trackingOrderPrefix', lang)} #{primaryOrder.status.numero_pedido}</p>
            </div>
            <div className="rounded-xl bg-secondary px-6 py-4 max-w-sm w-full">
              <p className="text-secondary-foreground">{t('tiendaTrackingMessage', lang)}</p>
            </div>
            <ItemsList items={primaryOrder.status.items} language={language} />
          </>
        ) : primaryReady ? (
          <>
            <CheckCircle className="w-16 h-16 text-green-500" />
```

- [ ] **Step 4: Verify lint**

Run: `pnpm lint`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add src/components/tracking-page-client.tsx
git commit -m "feat(tracking): add tienda static view"
```

---

### Task 10: Update `ActiveOrderBanner` — tienda support, dismiss, custom event

**Files:**
- Modify: `src/components/active-order-banner.tsx`

- [ ] **Step 1: Replace entire file content**

```typescript
"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ChefHat, ShoppingBag, X } from "lucide-react";
import { getTrackingTokens, removeTrackingToken, isOrderExpired } from "@/lib/order-tracking";
import { useLanguage } from "@/lib/language-context";
import { t } from "@/lib/translations";

interface OrderEntry {
  token: string;
  tipo: string;
}

export function ActiveOrderBanner() {
  const [orders, setOrders] = useState<OrderEntry[]>([]);
  const router = useRouter();
  const { language } = useLanguage();

  const checkTokens = useCallback(async () => {
    const stored = getTrackingTokens();
    if (stored.length === 0) { setOrders([]); return; }

    const results = await Promise.all(
      stored.map(async (token): Promise<OrderEntry | null> => {
        try {
          const res = await fetch(`/api/orders/status?token=${token}`);
          if (res.status === 404) { removeTrackingToken(token); return null; }
          if (!res.ok) return { token, tipo: 'restaurante' };
          const data = await res.json();
          const tipo: string = data.tipo ?? 'restaurante';
          if (tipo === 'restaurante' && isOrderExpired(data.estimated_ready_at)) {
            removeTrackingToken(token);
            return null;
          }
          return { token, tipo };
        } catch {
          return { token, tipo: 'restaurante' };
        }
      })
    );

    setOrders(results.filter((r): r is OrderEntry => r !== null));
  }, []);

  useEffect(() => {
    checkTokens();
    window.addEventListener('tracking-token-added', checkTokens);
    return () => window.removeEventListener('tracking-token-added', checkTokens);
  }, [checkTokens]);

  const handleDismissTienda = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const tiendaOrder = orders.find(o => o.tipo === 'tienda');
    if (!tiendaOrder) return;
    removeTrackingToken(tiendaOrder.token);
    setOrders(prev => prev.filter(o => o.token !== tiendaOrder.token));
  }, [orders]);

  if (orders.length === 0) return null;

  const hasTienda = orders.some(o => o.tipo === 'tienda');
  const primaryToken = orders[0].token;

  const bannerText = hasTienda
    ? t('tiendaBannerText', language)
    : orders.length === 1
      ? t('bannerSingular', language)
      : t('bannerPlural', language).replace('{count}', String(orders.length));

  const bannerCta = hasTienda
    ? t('tiendaBannerCta', language)
    : t('bannerCta', language);

  const Icon = hasTienda ? ShoppingBag : ChefHat;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-md">
      <div
        className="flex items-center gap-3 rounded-2xl px-4 py-3 shadow-xl cursor-pointer active:scale-95 transition-transform"
        style={{ backgroundColor: '#f97316', color: '#fff' }}
        onClick={() => router.push(`/tracking/${primaryToken}`)}
        role="button"
        aria-label={bannerCta}
      >
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 shrink-0">
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold leading-tight">{bannerText}</p>
          <p className="text-xs opacity-90 mt-0.5">{bannerCta}</p>
        </div>
        {hasTienda && (
          <button
            type="button"
            onClick={handleDismissTienda}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20 hover:bg-white/30 transition-colors shrink-0"
            aria-label={t('close', language)}
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify lint**

Run: `pnpm lint`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/components/active-order-banner.tsx
git commit -m "feat(banner): tienda support, dismiss button, react to tracking-token-added event"
```

---

### Task 11: Update `cart-drawer` — route by `tipo`, dispatch event

**Files:**
- Modify: `src/components/cart-drawer.tsx`

- [ ] **Step 1: Replace the success branch in `handleSubmit`**

Find the current success block:

```typescript
      if (res.ok) {
        if (data.trackingToken) {
          // Restaurant mode: save token and redirect to tracking page
          addTrackingToken(data.trackingToken);
          clearCart();
          // Clear cartOpen from history state so closeCart doesn't trigger history.back()
          if (window.history.state?.cartOpen) {
            window.history.replaceState({}, '', window.location.href);
          }
          closeCart();
          router.push(`/tracking/${data.trackingToken}`);
        } else {
          // Tienda mode: show success dialog
          setOrderSuccess({ numeroPedido: data.numeroPedido });
        }
```

Replace with:

```typescript
      if (res.ok) {
        if (data.trackingToken && data.tipo === 'restaurante') {
          // Restaurant + pedidos: redirect to tracking page
          addTrackingToken(data.trackingToken);
          clearCart();
          if (window.history.state?.cartOpen) {
            window.history.replaceState({}, '', window.location.href);
          }
          closeCart();
          router.push(`/tracking/${data.trackingToken}`);
        } else if (data.trackingToken) {
          // Tienda: save token for persistent banner, show success dialog
          addTrackingToken(data.trackingToken);
          window.dispatchEvent(new Event('tracking-token-added'));
          setOrderSuccess({ numeroPedido: data.numeroPedido });
        } else {
          // Fallback: show success dialog only
          setOrderSuccess({ numeroPedido: data.numeroPedido });
        }
```

- [ ] **Step 2: Verify lint**

Run: `pnpm lint`
Expected: no errors

- [ ] **Step 3: Final build check**

Run: `pnpm build`
Expected: build succeeds (ignore "Skipping validation of types" warning)

- [ ] **Step 4: Commit**

```bash
git add src/components/cart-drawer.tsx
git commit -m "feat(cart): route by tipo, dispatch tracking-token-added for tienda orders"
```
