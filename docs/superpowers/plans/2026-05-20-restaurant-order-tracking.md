# Restaurant Order Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add restaurant mode to the multi-tenant platform: pedidos generate a tracking token, the restaurant sets estimated pickup time via Telegram inline buttons, and the customer sees a live tracking page.

**Architecture:** Conditional fork in `PedidoUseCase.create` based on `empresa.tipo`. If `restaurante`: generate tracking_token, send Telegram message with time-selector inline buttons, return token to frontend. Frontend redirects to `/tracking/[token]` instead of showing success dialog. Telegram webhook handles button callbacks and updates estimated time. Tienda behavior is unchanged.

**Tech Stack:** Next.js 16 App Router, Supabase (postgres), TypeScript, Telegram Bot API (MarkdownV2), Zod

**Note:** This project has no automated test setup. Verification steps use `pnpm lint && pnpm build` instead of TDD.

---

## File Map

**Create:**
- `src/app/api/telegram/webhook/route.ts` — Telegram callback_query handler
- `src/app/api/orders/status/route.ts` — Public polling endpoint for tracking page
- `src/app/tracking/[token]/page.tsx` — SSR tracking page (server component)
- `src/components/tracking-page-client.tsx` — Client component with 5s polling
- `src/components/active-order-banner.tsx` — localStorage recovery banner

**Modify:**
- `src/core/domain/entities/types.ts` — Add fields to `Pedido`
- `src/core/domain/repositories/IPedidoRepository.ts` — Add `findByTrackingToken`, `updateEstimatedTime`, update `create` signature
- `src/core/domain/repositories/IEmpresaRepository.ts` — `findByDomain` return type adds `tipo` + `telegram_chat_id`
- `src/core/infrastructure/services/telegram.service.ts` — Accept `chatId` param, add inline buttons variant
- `src/core/infrastructure/database/supabase-pedido.repository.ts` — Implement new methods, update `create`
- `src/core/infrastructure/database/supabase-empresa.repository.ts` — Map `tipo` + `telegram_chat_id` in `findByDomain`
- `src/core/application/use-cases/pedido.use-case.ts` — Restaurant fork in `create`
- `src/app/api/pedidos/route.ts` — Pass tipo/chatId, return trackingToken
- `src/components/cart-drawer.tsx` — Fork post-order: redirect + localStorage
- `src/components/client-menu-page.tsx` — Add `ActiveOrderBanner`

---

## Task 1: DB Migration

**Files:**
- Supabase migration (apply via dashboard SQL editor or Supabase MCP `apply_migration`)

- [ ] **Step 1: Apply migration for `empresas` table**

Run this SQL in the Supabase SQL editor (or via MCP `apply_migration`):

```sql
ALTER TABLE empresas
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'tienda',
  ADD COLUMN IF NOT EXISTS telegram_chat_id text NULL;

COMMENT ON COLUMN empresas.tipo IS 'tienda | restaurante';
COMMENT ON COLUMN empresas.telegram_chat_id IS 'Telegram chat ID for this tenant. Replaces global TELEGRAM_CHAT_ID env var.';
```

- [ ] **Step 2: Apply migration for `pedidos` table**

```sql
ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS tracking_token text UNIQUE NULL,
  ADD COLUMN IF NOT EXISTS estimated_minutes int NULL,
  ADD COLUMN IF NOT EXISTS estimated_ready_at timestamptz NULL;

COMMENT ON COLUMN pedidos.tracking_token IS 'UUID token for public order tracking. Only set for restaurant orders.';
COMMENT ON COLUMN pedidos.estimated_minutes IS 'Estimated preparation minutes, set by restaurant via Telegram.';
COMMENT ON COLUMN pedidos.estimated_ready_at IS 'Calculated: created_at + estimated_minutes.';
```

- [ ] **Step 3: Verify columns exist**

In Supabase SQL editor, confirm:

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'empresas'
  AND column_name IN ('tipo', 'telegram_chat_id');

SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'pedidos'
  AND column_name IN ('tracking_token', 'estimated_minutes', 'estimated_ready_at');
```

Expected: 2 rows for empresas, 3 rows for pedidos.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore(db): add tipo and telegram_chat_id to empresas, tracking fields to pedidos"
```

---

## Task 2: Update `Pedido` Domain Entity

**Files:**
- Modify: `src/core/domain/entities/types.ts`

- [ ] **Step 1: Add tracking fields to `Pedido` interface**

In `src/core/domain/entities/types.ts`, replace the `Pedido` interface (lines 165-180) with:

```ts
export interface Pedido {
  id: string;
  empresa_id: string;
  cliente_id: string | null;
  numero_pedido: number;
  detalle_pedido: PedidoItem[];
  total: number;
  moneda: string | null;
  estado: string;
  created_at: string;
  tracking_token: string | null;
  estimated_minutes: number | null;
  estimated_ready_at: string | null;
  clientes?: {
    nombre: string;
    email: string;
    telefono: string;
  };
}
```

- [ ] **Step 2: Verify build**

```bash
pnpm lint
```

Expected: No new errors related to `Pedido`.

- [ ] **Step 3: Commit**

```bash
git add src/core/domain/entities/types.ts
git commit -m "feat(domain): add tracking_token, estimated_minutes, estimated_ready_at to Pedido"
```

---

## Task 3: Update Repository Interfaces

**Files:**
- Modify: `src/core/domain/repositories/IPedidoRepository.ts`
- Modify: `src/core/domain/repositories/IEmpresaRepository.ts`

- [ ] **Step 1: Update `IPedidoRepository`**

Replace `src/core/domain/repositories/IPedidoRepository.ts` entirely:

```ts
import { Pedido, CartItem, Result } from "../entities/types";

export interface IPedidoRepository {
  findAllByTenant(empresaId: string): Promise<Result<Pedido[]>>;
  findAllByTenantAndMonth(empresaId: string, mes: number, año: number): Promise<Result<Pedido[]>>;
  updateStatus(id: string, empresaId: string, estado: string): Promise<Result<void>>;
  delete(id: string, empresaId: string): Promise<Result<void>>;
  findById(id: string, empresaId: string): Promise<Result<Pedido | null>>;
  findByTrackingToken(token: string): Promise<Result<{ numero_pedido: number; estimated_minutes: number | null; estimated_ready_at: string | null } | null>>;
  updateEstimatedTime(pedidoId: string, minutes: number): Promise<Result<void>>;
  deleteAllByTenant(empresaId: string): Promise<Result<number>>;
  create(
    empresaId: string,
    clienteId: string | null,
    items: CartItem[],
    total: number,
    discountData?: { codigoDescuentoId: string; descuentoPorcentaje: number; totalSinDescuento: number },
    trackingToken?: string
  ): Promise<Result<{ id: string; numero_pedido: number; total: number; trackingToken?: string }>>;
  getStats(empresaId: string, mes: number, año: number): Promise<Result<{
    pedidosHoy: number;
    pedidosMes: number;
    totalHoy: number;
    totalMes: number;
    totalAno: number;
    topPlatos: { nombre: string; cantidad: number; total: number }[];
    topPlatosAno: { nombre: string; cantidad: number; total: number }[];
    pedidosPorDia: { dia: number; pedidos: number; ingresos: number }[];
    clientesNuevos: number;
    clientesRecurrentes: number;
    ticketMedio: number;
    ticketMedioAnterior: number;
    pedidosAnterior: number;
    ingresosAnterior: number;
  }>>;
}
```

- [ ] **Step 2: Update `IEmpresaRepository.findByDomain` return type**

In `src/core/domain/repositories/IEmpresaRepository.ts`, change line 28:

```ts
findByDomain(dominio: string): Promise<Result<{
  id: string;
  nombre: string;
  email_notification: string | null;
  telefono_whatsapp: string | null;
  tipo: string;
  telegram_chat_id: string | null;
} | null>>;
```

- [ ] **Step 3: Commit**

```bash
git add src/core/domain/repositories/IPedidoRepository.ts src/core/domain/repositories/IEmpresaRepository.ts
git commit -m "feat(domain): extend repository interfaces for restaurant tracking"
```

---

## Task 4: Update Telegram Service

**Files:**
- Modify: `src/core/infrastructure/services/telegram.service.ts`

- [ ] **Step 1: Replace `telegram.service.ts` entirely**

```ts
import { Pedido, PedidoItem } from '@/core/domain/entities/types';
import { Result, AppError } from '@/core/domain/entities/types';
import { logger } from '@/core/infrastructure/logging/logger';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

const sanitizeForMarkdown = (text: string | number | null | undefined): string => {
  const textAsString = String(text || '');
  return textAsString.replace(/([_*\[\]()~`>#+\-=|{}.!])/g, '\\$1');
};

const buildOrderMessage = (pedido: Pedido): string => {
  const { clientes: cliente, detalle_pedido: items, total, numero_pedido } = pedido;
  return [
    `*Nuevo Pedido: \\#${numero_pedido}*`,
    `*Cliente:* ${sanitizeForMarkdown(cliente?.nombre)}`,
    `*Teléfono:* ${sanitizeForMarkdown(cliente?.telefono)}`,
    '\\-\\-\\-',
    '*Items:*',
    ...items.map(
      (item: PedidoItem) =>
        `\\- ${item.cantidad}x ${sanitizeForMarkdown(item.nombre)} \\(${sanitizeForMarkdown(item.precio.toFixed(2))} €\\)`
    ),
    '\\-\\-\\-',
    `*Total:* ${sanitizeForMarkdown(total.toFixed(2))} €`,
  ].join('\n');
};

/** Send plain text notification (used by tienda mode) */
export const sendTelegramNotification = async (
  pedido: Pedido,
  chatId: string
): Promise<Result<void, AppError>> => {
  if (!TELEGRAM_BOT_TOKEN) {
    return {
      success: false,
      error: { code: 'TELEGRAM_NOT_CONFIGURED', message: 'TELEGRAM_BOT_TOKEN is not set.', module: 'infrastructure' },
    };
  }

  const message = buildOrderMessage(pedido);

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'MarkdownV2' }),
      }
    );

    if (!response.ok) {
      const responseBody = await response.json().catch(() => response.text());
      const error = await logger.logAndReturnError(
        'TELEGRAM_API_ERROR',
        `Telegram API Error: ${response.status}`,
        'infrastructure',
        'sendTelegramNotification',
        { details: { status: response.status, body: responseBody } }
      );
      return { success: false, error };
    }

    return { success: true, data: undefined };
  } catch (error) {
    const appError = await logger.logFromCatch(error, 'infrastructure', 'sendTelegramNotification');
    return { success: false, error: appError };
  }
};

/** Send notification with inline time-selector buttons (used by restaurante mode) */
export const sendTelegramWithInlineButtons = async (
  pedido: Pedido,
  chatId: string
): Promise<Result<void, AppError>> => {
  if (!TELEGRAM_BOT_TOKEN) {
    return {
      success: false,
      error: { code: 'TELEGRAM_NOT_CONFIGURED', message: 'TELEGRAM_BOT_TOKEN is not set.', module: 'infrastructure' },
    };
  }

  const message = [
    buildOrderMessage(pedido),
    '',
    '⏱ *Selecciona tiempo estimado de preparación:*',
  ].join('\n');

  const inlineKeyboard = [
    [
      { text: '10 min', callback_data: `order:${pedido.id}:10` },
      { text: '15 min', callback_data: `order:${pedido.id}:15` },
    ],
    [
      { text: '20 min', callback_data: `order:${pedido.id}:20` },
      { text: '30 min', callback_data: `order:${pedido.id}:30` },
    ],
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
        `Telegram API Error (inline): ${response.status}`,
        'infrastructure',
        'sendTelegramWithInlineButtons',
        { details: { status: response.status, body: responseBody } }
      );
      return { success: false, error };
    }

    return { success: true, data: undefined };
  } catch (error) {
    const appError = await logger.logFromCatch(error, 'infrastructure', 'sendTelegramWithInlineButtons');
    return { success: false, error: appError };
  }
};

/** Acknowledge a Telegram callback_query */
export const answerCallbackQuery = async (
  callbackQueryId: string,
  text: string
): Promise<void> => {
  if (!TELEGRAM_BOT_TOKEN) return;
  try {
    await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/answerCallbackQuery`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
      }
    );
  } catch {
    // Best-effort — Telegram requires a 200 response regardless
  }
};
```

- [ ] **Step 2: Lint check**

```bash
pnpm lint
```

Expected: No errors in `telegram.service.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/core/infrastructure/services/telegram.service.ts
git commit -m "feat(infra): update telegram service to accept per-tenant chatId and add inline buttons"
```

---

## Task 5: Update Pedido Repository Implementation

**Files:**
- Modify: `src/core/infrastructure/database/supabase-pedido.repository.ts`

- [ ] **Step 1: Update `create` to accept and persist `trackingToken`**

In `supabase-pedido.repository.ts`, replace the `create` method signature and body. Change the method signature from:

```ts
async create(
  empresaId: string,
  clienteId: string | null,
  items: CartItem[],
  total: number,
  discountData?: { codigoDescuentoId: string; descuentoPorcentaje: number; totalSinDescuento: number }
): Promise<Result<{ id: string; numero_pedido: number; total: number }>>
```

To:

```ts
async create(
  empresaId: string,
  clienteId: string | null,
  items: CartItem[],
  total: number,
  discountData?: { codigoDescuentoId: string; descuentoPorcentaje: number; totalSinDescuento: number },
  trackingToken?: string
): Promise<Result<{ id: string; numero_pedido: number; total: number; trackingToken?: string }>>
```

Inside the method body, after the `if (discountData)` block (line ~242), add:

```ts
if (trackingToken) {
  insertPayload.tracking_token = trackingToken;
}
```

And update the final return to include the token:

```ts
return { success: true, data: { id: pedido.id, numero_pedido: pedido.numero_pedido, total: pedido.total, trackingToken } };
```

- [ ] **Step 2: Add `findByTrackingToken` method**

Add this method to `SupabasePedidoRepository` class (before the closing brace):

```ts
async findByTrackingToken(
  token: string
): Promise<Result<{ numero_pedido: number; estimated_minutes: number | null; estimated_ready_at: string | null } | null>> {
  try {
    const { data, error } = await this.supabase
      .from('pedidos')
      .select('numero_pedido, estimated_minutes, estimated_ready_at')
      .eq('tracking_token', token)
      .maybeSingle();

    if (error) {
      await logger.logAndReturnError(
        'DB_SELECT_ERROR',
        error.message,
        'repository',
        'SupabasePedidoRepository.findByTrackingToken',
        { details: { code: error.code } }
      );
      return { success: false, error: { code: 'DB_ERROR', message: 'Error al buscar pedido', module: 'repository', method: 'findByTrackingToken' } };
    }

    return { success: true, data: data || null };
  } catch (e) {
    const appError = await logger.logFromCatch(e, 'repository', 'SupabasePedidoRepository.findByTrackingToken');
    return { success: false, error: appError };
  }
}
```

- [ ] **Step 3: Add `updateEstimatedTime` method**

```ts
async updateEstimatedTime(pedidoId: string, minutes: number): Promise<Result<void>> {
  try {
    const estimatedReadyAt = new Date(Date.now() + minutes * 60 * 1000).toISOString();

    const { error } = await this.supabase
      .from('pedidos')
      .update({ estimated_minutes: minutes, estimated_ready_at: estimatedReadyAt })
      .eq('id', pedidoId);

    if (error) {
      await logger.logAndReturnError(
        'DB_UPDATE_ERROR',
        error.message,
        'repository',
        'SupabasePedidoRepository.updateEstimatedTime',
        { details: { code: error.code, pedidoId } }
      );
      return { success: false, error: { code: 'DB_ERROR', message: 'Error al actualizar tiempo estimado', module: 'repository', method: 'updateEstimatedTime' } };
    }

    return { success: true, data: undefined };
  } catch (e) {
    const appError = await logger.logFromCatch(e, 'repository', 'SupabasePedidoRepository.updateEstimatedTime', { details: { pedidoId } });
    return { success: false, error: appError };
  }
}
```

- [ ] **Step 4: Lint check**

```bash
pnpm lint
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add src/core/infrastructure/database/supabase-pedido.repository.ts
git commit -m "feat(infra): add tracking token support and time estimation to pedido repository"
```

---

## Task 6: Update Empresa Repository

**Files:**
- Modify: `src/core/infrastructure/database/supabase-empresa.repository.ts`

- [ ] **Step 1: Add `tipo` and `telegram_chat_id` to `findByDomain` query**

In `supabase-empresa.repository.ts`, the `findByDomain` method (line ~118) selects `'id, nombre, email_notification, telefono_whatsapp'`. Change that select to:

```ts
.select('id, nombre, email_notification, telefono_whatsapp, tipo, telegram_chat_id')
```

Do this in BOTH the main query and the pedidos-subdomain fallback query (around line ~133). Both places call `.select('id, nombre, email_notification, telefono_whatsapp')`.

Also update the return mapping in both `return` statements from this method. Currently they return `empresa` directly. Supabase already returns the columns — they'll be present on the `data` object. The TypeScript type just needs to be satisfied by the interface update done in Task 3.

- [ ] **Step 2: Verify the return type satisfies the interface**

The interface now expects `{ id, nombre, email_notification, telefono_whatsapp, tipo, telegram_chat_id }`. Supabase returns them as part of the row. The two return lines in `findByDomain` just pass `empresa` / `empresaSubdomain` directly, so TypeScript will pick up the new columns automatically from the updated interface.

- [ ] **Step 3: Lint check**

```bash
pnpm lint
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/core/infrastructure/database/supabase-empresa.repository.ts
git commit -m "feat(infra): expose tipo and telegram_chat_id from empresa repository"
```

---

## Task 7: Update `PedidoUseCase` — Restaurant Fork

**Files:**
- Modify: `src/core/application/use-cases/pedido.use-case.ts`

- [ ] **Step 1: Add import for Telegram service**

At the top of `pedido.use-case.ts`, add:

```ts
import { sendTelegramWithInlineButtons } from '@/core/infrastructure/services/telegram.service';
```

- [ ] **Step 2: Update `create` signature**

The `create` method currently takes `(empresaId: string, data: CreatePedidoDTO)`. Change it to:

```ts
async create(
  empresaId: string,
  data: CreatePedidoDTO,
  empresaTipo: string = 'tienda',
  telegramChatId: string | null = null
): Promise<Result<{ id: string; numero_pedido: number; total: number; trackingToken?: string }>>
```

- [ ] **Step 3: Add tracking token generation inside `create`**

After Step 3 of the existing logic (apply discount) and before Step 4 (create the order), add:

```ts
// Step 3.5: Generate tracking token for restaurant orders
const trackingToken = empresaTipo === 'restaurante' ? crypto.randomUUID() : undefined;
```

- [ ] **Step 4: Pass `trackingToken` to `pedidoRepo.create`**

Change the existing `pedidoRepo.create` call (Step 4) to pass the token as the last argument:

```ts
const pedidoResult = await this.pedidoRepo.create(
  empresaId,
  clienteResult.data.clienteId,
  data.items,
  finalTotal,
  discountData,
  trackingToken
);
```

- [ ] **Step 5: Send Telegram notification with inline buttons for restaurant**

After the `// Step 5: Mark discount code as used` block, add:

```ts
// Step 6: Send Telegram notification
if (empresaTipo === 'restaurante' && telegramChatId && pedidoResult.data) {
  const pedidoParaNotificar = {
    ...pedidoResult.data,
    empresa_id: empresaId,
    detalle_pedido: data.items.map(ci => ({
      producto_id: ci.item?.id,
      nombre: ci.item?.name ?? '',
      precio: ci.item?.price ?? 0,
      cantidad: ci.quantity,
    })),
    cliente_id: clienteResult.data.clienteId,
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
  await sendTelegramWithInlineButtons(pedidoParaNotificar, telegramChatId);
}
```

- [ ] **Step 6: Update final return to include `trackingToken`**

Change the final return line from:

```ts
return { success: true, data: pedidoResult.data };
```

To:

```ts
return { success: true, data: { ...pedidoResult.data, trackingToken } };
```

- [ ] **Step 7: Lint check**

```bash
pnpm lint
```

Expected: No errors.

- [ ] **Step 8: Commit**

```bash
git add src/core/application/use-cases/pedido.use-case.ts
git commit -m "feat(use-case): add restaurant fork to PedidoUseCase.create with tracking token and Telegram inline buttons"
```

---

## Task 8: Update `POST /api/pedidos`

**Files:**
- Modify: `src/app/api/pedidos/route.ts`

- [ ] **Step 1: Pass `tipo` and `telegram_chat_id` to use case**

In `src/app/api/pedidos/route.ts`, the line that calls `pedidoUseCase.create` currently is:

```ts
const pedidoResult = await pedidoUseCase.create(empresa.id, parsed.data);
```

Replace with:

```ts
const pedidoResult = await pedidoUseCase.create(
  empresa.id,
  parsed.data,
  empresa.tipo ?? 'tienda',
  empresa.telegram_chat_id ?? null
);
```

- [ ] **Step 2: Return `trackingToken` in response**

The current response is:

```ts
return NextResponse.json({ success: true, numeroPedido, pedidoId });
```

Replace with:

```ts
const { id: pedidoId, numero_pedido: numeroPedido, trackingToken } = pedidoResult.data;

return NextResponse.json({
  success: true,
  numeroPedido,
  pedidoId,
  ...(trackingToken && { trackingToken }),
});
```

- [ ] **Step 3: Lint check**

```bash
pnpm lint
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/pedidos/route.ts
git commit -m "feat(api): pass empresa tipo to use case and return trackingToken in pedido response"
```

---

## Task 9: Telegram Webhook Endpoint

**Files:**
- Create: `src/app/api/telegram/webhook/route.ts`

- [ ] **Step 1: Create webhook route**

```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { pedidoRepository } from '@/core/infrastructure/database';
import { answerCallbackQuery } from '@/core/infrastructure/services/telegram.service';

const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;

const callbackQuerySchema = z.object({
  callback_query: z.object({
    id: z.string(),
    data: z.string(),
  }),
});

export async function POST(request: Request) {
  // Validate secret token from Telegram header
  if (WEBHOOK_SECRET) {
    const secretHeader = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
    if (secretHeader !== WEBHOOK_SECRET) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: true }); // Always return 200 to Telegram
  }

  const parsed = callbackQuerySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: true }); // Not a callback query — ignore
  }

  const { id: callbackQueryId, data: callbackData } = parsed.data.callback_query;

  // Expected format: order:{pedidoId}:{minutes}
  const match = callbackData.match(/^order:([0-9a-f-]{36}):(\d+)$/);
  if (!match) {
    return NextResponse.json({ ok: true });
  }

  const [, pedidoId, minutesStr] = match;
  const minutes = parseInt(minutesStr, 10);

  if (isNaN(minutes) || minutes <= 0 || minutes > 180) {
    return NextResponse.json({ ok: true });
  }

  await pedidoRepository.updateEstimatedTime(pedidoId, minutes);
  await answerCallbackQuery(callbackQueryId, `⏱ Pedido actualizado a ${minutes} minutos`);

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Add `TELEGRAM_WEBHOOK_SECRET` to env validation**

In `src/core/infrastructure/env-validation.ts`, check if there is an env validation setup and add the new optional variable if applicable. If the file uses a Zod schema, add:

```ts
TELEGRAM_WEBHOOK_SECRET: z.string().optional(),
```

- [ ] **Step 3: Check `src/core/infrastructure/database/index.ts`**

Open `src/core/infrastructure/database/index.ts` and verify that `pedidoRepository` is exported (separate from `pedidoUseCase`). If only `pedidoUseCase` is exported, export the repository directly:

```ts
// If not already present, add:
export { pedidoRepository } from './supabase-pedido.repository'; // or however it's instantiated
```

**Note:** Check the current exports in that file and adapt — do not blindly add this line. The repository instance is likely created there.

- [ ] **Step 4: Lint check**

```bash
pnpm lint
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/telegram/webhook/route.ts
git commit -m "feat(api): add Telegram webhook endpoint for restaurant order time selection"
```

---

## Task 10: Order Status Endpoint

**Files:**
- Create: `src/app/api/orders/status/route.ts`

- [ ] **Step 1: Create status route**

```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { pedidoRepository } from '@/core/infrastructure/database';
import { rateLimitPublic } from '@/core/infrastructure/api/rate-limit';

const tokenSchema = z.string().uuid();

export async function GET(request: Request) {
  const rateLimited = await rateLimitPublic(request);
  if (rateLimited) return rateLimited;

  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');

  const parsed = tokenSchema.safeParse(token);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Token inválido' }, { status: 400 });
  }

  const result = await pedidoRepository.findByTrackingToken(parsed.data);
  if (!result.success) {
    return NextResponse.json({ error: 'Error al buscar pedido' }, { status: 500 });
  }

  if (!result.data) {
    return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 });
  }

  return NextResponse.json({
    numero_pedido: result.data.numero_pedido,
    estimated_minutes: result.data.estimated_minutes,
    estimated_ready_at: result.data.estimated_ready_at,
  });
}
```

- [ ] **Step 2: Lint check**

```bash
pnpm lint
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/orders/status/route.ts
git commit -m "feat(api): add public order status polling endpoint"
```

---

## Task 11: Tracking Page

**Files:**
- Create: `src/components/tracking-page-client.tsx`
- Create: `src/app/tracking/[token]/page.tsx`

- [ ] **Step 1: Create client polling component**

Create `src/components/tracking-page-client.tsx`:

```tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import { Clock, CheckCircle, AlertCircle } from "lucide-react";

interface OrderStatus {
  numero_pedido: number;
  estimated_minutes: number | null;
  estimated_ready_at: string | null;
}

interface TrackingPageClientProps {
  token: string;
  initialStatus: OrderStatus | null;
}

function formatTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) + ' h';
}

export function TrackingPageClient({ token, initialStatus }: TrackingPageClientProps) {
  const [status, setStatus] = useState<OrderStatus | null>(initialStatus);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/orders/status?token=${token}`);
      if (res.status === 404) {
        setError('Pedido no encontrado.');
        return;
      }
      if (!res.ok) return;
      const data: OrderStatus = await res.json();
      setStatus(data);
    } catch {
      // Network error — keep showing last known status
    }
  }, [token]);

  useEffect(() => {
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-4">
        <AlertCircle className="w-12 h-12 text-destructive" />
        <p className="text-lg text-muted-foreground">{error}</p>
      </div>
    );
  }

  if (!status) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-4">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-muted-foreground">Cargando estado del pedido...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center px-4">
      <CheckCircle className="w-16 h-16 text-green-500" />

      <div>
        <p className="text-2xl font-bold text-foreground">Tu pedido está en preparación</p>
        <p className="text-muted-foreground mt-1">Pedido #{status.numero_pedido}</p>
      </div>

      {status.estimated_minutes === null ? (
        <div className="rounded-xl bg-secondary px-6 py-4 max-w-sm">
          <p className="text-secondary-foreground">
            Tu pedido ha sido recibido. En breve recibirás el tiempo estimado de recogida.
          </p>
        </div>
      ) : (
        <div className="rounded-xl bg-secondary px-6 py-5 max-w-sm space-y-3">
          <div className="flex items-center justify-center gap-2">
            <Clock className="w-5 h-5 text-primary" />
            <span className="text-lg font-semibold text-foreground">
              Tiempo estimado: {status.estimated_minutes} minutos
            </span>
          </div>
          {status.estimated_ready_at && (
            <p className="text-muted-foreground">
              Listo aproximadamente a las{' '}
              <span className="font-semibold text-foreground">
                {formatTime(status.estimated_ready_at)}
              </span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create server page**

Create `src/app/tracking/[token]/page.tsx`:

```tsx
import { TrackingPageClient } from "@/components/tracking-page-client";
import { pedidoRepository } from "@/core/infrastructure/database";

interface Props {
  params: Promise<{ token: string }>;
}

export default async function TrackingPage({ params }: Props) {
  const { token } = await params;

  let initialStatus = null;

  // UUID format check before DB query
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token);
  if (isUUID) {
    const result = await pedidoRepository.findByTrackingToken(token);
    if (result.success && result.data) {
      initialStatus = result.data;
    }
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="container mx-auto max-w-lg px-4 py-12">
        <TrackingPageClient token={token} initialStatus={initialStatus} />
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Lint check**

```bash
pnpm lint
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/tracking-page-client.tsx src/app/tracking/[token]/page.tsx
git commit -m "feat(ui): add order tracking page with 5s polling"
```

---

## Task 12: CartDrawer Fork — Redirect + localStorage

**Files:**
- Modify: `src/components/cart-drawer.tsx`

- [ ] **Step 1: Add `useRouter` import**

At the top of `cart-drawer.tsx`, add to existing imports:

```ts
import { useRouter } from "next/navigation";
```

- [ ] **Step 2: Initialize router inside `CartDrawer`**

Inside the `CartDrawer` function component, after the existing state declarations, add:

```ts
const router = useRouter();
```

- [ ] **Step 3: Update `handleConfirmOrder` success branch**

Find the `if (res.ok)` block inside `handleConfirmOrder` (currently around line 175):

```ts
if (res.ok) {
  setOrderSuccess({ numeroPedido: data.numeroPedido });
  // Don't clear cart yet, do it when dialog closes
}
```

Replace with:

```ts
if (res.ok) {
  if (data.trackingToken) {
    // Restaurant mode: save token and redirect to tracking page
    localStorage.setItem('last_order_tracking', data.trackingToken);
    clearCart();
    closeCart();
    router.push(`/tracking/${data.trackingToken}`);
  } else {
    // Tienda mode: show success dialog
    setOrderSuccess({ numeroPedido: data.numeroPedido });
  }
}
```

- [ ] **Step 4: Lint check**

```bash
pnpm lint
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/cart-drawer.tsx
git commit -m "feat(ui): redirect to tracking page after restaurant order, save token to localStorage"
```

---

## Task 13: Active Order Recovery Banner

**Files:**
- Create: `src/components/active-order-banner.tsx`
- Modify: `src/components/client-menu-page.tsx`

- [ ] **Step 1: Create `ActiveOrderBanner` component**

Create `src/components/active-order-banner.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";

export function ActiveOrderBanner() {
  const [token, setToken] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const saved = localStorage.getItem('last_order_tracking');
    if (saved) setToken(saved);
  }, []);

  if (!token) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-md">
      <div className="flex items-center justify-between gap-3 rounded-xl bg-primary text-primary-foreground px-4 py-3 shadow-lg">
        <span className="text-sm font-medium">¿Tienes un pedido en curso?</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push(`/tracking/${token}`)}
            className="text-sm font-semibold underline underline-offset-2 hover:opacity-80 transition-opacity"
          >
            Ver seguimiento
          </button>
          <button
            onClick={() => {
              localStorage.removeItem('last_order_tracking');
              setToken(null);
            }}
            aria-label="Cerrar"
            className="hover:opacity-70 transition-opacity"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add `ActiveOrderBanner` to `client-menu-page.tsx`**

In `src/components/client-menu-page.tsx`, add the import:

```ts
import { ActiveOrderBanner } from "@/components/active-order-banner";
```

Then, inside the `MenuPage` component JSX, just before the closing `</div>` of the root element, add:

```tsx
{showCart && <ActiveOrderBanner />}
```

This ensures the banner only appears on the pedidos subdomain (where `showCart` is true).

- [ ] **Step 3: Final lint + build check**

```bash
pnpm lint && pnpm build
```

Expected: Clean lint, successful build. Fix any TypeScript errors before marking complete.

- [ ] **Step 4: Commit**

```bash
git add src/components/active-order-banner.tsx src/components/client-menu-page.tsx
git commit -m "feat(ui): add active order recovery banner for restaurant subdomain"
```

---

## Spec Coverage Check

| Requirement | Task |
|---|---|
| `tipo` field on empresas | Task 1 + Task 6 |
| `telegram_chat_id` per empresa | Task 1 + Task 6 |
| `tracking_token` on pedidos | Task 1 + Task 5 |
| `estimated_minutes` / `estimated_ready_at` | Task 1 + Task 5 |
| Telegram service accepts `chatId` param | Task 4 |
| Inline buttons in Telegram message | Task 4 |
| Restaurant fork in `PedidoUseCase` | Task 7 |
| API returns `trackingToken` | Task 8 |
| Telegram webhook handler | Task 9 |
| Public status polling endpoint | Task 10 |
| Tracking page with 5s polling | Task 11 |
| Time in Spanish format `21:35 h` | Task 11 |
| CartDrawer redirect + localStorage | Task 12 |
| Recovery banner | Task 13 |
| Rate limit on public endpoint | Task 10 (uses existing `rateLimitPublic`) |
| `tracking_token` not exposing `id` | Task 10 (response only has `numero_pedido`) |

## Env Variables Required

Add to `.env.local` and production secrets:

```
TELEGRAM_BOT_TOKEN=          # Already exists
TELEGRAM_WEBHOOK_SECRET=     # New — set when registering the webhook with Telegram
# TELEGRAM_CHAT_ID is deprecated — remove after migrating empresa rows
```
