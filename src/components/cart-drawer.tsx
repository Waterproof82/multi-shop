"use client"

import { useState, useCallback, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Minus, Plus, Trash2, ShoppingBag, User, Phone, Mail, Check, Gift, UtensilsCrossed } from "lucide-react"
import { useReducedMotion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { RippleButton } from "@/components/ui/ripple-button"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useCart, type CartItem } from "@/lib/cart-context"
import { useLanguage, type Language } from "@/lib/language-context"
import { t } from "@/lib/translations"
import { DeliveryMethodSelector } from "@/components/DeliveryMethodSelector"
import { formatPrice } from "@/lib/format-price"
import { COUNTRY_CODES, DEFAULT_COUNTRY_CODE } from "@/core/domain/constants/country-codes"
import { getTrackingTokens, addTrackingToken } from "@/lib/order-tracking";
import { QRScannerGate, type QRGateState } from '@/components/qr-scanner-gate';

const MESA_CLIENT_TOKEN_KEY = (mesaId: string) => `mesa_token_${mesaId}`;

type PaseKey = 'primer' | 'segundo' | 'postre';
const PASE_BADGE: Record<PaseKey, { bg: string; text: string }> = {
  primer:  { bg: 'oklch(24% 0.14 45)',  text: 'oklch(82% 0.20 45)'  },
  segundo: { bg: 'oklch(22% 0.12 252)', text: 'oklch(78% 0.18 252)' },
  postre:  { bg: 'oklch(22% 0.12 148)', text: 'oklch(76% 0.20 148)' },
};
const PASE_LABEL: Record<PaseKey, string> = { primer: '1er', segundo: '2º', postre: 'Postre' };

function groupItemsByPase<T extends { pase?: PaseKey }>(cartItems: T[]): Map<PaseKey | undefined, T[]> {
  const groups = new Map<PaseKey | undefined, T[]>();
  for (const ci of cartItems) {
    const key = ci.pase;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(ci);
  }
  return groups;
}

function getMesaClientToken(mesaId: string): { token: string; expiresAt: string } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(MESA_CLIENT_TOKEN_KEY(mesaId));
    if (!raw) return null;
    return JSON.parse(raw) as { token: string; expiresAt: string };
  } catch {
    return null;
  }
}

type DeliveryMethod = 'recogida' | 'delivery' | null;

// Helper: send standard (non-mesa) order and return response data
async function sendStandardOrderFlow(payload: Record<string, unknown>) {
  const res = await fetch('/api/pedidos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

function isMesaClientTokenExpired(expiresAt: string): boolean {
  return new Date(expiresAt) <= new Date();
}

function storeMesaClientToken(mesaId: string, token: string, expiresAt: string): void {
  sessionStorage.setItem(MESA_CLIENT_TOKEN_KEY(mesaId), JSON.stringify({ token, expiresAt }));
}

interface MesaInfo {
  id: string;
  numero: number;
  nombre: string | null;
  empresa_id: string;
}

type TranslationKey = keyof typeof import('@/lib/translations').translations.es;
type TranslateFn = (key: TranslationKey, language: Language) => string;

function discountBorderClass(error: string | null, valid: { valid: boolean; porcentaje: number } | null): string {
  if (error) return 'border-destructive';
  if (valid?.valid) return 'border-green-500';
  return '';
}

function discountDescribedBy(error: string | null, valid: { valid: boolean; porcentaje: number } | null): string | undefined {
  if (error) return 'discount-error';
  if (valid?.valid) return 'discount-valid';
  return undefined;
}

function validateNameInput(name: string, translate: TranslateFn, language: Language): string | undefined {
  const trimmed = name.trim();
  if (!trimmed) return translate("validationNameRequired", language);
  if (trimmed.length < 2) return translate("validationNameMin", language);
  if (trimmed.length > 100) return translate("validationNameMax", language);
  if (!/^[\p{L}\s'-]+$/u.test(trimmed)) return translate("validationNameFormat", language);
  return undefined;
}

function validatePhoneInput(phone: string, translate: TranslateFn, language: Language): string | undefined {
  const trimmed = phone.trim();
  if (!trimmed) return translate("validationPhoneRequired", language);
  const digitsOnly = trimmed.replaceAll(/\D/g, '');
  if (digitsOnly.length < 9) return translate("validationPhoneMin", language);
  if (digitsOnly.length > 15) return translate("validationPhoneMax", language);
  return undefined;
}

function resolveDeliveryError(
  isRestaurant: boolean,
  deliveryMethod: DeliveryMethod,
  deliveryLatitude: number | null,
  deliveryLongitude: number | null,
  translate: TranslateFn,
  language: Language
): string | undefined {
  if (isRestaurant && deliveryMethod === null) {
    return translate('deliveryMethodTitle', language);
  }
  if (isRestaurant && deliveryMethod === 'delivery' && (deliveryLatitude === null || deliveryLongitude === null)) {
    return translate('deliverySelectValidAddress', language);
  }
  return undefined;
}

function mesaBadgeLabel(mesaInfo: MesaInfo | null, mesaError: boolean, label: string): string {
  if (mesaInfo) {
    const mesaNamePart = mesaInfo.nombre ? ` — ${mesaInfo.nombre}` : '';
    return `${label} ${mesaInfo.numero}${mesaNamePart}`;
  }
  if (mesaError) {
    return `${label} —`;
  }
  return `${label}…`;
}

function orderButtonLabel(sending: boolean, mesaToken: string | null, translate: TranslateFn, language: Language): string {
  if (sending) { return translate('sending', language); }
  if (mesaToken) { return translate('mesaPlaceOrder', language); }
  return translate('sendOrder', language);
}

function getItemAnimationClass(justAdded: boolean | undefined, justRemoved: boolean | undefined, reduceMotion: boolean): string {
  if (reduceMotion) return '';
  if (justAdded) return 'animate-cart-item-add';
  if (justRemoved) return 'animate-cart-item-remove';
  return '';
}

function mapCartItemPayload(ci: CartItem) {
  return {
    item: { id: ci.item.id, name: ci.item.name, price: ci.item.price, translations: ci.item.translations },
    quantity: ci.quantity,
    selectedComplements: ci.selectedComplements?.map(c => ({ id: c.id, name: c.name, price: c.price })),
    note: ci.note,
  };
}

function applySessionStorageWaiter(
  setMesaToken: (id: string) => void,
  setMesaInfo: (info: MesaInfo) => void,
  setIsWaiterMode: (b: boolean) => void,
): boolean {
  try {
    const raw = sessionStorage.getItem('waiter_mesa');
    if (!raw) return false;
    const stored = JSON.parse(raw) as { mesaId: string; mesaNumero: number; mesaNombre: string | null };
    setMesaToken(stored.mesaId);
    setMesaInfo({ id: stored.mesaId, numero: stored.mesaNumero, nombre: stored.mesaNombre, empresa_id: '' });
    setIsWaiterMode(true);
    return true;
  } catch {
    return false;
  }
}

async function sendMesaOrderFlow(
  mesaId: string,
  clientToken: string | null,
  items: CartItem[],
  language: Language,
): Promise<{ ok: boolean; trackingToken?: string; pedidoId?: string; error?: string | null; code?: string | null }> {
  if (items.length === 0) return { ok: false };

  const orderHeaders: HeadersInit = { 'Content-Type': 'application/json', ...(clientToken ? { 'Authorization': `Bearer ${clientToken}` } : {}) };
  const orderGroups = Array.from(groupItemsByPase(items).entries());
  const [firstGroup, ...restGroups] = orderGroups;
  const [firstPase, firstGroupItems] = firstGroup!;

  const res = await fetch('/api/pedidos', {
    method: 'POST',
    headers: orderHeaders,
    body: JSON.stringify({
      tipo: 'mesa',
      mesa_id: mesaId,
      ...(firstPase ? { pase: firstPase } : {}),
      items: firstGroupItems.map(mapCartItemPayload),
      idioma: language,
    }),
  });

  if (res.status === 401) {
    const body = await res.json().catch(() => ({}));
    return { ok: false, code: body.code ?? null };
  }

  const data = await res.json().catch(() => ({}));

  if (res.ok && data.trackingToken) {
    try {
      const storageKey = `mesa_orders_${mesaId}`;
      const existing = JSON.parse(localStorage.getItem(storageKey) ?? '[]');
      existing.push({
        pedidoId: data.pedidoId ?? data.id,
        trackingToken: data.trackingToken,
        items: items.map((ci: CartItem) => ({ name: ci.item.name, quantity: ci.quantity, price: ci.item.price })),
        total: items.reduce((s: number, ci: CartItem) => {
          const compPrice = ci.selectedComplements?.reduce((sc: number, c: { price: number }) => sc + c.price, 0) ?? 0;
          return s + (ci.item.price + compPrice) * ci.quantity;
        }, 0),
        timestamp: Date.now(),
      });
      localStorage.setItem(storageKey, JSON.stringify(existing));
    } catch {
      // ignore storage errors
    }

    const extraFetches = restGroups.map(([pase, groupItems]) =>
      fetch('/api/pedidos', {
        method: 'POST',
        headers: orderHeaders,
        body: JSON.stringify({ tipo: 'mesa', mesa_id: mesaId, ...(pase ? { pase } : {}), items: groupItems.map(mapCartItemPayload), idioma: language }),
      }).catch(() => null)
    );

    await Promise.all(extraFetches);

    return { ok: true, trackingToken: data.trackingToken, pedidoId: data.pedidoId ?? data.id };
  }

  return { ok: false, error: data.error || null };
}

// Helper: attach delivery fields to order payload (extracted for complexity reduction)
function attachDeliveryFields(
  payload: Record<string, unknown>,
  opts: {
    isRestaurant: boolean;
    deliveryMethod: DeliveryMethod;
    deliveryAddress: string;
    deliveryPostalCode: string;
    deliveryLatitude: number | null;
    deliveryLongitude: number | null;
    estimatedFeeCents: number | null;
  }
) {
  const { isRestaurant, deliveryMethod, deliveryAddress, deliveryPostalCode, deliveryLatitude, deliveryLongitude, estimatedFeeCents } = opts;
  if (isRestaurant && deliveryMethod) {
    Object.assign(payload, {
      origen: deliveryMethod,
      direccion_entrega: deliveryMethod === 'delivery' ? deliveryAddress : undefined,
      codigo_postal: deliveryMethod === 'delivery' ? deliveryPostalCode : undefined,
      latitude_entrega: deliveryMethod === 'delivery' ? deliveryLatitude : undefined,
      longitude_entrega: deliveryMethod === 'delivery' ? deliveryLongitude : undefined,
      estimated_delivery_fee_cents: deliveryMethod === 'delivery' ? estimatedFeeCents : undefined,
    });
  }
}

// Helper: determine if order requires redirect to Redsys payment gateway
function requiresRedsysRedirect(
  pagosPickupHabilitados: boolean,
  deliveryMethod: DeliveryMethod,
  isRestaurant: boolean
): boolean {
  if (deliveryMethod === 'delivery') return true;
  return pagosPickupHabilitados && (deliveryMethod === 'recogida' || !isRestaurant);
}

// Helper: submit to Redsys and handle payment form
async function submitRedsysPayment(
  pedidoId: any,
  language: string,
  trackingToken: string,
  router: any,
  addTrackingTokenFn: (token: string) => void
): Promise<void> {
  try {
    const redsysRes = await fetch('/api/redsys/initiate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pedidoId, lang: language }),
    });
    if (redsysRes.ok) {
      const formData = await redsysRes.json();
      const redsysUrl = process.env.NEXT_PUBLIC_REDSYS_URL ?? 'https://sis-t.redsys.es:25443/sis/realizarPago';
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = redsysUrl;
      const fields: Record<string, string> = {
        Ds_SignatureVersion: formData.DS_SIGNATURE_VERSION,
        Ds_MerchantParameters: formData.DS_MERCHANT_PARAMETERS,
        Ds_Signature: formData.DS_SIGNATURE,
      };
      for (const [name, value] of Object.entries(fields)) {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = name;
        input.value = value;
        form.appendChild(input);
      }
      document.body.appendChild(form);
      form.submit();
      return;
    }
  } catch (redsysError) {
    // Log silently and fall back to tracking page
    if (process.env.NODE_ENV === 'development') {
      console.warn('Redsys payment initiation failed:', redsysError);
    }
  }
  addTrackingTokenFn(trackingToken);
  router.push(`/tracking/${trackingToken}`);
}

// Helper: redirect to tracking page and reset form state
function redirectToTracking(
  trackingToken: string,
  opts: {
    setNombre: (s: string) => void;
    setTelefono: (s: string) => void;
    setEmail: (s: string) => void;
    addTrackingTokenFn: (token: string) => void;
  }
): void {
  const { setNombre, setTelefono, setEmail, addTrackingTokenFn } = opts;
  addTrackingTokenFn(trackingToken);
  setNombre('');
  setTelefono('');
  setEmail('');
  if (window.history.state?.cartOpen) {
    window.history.replaceState({}, '', window.location.href);
  }
  const trackingUrl = `/tracking/${trackingToken}`;
  setTimeout(() => { window.location.href = trackingUrl; }, 0);
}

// Helper: process standard (non-mesa) order response and side-effects
async function processStandardOrderResponse(
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
    addTrackingToken: (token: string) => void;
    setOrderSuccess: (v: { numeroPedido: number } | null) => void;
    setErrors: (e: any) => void;
    setNombre: (s: string) => void;
    setTelefono: (s: string) => void;
    setEmail: (s: string) => void;
    router: any;
    sendStandardOrderFlow: (payload: Record<string, unknown>) => Promise<{ ok: boolean; data: any }>;
    setSending: (b: boolean) => void;
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
    addTrackingToken,
    setOrderSuccess,
    setErrors,
    setNombre,
    setTelefono,
    setEmail,
    router,
    sendStandardOrderFlow,
    setSending,
  } = opts;

  setSending(true);
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

    const { ok, data } = await sendStandardOrderFlow(payload);

    if (!ok) {
      setErrors({ general: data.error || t('validationOrderError', language) });
      return;
    }

    // Requires payment redirect
    if (data.trackingToken && data.pedidoId && requiresRedsysRedirect(pagosPickupHabilitados, deliveryMethod, isRestaurant)) {
      addTrackingToken(data.trackingToken);
      clearCart();
      closeCart();
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
      closeCart();
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
      closeCart();
      return;
    }

    // No tracking token: show success with order number
    setOrderSuccess({ numeroPedido: data.numeroPedido });
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : t('connectionError', language);
    setErrors({ general: errorMsg || t('connectionError', language) });
  } finally {
    setSending(false);
  }
}

function computeIsDeliveryIncomplete(
  isRestaurant: boolean | undefined,
  mesaToken: string | null,
  deliveryMethod: DeliveryMethod,
  deliveryLatitude: number | null,
  estimatedFeeCents: number | null,
): boolean {
  return !!(isRestaurant && !mesaToken && deliveryMethod === 'delivery' && (deliveryLatitude === null || estimatedFeeCents === null));
}

function computeCartTotals(
  deliveryMethod: DeliveryMethod,
  estimatedFeeCents: number | null,
  discountValid: { valid: boolean; porcentaje: number } | null,
  totalPrice: number,
): { deliveryFee: number; discountedPrice: number; grandTotal: number } {
  const isDelivery = deliveryMethod === 'delivery';
  const deliveryFee = (isDelivery && estimatedFeeCents ? estimatedFeeCents : 0) / 100;
  const discountedPrice = discountValid?.valid
    ? Math.round(totalPrice * (1 - discountValid.porcentaje / 100) * 100) / 100
    : totalPrice;
  return { deliveryFee, discountedPrice, grandTotal: discountedPrice + deliveryFee };
}

function showNoPaymentBanner(
  items: CartItem[],
  isWaiterMode: boolean,
  deliveryMethod: DeliveryMethod,
  pagosPickupHabilitados: boolean | undefined,
  isRestaurant: boolean | undefined,
): boolean {
  if (items.length === 0 || isWaiterMode) return false;
  if (deliveryMethod === 'delivery') return false;
  if (pagosPickupHabilitados && (deliveryMethod === 'recogida' || !isRestaurant)) return false;
  return true;
}

function getActiveOrdersBodyText(count: number, lang: Language): string {
  if (count === 1) return t('activeOrdersDialogBodySingular', lang);
  return t('activeOrdersDialogBodyPlural', lang).replace('{count}', String(count));
}

function resolveActiveMesaId(mesaInfo: MesaInfo | null, mesaToken: string): string {
  return mesaInfo?.id ?? mesaToken;
}

function showDeliverySelector(mesaToken: string | null, isRestaurant: boolean | undefined): boolean {
  return !mesaToken && !!isRestaurant;
}

function showDiscountSection(mesaToken: string | null): boolean {
  return !mesaToken;
}

function showDeliveryCostRow(isDelivery: boolean, deliveryFee: number): boolean {
  return isDelivery && deliveryFee > 0;
}

function grandTotalColorClass(discountValid: { valid: boolean } | null): string {
  return discountValid?.valid ? 'text-green-600 dark:text-green-400' : 'text-foreground';
}

function isSubmitDisabled(sending: boolean, mesaToken: string | null, mesaError: boolean, isDeliveryIncomplete: boolean): boolean {
  return sending || (mesaToken !== null && mesaError) || isDeliveryIncomplete;
}

function shouldShowQrGate(
  qrGateState: QRGateState | null,
  mesaToken: string | null,
  isWaiterMode: boolean,
): boolean {
  return qrGateState !== null && mesaToken !== null && !isWaiterMode;
}

function OrderToast({ show, language }: Readonly<{ show: boolean; language: Language }>) {
  if (!show) return null;
  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center pointer-events-none">
      <div className="bg-card/95 backdrop-blur-md border border-border shadow-2xl rounded-3xl px-10 py-8 flex flex-col items-center gap-4 animate-in fade-in zoom-in-90 duration-300">
        <div className="w-16 h-16 rounded-full bg-primary/10 border-2 border-primary/25 flex items-center justify-center">
          <Check className="size-8 text-primary" strokeWidth={2.5} />
        </div>
        <p className="text-base font-bold text-foreground text-center leading-snug">
          {t('mesaOrderConfirmed', language)}
        </p>
      </div>
    </div>
  );
}

function EmptyCartContent({ language, shouldReduceMotion, closeCart }: Readonly<{
  language: Language;
  shouldReduceMotion: boolean;
  closeCart: () => void;
}>) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 text-muted-foreground px-4">
      <div className={`relative ${shouldReduceMotion ? '' : 'animate-empty-float'}`}>
        <ShoppingBag className="size-12 opacity-20" />
        <span className="absolute inset-0 flex items-center justify-center text-2xl opacity-30">+</span>
      </div>
      <div className="text-center">
        <p className="text-base font-medium text-foreground">{t("emptyCart", language)}</p>
        <p className="text-sm text-muted-foreground mt-1 max-w-[240px]">{t("addDishesToStart", language)}</p>
      </div>
      <button
        onClick={() => {
          closeCart();
          document.getElementById('menu')?.scrollIntoView({ behavior: shouldReduceMotion ? 'auto' : 'smooth' });
        }}
        className="mt-2 px-6 py-3 bg-primary text-primary-foreground rounded-full font-medium hover:bg-primary/90 active:scale-[0.98] transition-all duration-150 min-h-[44px]"
      >
        {t("viewMenu", language)}
      </button>
    </div>
  );
}

interface CartDrawerProps {
  isRestaurant?: boolean;
  pagosPickupHabilitados?: boolean;
  deliveryHabilitado?: boolean;
}

export function CartDrawer({ isRestaurant = false, pagosPickupHabilitados = false, deliveryHabilitado = false }: Readonly<CartDrawerProps>) {
  const {
    items,
    updateQuantity,
    removeItem,
    clearCart,

    totalPrice,
    isCartOpen,
    openCart,
    closeCart
  } = useCart()
  const { language } = useLanguage()
  const router = useRouter();
  const shouldReduceMotion = useReducedMotion() ?? false;
  const [sending, setSending] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState<{ numeroPedido: number } | null>(null);
  const [activeOrderTokens, setActiveOrderTokens] = useState<string[]>([]);
  const [showActiveOrdersDialog, setShowActiveOrdersDialog] = useState(false);
  const [mesaToken, setMesaToken] = useState<string | null>(null);
  const [mesaInfo, setMesaInfo] = useState<MesaInfo | null>(null);
  const [mesaError, setMesaError] = useState(false);
  const [isWaiterMode, setIsWaiterMode] = useState(false);
  const [qrGateState, setQrGateState] = useState<QRGateState | null>(null);
  const [showOrderToast, setShowOrderToast] = useState(false);



  // Detect ?mesa= param (client-side only, SSR safe)
  // Falls back to sessionStorage so waiter mode survives navigation without ?mesa= in the URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('mesa');
    const shouldOpenCart = params.get('cart') === 'open';

    if (token) {
      setMesaToken(token);
      // Always check waiter mode from sessionStorage before the async fetch.
      // /api/mesas searches by id (not token column), so it succeeds for waiter
      // navigations and would never reach the old fallback path.
      const isWaiter = applySessionStorageWaiter(setMesaToken, setMesaInfo, setIsWaiterMode);
      if (shouldOpenCart) openCart();
      fetch(`/api/mesas?token=${encodeURIComponent(token)}`)
        .then(async (res) => {
          if (!res.ok) { if (!isWaiter) { setMesaError(true); } return; }
          const data = await res.json() as MesaInfo;
          setMesaInfo(data);
        })
        .catch(() => { if (!isWaiter) setMesaError(true); });
      return;
    }

    applySessionStorageWaiter(setMesaToken, setMesaInfo, setIsWaiterMode);
  // openCart is stable (useCallback with no deps) — safe to include
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setActiveOrderTokens(getTrackingTokens());
  }, [isCartOpen]);


  const [discountCode, setDiscountCode] = useState('');
  const [discountValid, setDiscountValid] = useState<{ valid: boolean; porcentaje: number } | null>(null);
  const [discountError, setDiscountError] = useState<string | null>(null);
  const [validatingDiscount, setValidatingDiscount] = useState(false);

  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [countryCode, setCountryCode] = useState(DEFAULT_COUNTRY_CODE);
  const [email, setEmail] = useState('');
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>(null);
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryPostalCode, setDeliveryPostalCode] = useState('');
  const [deliveryLatitude, setDeliveryLatitude] = useState<number | null>(null);
  const [deliveryLongitude, setDeliveryLongitude] = useState<number | null>(null);
  const [estimatedFeeCents, setEstimatedFeeCents] = useState<number | null>(null);
  const [errors, setErrors] = useState<{ nombre?: string; telefono?: string; delivery?: string; general?: string }>({});

  const handleConfirmOrder = useCallback(async () => {
    setErrors({});

    // Mesa mode: skip PII validation, use mesa submit path
    if (mesaToken) {
      const mesaId = mesaInfo?.id ?? mesaToken;
      let clientToken: string | null = null;
      if (!isWaiterMode) {
        const storedClientToken = getMesaClientToken(mesaId);
        if (!storedClientToken || isMesaClientTokenExpired(storedClientToken.expiresAt)) {
          closeCart();
          setQrGateState('TOKEN_EXPIRED');
          return;
        }
        clientToken = storedClientToken.token;
      }

      setSending(true);
      try {
        const result = await sendMesaOrderFlow(mesaId, clientToken, items, language);
        if (result.ok && result.trackingToken) {
          addTrackingToken(result.trackingToken);
          clearCart();
          closeCart();
          setShowOrderToast(true);
          setTimeout(() => setShowOrderToast(false), 2000);
          window.dispatchEvent(new CustomEvent('mesa-order-placed'));
        } else if (result.code === 'SESSION_CLOSED') {
          closeCart();
          setQrGateState('SESSION_CLOSED');
        } else if (result.code === 'TOKEN_EXPIRED') {
          closeCart();
          setQrGateState('TOKEN_EXPIRED');
        } else {
          setErrors({ general: result.error || t('validationOrderError', language) });
        }
      } catch {
        setErrors({ general: t('connectionError', language) });
      } finally {
        setSending(false);
      }
      return;
    }

    // Standard (non-mesa) flow: validate PII
    const nombreError = validateNameInput(nombre, t, language);
    const telefonoError = validatePhoneInput(telefono, t, language);
    const deliveryError = resolveDeliveryError(isRestaurant, deliveryMethod, deliveryLatitude, deliveryLongitude, t, language);
    if (nombreError || telefonoError || deliveryError) {
      setErrors({ nombre: nombreError, telefono: telefonoError, delivery: deliveryError });
      return;
    }

    const selectedCountry = COUNTRY_CODES.find(c => c.code === countryCode);
    const dialCode = selectedCountry?.dialCode || '34';

    const payload: Record<string, unknown> = {
      items: items.map(mapCartItemPayload),
      nombre,
      telefono: dialCode + telefono.replaceAll(/\D/g, ''),
      email,
      idioma: language,
      codigoDescuento: discountCode || undefined,
    };

    // Delegate the heavy response handling to a module-level helper
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
      addTrackingToken,
      setOrderSuccess,
      setErrors,
      setNombre,
      setTelefono,
      setEmail,
      router,
      sendStandardOrderFlow,
      setSending,
    });
  }, [mesaToken, mesaInfo, isWaiterMode, nombre, telefono, countryCode, email, deliveryMethod, deliveryAddress, deliveryPostalCode, deliveryLatitude, deliveryLongitude, isRestaurant, pagosPickupHabilitados, items, language, discountCode, estimatedFeeCents, clearCart, closeCart, router]);

// Signal "Activa" state: when a real customer (non-waiter) adds their first item
  useEffect(() => {
    if (isWaiterMode || !mesaToken || items.length !== 1) return;
    const mesaId = mesaInfo?.id ?? mesaToken;
    void fetch(`/api/mesas/${encodeURIComponent(mesaId)}/activate`, { method: 'POST' });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length]);

  const isDeliveryIncomplete = computeIsDeliveryIncomplete(isRestaurant, mesaToken, deliveryMethod, deliveryLatitude, estimatedFeeCents);

  const handleDialogClose = useCallback((open: boolean) => {
    if (!open) {
      setOrderSuccess(null);
      clearCart();
      // Reset form fields
      setNombre('');
      setTelefono('');
      setEmail('');
      setDeliveryMethod(null);
      setDeliveryAddress('');
      setDeliveryPostalCode('');
      setDeliveryLatitude(null);
      setDeliveryLongitude(null);
      setEstimatedFeeCents(null);
      setDiscountCode('');
      setDiscountValid(null);
      setDiscountError(null);
      closeCart();
    }
  }, [clearCart, closeCart]);

  const handleValidateDiscount = useCallback(async () => {
    if (!discountCode.trim()) return;
    if (!email.trim()) {
      setDiscountError(t("discountCodeEmailRequired", language));
      return;
    }
    setValidatingDiscount(true);
    setDiscountError(null);
    try {
      const res = await fetch('/api/descuento/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigo: discountCode, email }),
      });
      const data = await res.json();
      if (!res.ok) {
        const errorTranslations: Record<string, string> = {
          CODE_NOT_FOUND: t("discountCodeInvalid", language),
          CODE_EXPIRED: t("discountCodeExpired", language),
          CODE_ALREADY_USED: t("discountCodeUsed", language),
          EMAIL_MISMATCH: t("discountCodeEmailMismatch", language),
        };
        setDiscountError(data.error && data.code
          ? (errorTranslations[data.code] ?? t("discountCodeInvalid", language))
          : (data.error ?? t("discountCodeInvalid", language)));
        setDiscountValid(null);
      } else {
        setDiscountValid({ valid: true, porcentaje: data.porcentaje });
        setDiscountError(null);
      }
    } catch {
      setDiscountError(t("connectionError", language));
    } finally {
      setValidatingDiscount(false);
    }
  }, [discountCode, email, language]);

  const handleSendOrder = useCallback(() => {
    if (!mesaToken && activeOrderTokens.length > 0) {
      setShowActiveOrdersDialog(true);
    } else {
      void handleConfirmOrder();
    }
  }, [mesaToken, activeOrderTokens, handleConfirmOrder]);

  const handleDeliveryChange = useCallback((
    v: 'recogida' | 'delivery',
    deliveryData?: { address: string; postalCode: string; latitude: number; longitude: number; estimatedFeeCents: number },
  ) => {
    setDeliveryMethod(v);
    setErrors(prev => ({ ...prev, delivery: undefined }));
    if (deliveryData) {
      setDeliveryAddress(deliveryData.address);
      setDeliveryPostalCode(deliveryData.postalCode);
      setDeliveryLatitude(deliveryData.latitude);
      setDeliveryLongitude(deliveryData.longitude);
      setEstimatedFeeCents(deliveryData.estimatedFeeCents);
    } else if (v !== deliveryMethod) {
      setDeliveryAddress('');
      setDeliveryPostalCode('');
      setDeliveryLatitude(null);
      setDeliveryLongitude(null);
      setEstimatedFeeCents(null);
    }
  }, [deliveryMethod]);

  const isDelivery = deliveryMethod === 'delivery';
  const { deliveryFee, grandTotal } = computeCartTotals(deliveryMethod, estimatedFeeCents, discountValid, totalPrice);

  return (
    <>
      <OrderToast show={showOrderToast} language={language} />
      {shouldShowQrGate(qrGateState, mesaToken, isWaiterMode) && (
        <QRScannerGate
          mesaId={resolveActiveMesaId(mesaInfo, mesaToken!)}
          state={qrGateState!}
          onTokenIssued={(token, expiresAt) => {
            storeMesaClientToken(resolveActiveMesaId(mesaInfo, mesaToken!), token, expiresAt);
            setQrGateState(null);
            void handleConfirmOrder();
          }}
          onCancel={() => {
            setQrGateState(null);
          }}
        />
      )}

      <Dialog open={showActiveOrdersDialog} onOpenChange={setShowActiveOrdersDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('activeOrdersDialogTitle', language)}</DialogTitle>
            <DialogDescription className="pt-2">
              {getActiveOrdersBodyText(activeOrderTokens.length, language)}
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 mt-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setShowActiveOrdersDialog(false)}
            >
              {t('cancel', language)}
            </Button>
            <Button
              className="flex-1"
              onClick={() => {
                setShowActiveOrdersDialog(false);
                handleConfirmOrder();
              }}
            >
              {t('activeOrdersContinue', language)}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!orderSuccess} onOpenChange={handleDialogClose}>
        <DialogContent className="sm:max-w-md text-center">
          <DialogHeader>
            <DialogTitle className="flex flex-col items-center justify-center gap-2 text-primary text-2xl">
              <Check className="w-12 h-12 bg-green-100 dark:bg-green-900 text-green-600 dark:text-green-400 rounded-full p-2" />
              {t("orderSuccessTitle", language)}
            </DialogTitle>
            <DialogDescription className="text-base pt-4">
              {t("orderSuccessMessage", language)}
              <br />
              <strong className="text-xl text-foreground font-bold">
                #{orderSuccess?.numeroPedido}
              </strong>
            </DialogDescription>
          </DialogHeader>
          <Button onClick={() => handleDialogClose(false)} className="w-full mt-4">
            {t("close", language)}
          </Button>
        </DialogContent>
      </Dialog>

      <Sheet open={isCartOpen} onOpenChange={closeCart}>
      <SheetContent side="right" className="flex flex-col w-full sm:max-w-md bg-background h-[100dvh] max-h-[100dvh] p-0">
        <SheetHeader className="shrink-0 px-4 pt-4 pb-2">
          <SheetTitle className="flex items-center gap-2 text-foreground">
            <ShoppingBag className="size-5" />
            {t("yourOrder", language)}
          </SheetTitle>
          <SheetDescription>
            {t("cartDescription", language)}
          </SheetDescription>
        </SheetHeader>

        {showNoPaymentBanner(items, isWaiterMode, deliveryMethod, pagosPickupHabilitados, isRestaurant) && (
          <div className="shrink-0 mx-4 mb-1.5 rounded-md bg-secondary border border-border px-2 py-1.5">
            <p className="text-xs text-secondary-foreground font-medium">
              {t("noPaymentRequired", language)}
            </p>
          </div>
        )}

        {items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-muted-foreground px-4">
            <div className={`relative ${shouldReduceMotion ? '' : 'animate-empty-float'}`}>
              <ShoppingBag className="size-12 opacity-20" />
              <span className="absolute inset-0 flex items-center justify-center text-2xl opacity-30">+</span>
            </div>
            <div className="text-center">
              <p className="text-base font-medium text-foreground">{t("emptyCart", language)}</p>
              <p className="text-sm text-muted-foreground mt-1 max-w-[240px]">{t("addDishesToStart", language)}</p>
            </div>
            <button
              onClick={() => {
                closeCart();
                document.getElementById('menu')?.scrollIntoView({ behavior: shouldReduceMotion ? 'auto' : 'smooth' });
              }}
              className="mt-2 px-6 py-3 bg-primary text-primary-foreground rounded-full font-medium hover:bg-primary/90 active:scale-[0.98] transition-all duration-150 min-h-[44px]"
            >
              {t("viewMenu", language)}
            </button>
          </div>
        ) : (
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto px-4 py-2">
            <ul className="flex flex-col gap-2 cv-auto" style={{ contentVisibility: 'auto' }}>
              {items.map((ci) => {
                const complementPrice = ci.selectedComplements?.reduce((sum, c) => sum + c.price, 0) || 0;
                const totalItemPrice = ci.item.price + complementPrice;
                const itemAnimationClass = getItemAnimationClass(ci.justAdded, ci.justRemoved, shouldReduceMotion);
                return (
<li
                      key={ci.cartId}
                      className={`flex items-center gap-3 rounded-lg p-3 transition-all duration-200 group ${itemAnimationClass}`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-card-foreground text-base group-hover:text-primary transition-colors duration-200 flex items-center gap-1.5 flex-wrap">
                          <span className="truncate">{(language !== "es" && ci.item.translations?.[language]?.name) || ci.item.name}</span>
                          {ci.pase && (
                            <span
                              className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                              style={{ background: PASE_BADGE[ci.pase].bg, color: PASE_BADGE[ci.pase].text }}
                            >
                              {PASE_LABEL[ci.pase]}
                            </span>
                          )}
                        </p>
                        {ci.selectedComplements && ci.selectedComplements.length > 0 && (
                          <p className="text-xs text-muted-foreground truncate group-hover:text-muted-foreground/80 transition-colors duration-200">
                            + {ci.selectedComplements.map(c => c.name).join(', ')}
                          </p>
                        )}
                        {ci.note && (
                          <p className="text-xs text-muted-foreground italic truncate">
                            {ci.note}
                          </p>
                        )}
                        <p className="text-sm text-muted-foreground group-hover:text-muted-foreground/90 transition-colors duration-200">
                          {formatPrice(totalItemPrice, 'EUR', language)}
                        </p>
                      </div>

                      <div className="flex items-center gap-0.5 shrink-0">
                        <RippleButton
                          variant="outline"
                          size="icon"
                          className="min-h-11 min-w-11 h-11 w-11 bg-transparent hover:bg-muted/50 transition-all duration-150 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          onClick={() => {
                            const newQty = ci.quantity - 1;
                            updateQuantity(ci.cartId, newQty);
                          }}
                          aria-label={t("reduceQuantity", language)}
                        >
                          <Minus className="size-4" />
                        </RippleButton>
                        <span className="w-6 text-center font-semibold text-foreground text-base animate-quantity-pulse">
                          {ci.quantity}
                        </span>
                        <RippleButton
                          variant="outline"
                          size="icon"
                          className="min-h-11 min-w-11 h-11 w-11 bg-transparent hover:bg-muted/50 transition-all duration-150 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          onClick={() => {
                            const newQty = ci.quantity + 1;
                            updateQuantity(ci.cartId, newQty);
                          }}
                          aria-label={t("increaseQuantity", language)}
                        >
                          <Plus className="size-4" />
                        </RippleButton>
                        <RippleButton
                          variant="ghost"
                          size="icon"
                          className="min-h-11 min-w-11 h-11 w-11 text-destructive hover:text-destructive hover:bg-destructive/10 transition-all duration-150 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          onClick={() => {
                            removeItem(ci.cartId);
                          }}
                          aria-label={`${t("remove", language)} ${(language !== "es" && ci.item.translations?.[language]?.name) || ci.item.name}`}
                        >
                          <Trash2 className="size-4" />
                        </RippleButton>
                      </div>
                    </li>
                );
              })}
            </ul>

            <div className="mt-auto shrink-0 border-t border-border pt-3 pb-4 bg-background">
              {mesaToken ? (
                /* Mesa mode: show table badge instead of PII form */
                <div className="mb-3">
                  <div className="flex items-center gap-2 rounded-lg bg-primary/10 border border-primary/20 px-3 py-2.5 min-h-[44px]">
                    <UtensilsCrossed className="size-4 text-primary shrink-0" aria-hidden="true" />
                    <span className="font-semibold text-primary text-sm">
                      {mesaBadgeLabel(mesaInfo, mesaError, t('mesaLabel', language))}
                    </span>
                  </div>
                  {mesaError && (
                    <p role="alert" className="text-xs text-muted-foreground mt-1 ml-1">
                      {t('mesaLabel', language)}
                    </p>
                  )}
                </div>
              ) : (
                /* Standard mode: PII form */
                <div className="space-y-3 mb-3">
                  <div>
                    <label htmlFor="cart-nombre" className="text-xs font-medium text-muted-foreground ml-4 mb-1 block">{t("placeholderName", language)}</label>
                    <div className="flex items-center gap-2">
                      <User className="size-4 text-muted-foreground shrink-0" aria-hidden="true" />
                      <Input
                        id="cart-nombre"
                        type="text"
                        placeholder={t("placeholderName", language)}
                        value={nombre}
                        onChange={(e) => { setNombre(e.target.value); setErrors(prev => ({ ...prev, nombre: undefined })); }}
                        className={`h-9 ${errors.nombre ? 'border-destructive' : ''}`}
                        maxLength={100}
                        autoComplete="name"
                        aria-describedby={errors.nombre ? "nombre-error" : undefined}
                        aria-invalid={!!errors.nombre}
                      />
                    </div>
                    {errors.nombre && <p id="nombre-error" role="alert" className="text-xs text-destructive mt-1 ml-4">{errors.nombre}</p>}
                  </div>
                  <div>
                    <label htmlFor="cart-telefono" className="text-xs font-medium text-muted-foreground ml-4 mb-1 block">{t("placeholderPhone", language)}</label>
                    <div className="flex items-center gap-2">
                      <Phone className="size-4 text-muted-foreground shrink-0" aria-hidden="true" />
                      <div className="flex gap-1 flex-1">
                        <Select value={countryCode} onValueChange={setCountryCode}>
                          <SelectTrigger id="country-code-select" className="h-9 w-[90px] shrink-0 text-xs px-2" aria-labelledby="country-code-label">
                            <SelectValue />
                          </SelectTrigger>
                          <span id="country-code-label" className="sr-only">{t("countryCode", language)}</span>
                          <SelectContent>
                            {COUNTRY_CODES.map((cc) => (
                              <SelectItem key={cc.code} value={cc.code}>
                                <span className="flex items-center gap-1">
                                  <span>{cc.flag}</span>
                                  <span>+{cc.dialCode}</span>
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          id="cart-telefono"
                          type="tel"
                          placeholder={t("phonePlaceholder", language)}
                          value={telefono}
                          onChange={(e) => { const val = e.target.value.replaceAll(/\D/g, '').slice(0, 15); setTelefono(val); setErrors(prev => ({ ...prev, telefono: undefined })); }}
                          className={`h-9 flex-1 ${errors.telefono ? 'border-destructive' : ''}`}
                          maxLength={15}
                          autoComplete="tel-national"
                          aria-describedby={errors.telefono ? "telefono-error" : undefined}
                          aria-invalid={!!errors.telefono}
                        />
                      </div>
                    </div>
                    {errors.telefono && <p id="telefono-error" role="alert" className="text-xs text-destructive mt-1 ml-4">{errors.telefono}</p>}
                  </div>
                  <div>
                    <label htmlFor="cart-email" className="text-xs font-medium text-muted-foreground ml-4 mb-1 block">{t("placeholderEmail", language)}</label>
                    <div className="flex items-center gap-2">
                      <Mail className="size-4 text-muted-foreground shrink-0" aria-hidden="true" />
                      <Input
                        id="cart-email"
                        type="email"
                        placeholder={t("placeholderEmail", language)}
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="h-9"
                        maxLength={100}
                        autoComplete="email"
                      />
                    </div>
                    <p className="text-xs mt-1 ml-4 text-primary font-medium flex items-center gap-1">
                      {t("promoMessage", language)} <Gift className="size-3.5" />
                    </p>
                  </div>
                </div>
              )}

              {/* Delivery method selector — only for restaurants in non-mesa mode */}
              {showDeliverySelector(mesaToken, isRestaurant) && (
                <DeliveryMethodSelector
                  value={deliveryMethod}
                  deliveryHabilitado={deliveryHabilitado}
                  onChange={handleDeliveryChange}
                  orderTotalCents={Math.round(totalPrice * 100)}
                  disabled={sending}
                />
              )}

              {/* Discount Code Section — hidden in mesa mode */}
              {showDiscountSection(mesaToken) && <div className="mb-3">
                <label htmlFor="discount-code" className="text-xs font-medium text-muted-foreground ml-1 mb-1 block">
                  {t("discountCodeLabel", language)}
                </label>
                <div className="flex gap-2">
                  <Input
                    id="discount-code"
                    type="text"
                    placeholder={t("discountCodePlaceholder", language)}
                    value={discountCode}
                    onChange={(e) => {
                      setDiscountCode(e.target.value.toUpperCase());
                      setDiscountValid(null);
                      setDiscountError(null);
                    }}
                     className={`h-9 ${discountBorderClass(discountError, discountValid)}`}
                     disabled={validatingDiscount || items.length === 0}
                     aria-describedby={discountDescribedBy(discountError, discountValid)}
                     aria-invalid={!!discountError}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 min-h-[44px] px-4"
                    onClick={handleValidateDiscount}
                    disabled={validatingDiscount || items.length === 0}
                  >
                    {validatingDiscount ? '...' : t("discountCodeApply", language)}
                  </Button>
                </div>
                {discountError && (
                  <p id="discount-error" role="alert" className="text-xs text-destructive mt-1 ml-1">
                    {discountError}
                  </p>
                )}
                {discountValid && discountValid.valid && (
                  <output id="discount-valid" className="text-xs text-green-600 dark:text-green-400 mt-1 ml-1 flex items-center gap-1">
                    <Check className="size-3" />
                    {t("discountCodeValid", language)} ({discountValid.porcentaje}%)
                  </output>
                )}
              </div>}

              {/* Total Section */}
              <div className="mb-4 space-y-1">
                {discountValid?.valid && (
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>{t("subtotal", language)}</span>
                    <span className="line-through">{formatPrice(totalPrice, 'EUR', language)}</span>
                  </div>
                )}
                {showDeliveryCostRow(isDelivery, deliveryFee) && (
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>{t("deliveryCost", language)}</span>
                    <span>{formatPrice(deliveryFee, 'EUR', language)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-lg font-semibold text-foreground">{t("total", language)}</span>
                  <span className={`text-2xl font-bold tabular-nums animate-price-update ${grandTotalColorClass(discountValid)}`} key={grandTotal}>
                    {formatPrice(grandTotal, 'EUR', language)}
                  </span>
                </div>
              </div>

              {errors.general && (
                <p role="alert" className="text-sm text-destructive text-center mb-2">
                  {errors.general}
                </p>
              )}
              {isDeliveryIncomplete && (
                <output className="block text-xs text-muted-foreground text-center mb-2">
                  {t('deliverySelectValidAddress', language)}
                </output>
              )}
              <div className="flex flex-col gap-2">
                 <Button
                   className="w-full bg-primary text-primary-foreground hover:bg-primary/90 rounded-full py-3 text-lg font-semibold shadow-elegant transition-colors duration-150 min-h-[44px]"
                   size="lg"
                   onClick={handleSendOrder}
                   disabled={isSubmitDisabled(sending, mesaToken, mesaError, isDeliveryIncomplete)}
                 >
                   {orderButtonLabel(sending, mesaToken, t, language)}
                 </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground rounded-full py-2 font-medium hover:bg-muted/40 transition-colors duration-200"
                  onClick={() => { clearCart(); }}
                >
                  {t("clearCart", language)}
                </Button>
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
    </>
  )
}
