"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import { Minus, Plus, Trash2, ShoppingBag, User, Phone, Mail, Check, Gift } from "lucide-react"
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
  translate: TranslateFn,
  discountData?: { valid: boolean; porcentaje: number; code: string }
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
      ...(discountData && { codigoDescuento: discountData.code }),
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
  const [discountCode, setDiscountCode] = useState('')
  const [discountValid, setDiscountValid] = useState<{ valid: boolean; porcentaje: number } | null>(null)
  const [discountError, setDiscountError] = useState<string | null>(null)
  const [validatingDiscount, setValidatingDiscount] = useState(false)
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

  // Helper functions to reduce complexity
  const getDiscountInputBorder = useCallback(() => {
    if (discountError) return 'border-destructive';
    if (discountValid) return 'border-green-500';
    return '';
  }, [discountError, discountValid]);

  const getDiscountAriaDescribedBy = useCallback(() => {
    if (discountError) return "discount-error";
    if (discountValid) return "discount-valid";
    return undefined;
  }, [discountError, discountValid]);

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
    
    const validation = validateAndBuildOrderData(
      { nombre, telefono, countryCode, email, items, totalPrice, language },
      t,
      discountValid ? { valid: discountValid.valid, porcentaje: discountValid.porcentaje, code: discountCode } : undefined
    );
    
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
        setDiscountCode('');
        setDiscountValid(null);
        setDiscountError(null);
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
  }, [nombre, telefono, countryCode, email, items, totalPrice, language, closeCart, abrirWhatsApp, discountCode, discountValid]);

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
                      <>{t("whatsappRetryingCountdown", language).replace("{seconds}", String(retryCountdown))}</>
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
      <SheetContent side="right" className="flex w-full flex-col sm:max-w-md bg-background h-[100dvh] max-h-[100dvh] p-0">
        <SheetHeader className="shrink-0 px-4 pt-4 pb-2">
          <SheetTitle className="flex items-center gap-2 text-foreground">
            <ShoppingBag className="size-5" />
            {t("yourOrder", language)}
          </SheetTitle>
          <SheetDescription>
            {t("cartDescription", language)}
          </SheetDescription>
        </SheetHeader>

        {items.length > 0 && (
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
          <div className="flex-1 overflow-y-auto px-4 py-2">
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

            <div className="border-t border-border pt-3 pb-4 bg-background">
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

              {/* Discount Code Section */}
              <div className="mb-3">
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
                    className={`h-9 ${getDiscountInputBorder()}`}
                    disabled={validatingDiscount || items.length === 0}
                    aria-describedby={getDiscountAriaDescribedBy()}
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
              </div>

              {/* Total Section */}
              <div className="mb-4 flex items-center justify-between">
                <span className="text-lg font-semibold text-foreground">{t("total", language)}</span>
                <div className="text-right">
                  {discountValid?.valid ? (
                    <>
                      <span className="text-sm text-muted-foreground line-through mr-2">
                        {formatPrice(totalPrice, 'EUR', language)}
                      </span>
                      <span className="text-2xl font-bold text-green-600 dark:text-green-400 tabular-nums animate-price-update" key={`discounted-${totalPrice}`}>
                        {formatPrice(Math.round(totalPrice * (1 - discountValid.porcentaje / 100) * 100) / 100, 'EUR', language)}
                      </span>
                    </>
                  ) : (
                    <span className="text-2xl font-bold text-foreground tabular-nums animate-price-update" key={totalPrice}>
                      {formatPrice(totalPrice, 'EUR', language)}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <Button 
                  className="w-full bg-primary text-primary-foreground hover:bg-primary/90 rounded-full py-3 text-lg font-semibold shadow-elegant transition-colors duration-150 min-h-[44px]"
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
          </div>
        )}
      </SheetContent>
    </Sheet>
    </>
  )
}
