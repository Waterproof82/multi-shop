"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import { Minus, Plus, Trash2, ShoppingBag, User, Phone, Mail, Check } from "lucide-react"
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
import { useCart, type Complement, type CartItem } from "@/lib/cart-context"
import { useLanguage, type Language } from "@/lib/language-context"
import { t } from "@/lib/translations"
import { formatPrice } from "@/lib/format-price"
import { COUNTRY_CODES, DEFAULT_COUNTRY_CODE } from "@/core/domain/constants/country-codes"
import type { MenuItemVM } from "@/core/application/dtos/menu-view-model"

function getItemKey(item: MenuItemVM, complements?: Complement[]): string {
  const complementIds = complements?.map(c => c.id).sort().join(',') || '';
  return `${item.id}-${complementIds}`;
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

interface OrderFormData {
  nombre: string;
  telefono: string;
  countryCode: string;
  email: string;
  items: CartItem[];
  totalPrice: number;
  language: Language;
}

function validateAndBuildOrderData(
  formData: OrderFormData,
  translate: TranslateFn
): { valid: true; data: Record<string, unknown> } | { valid: false; errors: { nombre?: string; telefono?: string } } {
  const { nombre, telefono, countryCode, email, items, totalPrice, language } = formData;
  
  const nombreError = validateNameInput(nombre, translate, language);
  const telefonoError = validatePhoneInput(telefono, translate, language);
  
  if (nombreError || telefonoError) {
    return { valid: false, errors: { nombre: nombreError, telefono: telefonoError } };
  }

  const selectedCountry = COUNTRY_CODES.find(c => c.code === countryCode);
  const dialCode = selectedCountry?.dialCode || '34';
  
  return {
    valid: true,
    data: {
      items: items.map(ci => ({
        item: {
          id: ci.item.id,
          name: (language !== 'es' && ci.item.translations?.[language]?.name) || ci.item.name,
          price: ci.item.price,
          translations: ci.item.translations,
        },
        quantity: ci.quantity,
        selectedComplements: ci.selectedComplements?.map(c => ({
          id: c.id,
          name: c.name,
          price: c.price,
        })),
      })),
      total: totalPrice,
      nombre: nombre.trim().slice(0, 100),
      telefono: dialCode + telefono.replaceAll(/\D/g, '').slice(0, 15),
      email: email.trim().toLowerCase().slice(0, 100),
      idioma: language,
    },
  };
}

export function CartDrawer() {
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
  const shouldReduceMotion = useReducedMotion() ?? false
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [companyPhone, setCompanyPhone] = useState<string | null>(null)
  const [messageCopied, setMessageCopied] = useState(false)
  const [retryCountdown, setRetryCountdown] = useState<number | null>(null)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [countryCode, setCountryCode] = useState(DEFAULT_COUNTRY_CODE)
  const [email, setEmail] = useState('')
  const [errors, setErrors] = useState<{ nombre?: string; telefono?: string }>({})

  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    setIsMobile(globalThis.matchMedia('(pointer: coarse)').matches);
  }, []);

  const getDialogDescription = useCallback(() => {
    if (isMobile) {
      return confirming ? t("sendingOrder", language) : t("whatsappCheck", language);
    }
    return t("whatsappDesktopChoice", language);
  }, [isMobile, confirming, language]);

  const getRetryButtonText = useCallback(() => {
    if (retryCountdown === null) return t("whatsappDesktopApp", language);
    if (retryCountdown > 0) return t("whatsappRetrying", language).replaceAll("{seconds}", String(retryCountdown));
    return t("whatsappRetry", language);
  }, [retryCountdown, language]);

  const buildWhatsAppUrls = (numero: string, mensaje: string) => {
    const numeroLimpio = numero.replaceAll(/\D/g, '');
    const textoEncoded = encodeURIComponent(mensaje);
    return {
      waMeUrl: `https://wa.me/${numeroLimpio}?text=${textoEncoded}`,
      webUrl: `https://web.whatsapp.com/send?phone=${numeroLimpio}&text=${textoEncoded}`,
    };
  };

  const abrirWhatsApp = useCallback(async (numero: string, mensaje: string) => {
    const { waMeUrl } = buildWhatsAppUrls(numero, mensaje);

    if (isMobile) {
      globalThis.location.href = waMeUrl;
    } else {
      try {
        await navigator.clipboard.writeText(mensaje);
        setMessageCopied(true);
      } catch {
        // Clipboard API not available, continue without copy
      }
      // Don't auto-open on desktop — show dialog with options
      // for user to choose (wa.me or WhatsApp Web)
    }
  }, [isMobile]);

  const clearRetryTimers = useCallback(() => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    setRetryCountdown(null);
  }, []);

  const handleOpenInApp = useCallback(() => {
    const link = (globalThis as Record<string, unknown>).__whatsappLink as string | undefined;
    if (!link) return;

    // If countdown is active, this is a retry (app already warm)
    if (retryCountdown !== null) {
      clearRetryTimers();
      globalThis.open(link, '_blank', 'noopener,noreferrer');
      return;
    }

    // First attempt: opens wa.me (may fail due to cold start)
    globalThis.open(link, '_blank', 'noopener,noreferrer');

    // 10s countdown → when done, button changes to "Retry"
    const retryDelay = 10;
    setRetryCountdown(retryDelay);

    countdownRef.current = setInterval(() => {
      setRetryCountdown(prev => {
        if (prev === null || prev <= 1) {
          if (countdownRef.current) clearInterval(countdownRef.current);
          countdownRef.current = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [clearRetryTimers, retryCountdown]);

  // Limpiar timers al desmontar
  useEffect(() => {
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  const getWhatsAppUrl = (): string | null => {
    const link = (globalThis as Record<string, unknown>).__whatsappLink as string | undefined;
    return link || null;
  };

  const getWhatsAppWebUrl = (): string | null => {
    const link = (globalThis as Record<string, unknown>).__whatsappLink as string | undefined;
    if (!link) return null;
    const match = /wa\.me\/(\d+)\?text=(.+)/.exec(link);
    if (!match) return link;
    return `https://web.whatsapp.com/send?phone=${match[1]}&text=${match[2]}`;
  };

  const handleConfirmOrder = useCallback(async () => {
    setErrors({});
    
    const validation = validateAndBuildOrderData({ nombre, telefono, countryCode, email, items, totalPrice, language }, t);
    
    if (!validation.valid) {
      setErrors(validation.errors);
      return;
    }

    setSending(true);
    try {
      const res = await fetch('/api/pedidos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validation.data),
      });
      
      const data = await res.json();
      
      if (res.ok) {
        closeCart();
        setNombre('');
        setTelefono('');
        setEmail('');
        setCompanyPhone(data.companyPhone || null);
        
        if (data.whatsappLink) {
          (globalThis as Record<string, unknown>).__whatsappLink = data.whatsappLink;
          const matchResult = data.whatsappLink.match(/wa\.me\/(\d+)\?text=(.+)/);
          if (matchResult) {
            const numero = matchResult[1];
            const mensaje = decodeURIComponent(matchResult[2]);
            abrirWhatsApp(numero, mensaje);
          }
        }
        setSent(true);
        setConfirming(false);
      } else {
        setErrors({ nombre: data.error || t("validationOrderError", language) });
      }
    } catch {
      setErrors({ nombre: t("connectionError", language) });
    } finally {
      setSending(false);
    }
  }, [nombre, telefono, countryCode, email, items, totalPrice, language, closeCart, abrirWhatsApp]);

  const handleDialogClose = useCallback((open: boolean) => {
    if (!open) {
      setSent(false);
      setConfirming(false);
      setMessageCopied(false);
      clearRetryTimers();
      clearCart();
      closeCart();
    }
  }, [clearRetryTimers, clearCart, closeCart]);

  return (
    <>
      <Dialog open={sent} onOpenChange={handleDialogClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-primary">
              <Check className="w-6 h-6" />
              {t("sendingOrder", language)}
            </DialogTitle>
            <DialogDescription className="text-base">
              {getDialogDescription()}
            </DialogDescription>
            {confirming && companyPhone && (
              <p className="text-xs text-destructive mt-2 text-center">
                {t("whatsappFallback", language)} {companyPhone}
              </p>
            )}
          </DialogHeader>
          {!confirming && getWhatsAppUrl() && (
            <>
              {isMobile ? (
                <a
                  href={getWhatsAppUrl()!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full text-center bg-whatsapp text-primary-foreground py-3 px-4 rounded-full font-semibold hover:bg-whatsapp-hover transition-colors duration-150"
                >
                  {t("whatsappResend", language)}
                </a>
              ) : (
                <div className="flex flex-col gap-2">
                  {/* Screen reader announcement for countdown */}
                  <span aria-live="polite" aria-atomic="true" className="sr-only">
                    {retryCountdown !== null && retryCountdown > 0 && (
                      <>Reintentando en {retryCountdown} segundos...</>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={handleOpenInApp}
                    disabled={retryCountdown !== null && retryCountdown > 0}
                    className="w-full text-center bg-whatsapp text-primary-foreground py-3 px-4 rounded-full font-semibold hover:bg-whatsapp-hover transition-colors duration-150 disabled:opacity-70"
                  >
                    {getRetryButtonText()}
                  </button>
                  <a
                    href={getWhatsAppWebUrl()!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-full text-center border border-whatsapp text-whatsapp py-3 px-4 rounded-full font-semibold hover:bg-whatsapp/10 transition-colors duration-150"
                  >
                    {t("whatsappWeb", language)}
                  </a>
                  {messageCopied && (
                    <p className="text-xs text-muted-foreground mt-1 text-center">
                      {t("whatsappClipboard", language)}
                    </p>
                  )}
                </div>
              )}
            </>
          )}
          {companyPhone && (
            <div className="bg-foreground text-background p-4 rounded-lg mt-4 w-full text-center">
              <p className="text-sm font-medium">
                {t("whatsappCantSend", language)}
              </p>
              <a
                href={`tel:${companyPhone.replaceAll(/\D/g, '')}`}
                className="block text-2xl font-bold mt-2 tracking-wide hover:opacity-80 transition-opacity"
              >
                {companyPhone.replaceAll(/\D/g, '').slice(2)}
              </a>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Sheet open={isCartOpen} onOpenChange={closeCart}>
      <SheetContent className="flex w-full flex-col sm:max-w-md bg-background">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-foreground">
            <ShoppingBag className="size-5" />
            {t("yourOrder", language)}
          </SheetTitle>
          <SheetDescription>
            {t("cartDescription", language)}
          </SheetDescription>
        </SheetHeader>

        {items.length > 0 && (
          <div className="mx-1 mb-3 rounded-lg bg-secondary border border-border px-3 py-2">
            <p className="text-sm text-secondary-foreground font-medium">
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
          <>
            <div className="flex-1 overflow-y-auto">
              <ul className="flex flex-col gap-3 py-4 cv-auto" style={{ contentVisibility: 'auto' }}>
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
                      className={`flex items-center gap-3 rounded-lg bg-card p-3 transition-all duration-200 hover:bg-card/80 hover:shadow-sm hover:scale-[1.01] group ${itemAnimationClass}`}
                    >
                      <div className="flex-1">
                        <p className="font-semibold text-card-foreground group-hover:text-primary transition-colors duration-200">
                          {(language !== "es" && ci.item.translations?.[language]?.name) || ci.item.name}
                        </p>
                        {ci.selectedComplements && ci.selectedComplements.length > 0 && (
                          <p className="text-xs text-muted-foreground group-hover:text-muted-foreground/80 transition-colors duration-200">
                            + {ci.selectedComplements.map(c => c.name).join(', ')}
                          </p>
                        )}
                        <p className="text-sm text-muted-foreground group-hover:text-muted-foreground/90 transition-colors duration-200">
                          {formatPrice(totalItemPrice, 'EUR', language)}
                        </p>
                      </div>

                      <div className="flex items-center gap-1 md:gap-2">
                        <RippleButton
                          variant="outline"
                          size="icon"
                          className="min-h-[44px] min-w-[44px] md:min-h-9 md:min-w-9 bg-transparent hover:bg-muted/50 hover:scale-105 active:scale-95 transition-all duration-150 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          onClick={() => updateQuantity(itemKey, ci.quantity - 1)}
                          aria-label={t("reduceQuantity", language)}
                        >
                          <Minus className="size-4" />
                        </RippleButton>
                        <span className="w-6 md:w-6 text-center font-semibold text-foreground animate-quantity-pulse transition-all duration-200 hover:scale-110" key={ci.quantity}>
                          {ci.quantity}
                        </span>
                        <RippleButton
                          variant="outline"
                          size="icon"
                          className="min-h-[44px] min-w-[44px] md:min-h-9 md:min-w-9 bg-transparent hover:bg-muted/50 hover:scale-105 active:scale-95 transition-all duration-150 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          onClick={() => updateQuantity(itemKey, ci.quantity + 1)}
                          aria-label={t("increaseQuantity", language)}
                        >
                          <Plus className="size-4" />
                        </RippleButton>
                        <RippleButton
                          variant="ghost"
                          size="icon"
                          className="min-h-[44px] min-w-[44px] md:min-h-9 md:min-w-9 text-destructive hover:text-destructive hover:bg-destructive/10 hover:scale-105 active:scale-95 transition-all duration-150 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
            </div>

            <div className="border-t border-border pt-4 pb-6 px-2 bg-background/80 shadow-elegant rounded-b-xl">
              <div className="space-y-3 mb-4">
                <div>
                  <label htmlFor="cart-nombre" className="text-xs font-medium text-muted-foreground ml-6 mb-1 block">{t("placeholderName", language)}</label>
                  <div className="flex items-center gap-2">
                    <User className="size-4 text-muted-foreground" aria-hidden="true" />
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
                  {errors.nombre && <p id="nombre-error" role="alert" className="text-xs text-destructive mt-1 ml-6">{errors.nombre}</p>}
                </div>
                <div>
                  <label htmlFor="cart-telefono" className="text-xs font-medium text-muted-foreground ml-6 mb-1 block">{t("placeholderPhone", language)}</label>
                  <div className="flex items-center gap-2">
                    <Phone className="size-4 text-muted-foreground shrink-0" aria-hidden="true" />
                    <div className="flex gap-1 flex-1">
                      <Select value={countryCode} onValueChange={setCountryCode}>
                        <SelectTrigger id="country-code-select" className="h-9 w-[100px] shrink-0 text-xs px-2" aria-labelledby="country-code-label">
                          <SelectValue />
                        </SelectTrigger>
                        <span id="country-code-label" className="sr-only">{t("countryCode", language)}</span>
                        <SelectContent>
                          {COUNTRY_CODES.map((cc) => (
                            <SelectItem key={cc.code} value={cc.code}>
                              <span className="flex items-center gap-1.5">
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
                  {errors.telefono && <p id="telefono-error" role="alert" className="text-xs text-destructive mt-1 ml-6">{errors.telefono}</p>}
                </div>
                <div>
                  <label htmlFor="cart-email" className="text-xs font-medium text-muted-foreground ml-6 mb-1 block">{t("placeholderEmail", language)}</label>
                  <div className="flex items-center gap-2">
                    <Mail className="size-4 text-muted-foreground" aria-hidden="true" />
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
                  <p className="text-xs mt-1 ml-6 text-muted-foreground">{t("promoMessage", language)}</p>
                </div>
              </div>

              <div className="mb-4 flex items-center justify-between px-2">
                <span className="text-lg font-semibold text-foreground">{t("total", language)}</span>
                <span className="text-2xl font-bold text-foreground tabular-nums animate-price-update" key={totalPrice}>
                  {formatPrice(totalPrice, 'EUR', language)}
                </span>
              </div>

              <div className="flex flex-col gap-2 px-1">
                <Button 
                  className="w-full bg-primary text-primary-foreground hover:bg-primary/90 rounded-full py-3 text-lg font-semibold shadow-elegant transition-colors duration-150"
                  size="lg"
                  onClick={handleConfirmOrder}
                  disabled={sending || confirming}
                >
                  {sending || confirming ? t("sending", language) : t("sendOrder", language)}
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
          </>
        )}
      </SheetContent>
    </Sheet>
    </>
  )
}
