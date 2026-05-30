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
import { getItemKey } from "@/lib/cart-utils";
import { getTrackingTokens, addTrackingToken } from "@/lib/order-tracking";

interface MesaInfo {
  id: string;
  numero: number;
  nombre: string | null;
  empresa_id: string;
}

type TranslationKey = keyof typeof import('@/lib/translations').translations.es;
type TranslateFn = (key: TranslationKey, language: Language) => string;

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

interface CartDrawerProps {
  isRestaurant?: boolean;
}

export function CartDrawer({ isRestaurant = false }: Readonly<CartDrawerProps>) {
  const {
    items,
    updateQuantity,
    removeItem,
    clearCart,
    totalPrice,
    isCartOpen,
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
  const [mesaSuccessMessage, setMesaSuccessMessage] = useState<string | null>(null);

  // Detect ?mesa= param (client-side only, SSR safe)
  // Falls back to sessionStorage so waiter mode survives navigation without ?mesa= in the URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('mesa');

    function applySessionStorage(): boolean {
      try {
        const raw = sessionStorage.getItem('waiter_mesa');
        if (!raw) return false;
        const stored = JSON.parse(raw) as { mesaId: string; mesaNumero: number; mesaNombre: string | null };
        setMesaToken(stored.mesaId);
        setMesaInfo({ id: stored.mesaId, numero: stored.mesaNumero, nombre: stored.mesaNombre, empresa_id: '' });
        return true;
      } catch {
        return false;
      }
    }

    if (token) {
      setMesaToken(token);
      fetch(`/api/mesas?token=${encodeURIComponent(token)}`)
        .then(async (res) => {
          if (!res.ok) { if (!applySessionStorage()) setMesaError(true); return; }
          const data = await res.json() as MesaInfo;
          setMesaInfo(data);
        })
        .catch(() => { if (!applySessionStorage()) setMesaError(true); });
      return;
    }

    applySessionStorage();
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
  const [deliveryMethod, setDeliveryMethod] = useState<'recogida' | 'delivery' | null>(null);
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
      setSending(true);
      try {
        const mesaId = mesaInfo?.id ?? mesaToken;
        const res = await fetch('/api/pedidos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tipo: 'mesa',
            mesa_id: mesaId,
            items: items.map((ci: CartItem) => ({
              item: { id: ci.item.id, name: ci.item.name, price: ci.item.price, translations: ci.item.translations },
              quantity: ci.quantity,
              selectedComplements: ci.selectedComplements?.map(c => ({ id: c.id, name: c.name, price: c.price })),
            })),
            idioma: language,
          }),
        });
        const data = await res.json();
        if (res.ok && data.trackingToken) {
          addTrackingToken(data.trackingToken);
          // Persist to mesa-specific localStorage array
          try {
            const storageKey = `mesa_orders_${mesaId}`;
            const existing = JSON.parse(localStorage.getItem(storageKey) ?? '[]') as unknown[];
            existing.push({
              pedidoId: data.pedidoId ?? data.id,
              trackingToken: data.trackingToken,
              items: items.map((ci: CartItem) => ({
                name: ci.item.name,
                quantity: ci.quantity,
                price: ci.item.price,
              })),
              total: totalPrice,
              timestamp: Date.now(),
            });
            localStorage.setItem(storageKey, JSON.stringify(existing));
          } catch {
            // localStorage may be unavailable — not fatal
          }
          clearCart();
          closeCart();
          setMesaSuccessMessage(`${t('mesaOrderTitle', language)} #${data.numeroPedido}`);
          // Dismiss success message after 4 seconds
          setTimeout(() => setMesaSuccessMessage(null), 4000);
        } else {
          setErrors({ general: data.error || t('validationOrderError', language) });
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
    const deliveryError = isRestaurant && deliveryMethod === null
      ? t('deliveryMethodTitle', language)
      : isRestaurant && deliveryMethod === 'delivery' && (deliveryLatitude === null || deliveryLongitude === null)
        ? t('deliverySelectValidAddress', language)
        : undefined;
    if (nombreError || telefonoError || deliveryError) {
      setErrors({ nombre: nombreError, telefono: telefonoError, delivery: deliveryError });
      return;
    }

    setSending(true);

    const selectedCountry = COUNTRY_CODES.find(c => c.code === countryCode);
    const dialCode = selectedCountry?.dialCode || '34';

    try {
      const res = await fetch('/api/pedidos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: items.map((ci: CartItem) => ({
            item: { id: ci.item.id, name: ci.item.name, price: ci.item.price, translations: ci.item.translations },
            quantity: ci.quantity,
            selectedComplements: ci.selectedComplements?.map(c => ({ id: c.id, name: c.name, price: c.price })),
          })),
          nombre,
          telefono: dialCode + telefono.replaceAll(/\D/g, ''),
          email,
          idioma: language,
          codigoDescuento: discountCode || undefined,
          ...(isRestaurant && deliveryMethod ? {
            origen: deliveryMethod,
            direccion_entrega: deliveryMethod === 'delivery' ? deliveryAddress : undefined,
            codigo_postal: deliveryMethod === 'delivery' ? deliveryPostalCode : undefined,
            latitude_entrega: deliveryMethod === 'delivery' ? deliveryLatitude : undefined,
            longitude_entrega: deliveryMethod === 'delivery' ? deliveryLongitude : undefined,
            estimated_delivery_fee_cents: deliveryMethod === 'delivery' ? estimatedFeeCents : undefined,
          } : {}),
        }),
      });

      const data = await res.json();

      if (res.ok) {
        if (data.trackingToken && deliveryMethod === 'delivery' && data.pedidoId) {
          // Delivery order: initiate Redsys payment before redirecting
          if (data.trackingToken) addTrackingToken(data.trackingToken);
          clearCart();
          closeCart();
          try {
            const redsysRes = await fetch('/api/redsys/initiate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ pedidoId: data.pedidoId }),
            });
            if (redsysRes.ok) {
              const formData = await redsysRes.json() as {
                DS_MERCHANT_PARAMETERS: string;
                DS_SIGNATURE: string;
                DS_SIGNATURE_VERSION: string;
              };
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
              try {
                const decoded = JSON.parse(atob(fields['Ds_MerchantParameters'] ?? '')) as Record<string, unknown>;
                console.log('[Redsys form] decoded params:', decoded);
              } catch (e) { console.error('[Redsys form] decode error', e); }
              document.body.appendChild(form);
              form.submit();
              return;
            }
            // Redsys not configured — fall through to tracking page
          } catch {
            // Network error — fall through to tracking page
          }
          router.push(`/tracking/${data.trackingToken}`);
        } else if (data.trackingToken && data.tipo === 'restaurante') {
          // Restaurant pickup: redirect to tracking page
          addTrackingToken(data.trackingToken);
          clearCart();
          if (window.history.state?.cartOpen) {
            window.history.replaceState({}, '', window.location.href);
          }
          closeCart();
          router.push(`/tracking/${data.trackingToken}`);
        } else if (data.trackingToken) {
          // Tienda: redirect to tracking page
          addTrackingToken(data.trackingToken);
          clearCart();
          setNombre('');
          setTelefono('');
          setEmail('');
          if (window.history.state?.cartOpen) {
            window.history.replaceState({}, '', window.location.href);
          }
          closeCart();
          const trackingUrl = `/tracking/${data.trackingToken}`;
          setTimeout(() => { window.location.href = trackingUrl; }, 0);
        } else {
          // Fallback: show success dialog only
          setOrderSuccess({ numeroPedido: data.numeroPedido });
        }
      } else {
        setErrors({ general: data.error || t('validationOrderError', language) });
      }
    } catch {
      setErrors({ general: t('connectionError', language) });
    } finally {
      setSending(false);
    }
  }, [mesaToken, mesaInfo, nombre, telefono, countryCode, email, deliveryMethod, deliveryAddress, deliveryPostalCode, deliveryLatitude, deliveryLongitude, isRestaurant, items, language, discountCode, totalPrice, clearCart, closeCart, router]);

  const isDeliveryIncomplete = isRestaurant && !mesaToken && deliveryMethod === 'delivery' && (deliveryLatitude === null || estimatedFeeCents === null);

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

  return (
    <>
      <Dialog open={showActiveOrdersDialog} onOpenChange={setShowActiveOrdersDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('activeOrdersDialogTitle', language)}</DialogTitle>
            <DialogDescription className="pt-2">
              {activeOrderTokens.length === 1
                ? t('activeOrdersDialogBodySingular', language)
                : t('activeOrdersDialogBodyPlural', language).replace('{count}', String(activeOrderTokens.length))
              }
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

        {items.length > 0 && deliveryMethod !== 'delivery' && (
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
                const itemKey = getItemKey(ci.item, ci.selectedComplements);
                const complementPrice = ci.selectedComplements?.reduce((sum, c) => sum + c.price, 0) || 0;
                const totalItemPrice = ci.item.price + complementPrice;
                let itemAnimationClass = '';
                if (!shouldReduceMotion) {
                  if (ci.justAdded) {
                    itemAnimationClass = 'animate-cart-item-add';
                  } else if (ci.justRemoved) {
                    itemAnimationClass = 'animate-cart-item-remove';
                  }
                }
                return (
<li 
                      key={itemKey} 
                      className={`flex items-center gap-3 rounded-lg bg-card p-3 transition-all duration-200 hover:bg-card/80 group ${itemAnimationClass}`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-card-foreground text-base truncate group-hover:text-primary transition-colors duration-200">
                          {(language !== "es" && ci.item.translations?.[language]?.name) || ci.item.name}
                        </p>
                        {ci.selectedComplements && ci.selectedComplements.length > 0 && (
                          <p className="text-xs text-muted-foreground truncate group-hover:text-muted-foreground/80 transition-colors duration-200">
                            + {ci.selectedComplements.map(c => c.name).join(', ')}
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
                          onClick={() => updateQuantity(itemKey, ci.quantity - 1)}
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
                          onClick={() => updateQuantity(itemKey, ci.quantity + 1)}
                          aria-label={t("increaseQuantity", language)}
                        >
                          <Plus className="size-4" />
                        </RippleButton>
                        <RippleButton
                          variant="ghost"
                          size="icon"
                          className="min-h-11 min-w-11 h-11 w-11 text-destructive hover:text-destructive hover:bg-destructive/10 transition-all duration-150 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          onClick={() => removeItem(itemKey)}
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
                      {mesaInfo
                        ? `${t('mesaLabel', language)} ${mesaInfo.numero}${mesaInfo.nombre ? ` — ${mesaInfo.nombre}` : ''}`
                        : mesaError
                          ? `${t('mesaLabel', language)} —`
                          : `${t('mesaLabel', language)}…`}
                    </span>
                  </div>
                  {mesaError && (
                    <p role="alert" className="text-xs text-muted-foreground mt-1 ml-1">
                      {t('mesaLabel', language)}
                    </p>
                  )}
                  {mesaSuccessMessage && (
                    <div role="status" className="mt-2 flex items-center gap-2 rounded-lg bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 px-3 py-2 text-sm text-green-700 dark:text-green-300">
                      <Check className="size-4 shrink-0" />
                      {mesaSuccessMessage}
                    </div>
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
              {!mesaToken && isRestaurant && (
                <DeliveryMethodSelector
                  value={deliveryMethod}
                  onChange={(v, deliveryData) => {
                    setDeliveryMethod(v);
                    setErrors(prev => ({ ...prev, delivery: undefined }));
                    if (deliveryData) {
                      setDeliveryAddress(deliveryData.address);
                      setDeliveryPostalCode(deliveryData.postalCode);
                      setDeliveryLatitude(deliveryData.latitude);
                      setDeliveryLongitude(deliveryData.longitude);
                      setEstimatedFeeCents(deliveryData.estimatedFeeCents);
                    } else if (v !== deliveryMethod) {
                      // Method changed without deliveryData — clear address state
                      setDeliveryAddress('');
                      setDeliveryPostalCode('');
                      setDeliveryLatitude(null);
                      setDeliveryLongitude(null);
                      setEstimatedFeeCents(null);
                    }
                  }}
                  orderTotalCents={Math.round(totalPrice * 100)}
                  disabled={sending}
                />
              )}

              {/* Discount Code Section — hidden in mesa mode */}
              {!mesaToken && <div className="mb-3">
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
                     className={`h-9 ${discountError ? 'border-destructive' : (discountValid ? 'border-green-500' : '')}`}
                     disabled={validatingDiscount || items.length === 0}
                     aria-describedby={discountError ? "discount-error" : (discountValid ? "discount-valid" : undefined)}
                     aria-invalid={!!discountError}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 min-h-[44px] px-4"
                    onClick={async () => {
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
                          setDiscountError(data.error && data.code ? (errorTranslations[data.code] || t("discountCodeInvalid", language)) : (data.error || t("discountCodeInvalid", language)));
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
                    }}
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
                  <p id="discount-valid" role="status" className="text-xs text-green-600 dark:text-green-400 mt-1 ml-1 flex items-center gap-1">
                    <Check className="size-3" />
                    {t("discountCodeValid", language)} ({discountValid.porcentaje}%)
                  </p>
                )}
              </div>}

              {/* Total Section */}
              {(() => {
                const isDelivery = deliveryMethod === 'delivery';
                const deliveryFeeCents = isDelivery && estimatedFeeCents ? estimatedFeeCents : 0;
                const deliveryFee = deliveryFeeCents / 100;
                const discountedItems = discountValid?.valid
                  ? Math.round(totalPrice * (1 - discountValid.porcentaje / 100) * 100) / 100
                  : totalPrice;
                const grandTotal = discountedItems + deliveryFee;

                return (
                  <div className="mb-4 space-y-1">
                    {discountValid?.valid && (
                      <div className="flex items-center justify-between text-sm text-muted-foreground">
                        <span>{t("subtotal", language)}</span>
                        <span className="line-through">{formatPrice(totalPrice, 'EUR', language)}</span>
                      </div>
                    )}
                    {isDelivery && deliveryFee > 0 && (
                      <div className="flex items-center justify-between text-sm text-muted-foreground">
                        <span>{t("deliveryCost", language)}</span>
                        <span>{formatPrice(deliveryFee, 'EUR', language)}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-lg font-semibold text-foreground">{t("total", language)}</span>
                      <span className={`text-2xl font-bold tabular-nums animate-price-update ${discountValid?.valid ? 'text-green-600 dark:text-green-400' : 'text-foreground'}`} key={grandTotal}>
                        {formatPrice(grandTotal, 'EUR', language)}
                      </span>
                    </div>
                  </div>
                );
              })()}

              {errors.general && (
                <p role="alert" className="text-sm text-destructive text-center mb-2">
                  {errors.general}
                </p>
              )}
              {isDeliveryIncomplete && (
                <p role="status" className="text-xs text-muted-foreground text-center mb-2">
                  {t('deliverySelectValidAddress', language)}
                </p>
              )}
              <div className="flex flex-col gap-2">
                 <Button
                   className="w-full bg-primary text-primary-foreground hover:bg-primary/90 rounded-full py-3 text-lg font-semibold shadow-elegant transition-colors duration-150 min-h-[44px]"
                   size="lg"
                   onClick={() => {
                     if (!mesaToken && activeOrderTokens.length > 0) {
                       setShowActiveOrdersDialog(true);
                     } else {
                       handleConfirmOrder();
                     }
                   }}
                   disabled={sending || (mesaToken !== null && mesaError) || isDeliveryIncomplete}
                 >
                   {sending ? t("sending", language) : mesaToken ? t("mesaPlaceOrder", language) : t("sendOrder", language)}
                 </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground rounded-full py-2 font-medium hover:bg-muted/40 transition-colors duration-200"
                  onClick={clearCart}
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
