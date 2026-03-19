"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import { Minus, Plus, Trash2, ShoppingBag, User, Phone, Mail } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
import { useCart, type Complement } from "@/lib/cart-context"
import { useLanguage } from "@/lib/language-context"
import { t } from "@/lib/translations"
import type { MenuItemVM } from "@/core/application/dtos/menu-view-model"

function getItemKey(item: MenuItemVM, complements?: Complement[]): string {
  const complementIds = complements?.map(c => c.id).sort().join(',') || '';
  return `${item.id}-${complementIds}`;
}

function RippleButton({ children, onClick, className, disabled, variant = "default", size = "default", 'aria-label': ariaLabel, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "default" | "outline" | "ghost"; size?: "default" | "icon" }) {
  const buttonRef = useRef<HTMLButtonElement>(null);

  const createRipple = (event: React.MouseEvent<HTMLButtonElement>) => {
    const button = event.currentTarget;
    const rect = button.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const ripple = document.createElement("span");
    ripple.className = "ripple";
    ripple.style.left = `${x}px`;
    ripple.style.top = `${y}px`;
    const existingRipple = button.querySelector(".ripple");
    if (existingRipple) existingRipple.remove();
    button.appendChild(ripple);
    setTimeout(() => ripple.remove(), 500);
  }

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!disabled) {
      createRipple(e);
      onClick?.(e);
    }
  }

  return (
    <Button
      ref={buttonRef}
      variant={variant}
      size={size}
      className={`relative overflow-hidden ${className}`}
      disabled={disabled}
      onClick={handleClick}
      aria-label={ariaLabel}
      {...props}
    >
      {children}
    </Button>
  );
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
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [companyPhone, setCompanyPhone] = useState<string | null>(null)
  const [orderNumber, setOrderNumber] = useState<number | null>(null)
  const [messageCopied, setMessageCopied] = useState(false)
  const [retryCountdown, setRetryCountdown] = useState<number | null>(null)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [email, setEmail] = useState('')
  const [errors, setErrors] = useState<{ nombre?: string; telefono?: string }>({})

  const isMobile = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  const buildWhatsAppUrls = (numero: string, mensaje: string) => {
    let numeroLimpio = numero.replaceAll(/\D/g, '');
    if (numeroLimpio.length === 9) {
      numeroLimpio = '34' + numeroLimpio;
    }
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
      // No abrimos automáticamente en desktop — mostramos el diálogo
      // con opciones para que el usuario elija (wa.me o WhatsApp Web)
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

    // Si hay countdown activo, es un reintento del usuario (app ya caliente)
    if (retryCountdown !== null) {
      clearRetryTimers();
      globalThis.open(link, '_blank', 'noopener,noreferrer');
      return;
    }

    // Primer intento: abre wa.me (puede fallar por cold start)
    globalThis.open(link, '_blank', 'noopener,noreferrer');

    // Cuenta atrás de 10s → al terminar el botón cambia a "Reintentar"
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
    const match = link.match(/wa\.me\/(\d+)\?text=(.+)/);
    if (!match) return link;
    return `https://web.whatsapp.com/send?phone=${match[1]}&text=${match[2]}`;
  };

  const handleConfirmOrder = useCallback(async () => {
    setErrors({});
    
    const validateName = (name: string): string | undefined => {
      const trimmed = name.trim();
      if (!trimmed) return t("validationNameRequired", language);
      if (trimmed.length < 2) return t("validationNameMin", language);
      if (trimmed.length > 100) return t("validationNameMax", language);
      if (!/^[a-zA-ZÀ-ÿ\s'-]+$/u.test(trimmed)) return t("validationNameFormat", language);
      return undefined;
    };

    const validatePhone = (phone: string): string | undefined => {
      const trimmed = phone.trim();
      if (!trimmed) return t("validationPhoneRequired", language);
      const digitsOnly = trimmed.replaceAll(/\D/g, '');
      if (digitsOnly.length < 9) return t("validationPhoneMin", language);
      if (digitsOnly.length > 15) return t("validationPhoneMax", language);
      return undefined;
    };
    
    const nombreError = validateName(nombre);
    const telefonoError = validatePhone(telefono);
    
    if (nombreError || telefonoError) {
      setErrors({ nombre: nombreError, telefono: telefonoError });
      return;
    }

    const sanitizedNombre = nombre.trim().slice(0, 100);
    const sanitizedTelefono = telefono.replaceAll(/\D/g, '').slice(0, 15);
    const sanitizedEmail = email.trim().toLowerCase().slice(0, 100);

    setSending(true);
    try {
      const res = await fetch('/api/pedidos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: items.map(ci => ({
            item: {
              id: ci.item.id,
              name: (language !== 'es' && ci.item.translations?.[language]?.name) || ci.item.name,
              price: ci.item.price,
              translations: ci.item.translations,
            },
            quantity: ci.quantity,
            selectedComplements: ci.selectedComplements?.map(c => ({
              name: c.name,
              price: c.price,
            })),
          })),
          total: totalPrice,
          nombre: sanitizedNombre,
          telefono: sanitizedTelefono,
          email: sanitizedEmail,
        }),
      });
      
      const data = await res.json();
      console.log('[Pedido] Respuesta API:', { success: res.ok, numeroPedido: data.numeroPedido, hasWhatsappLink: !!data.whatsappLink });
      
      if (res.ok) {
        closeCart();
        setNombre('');
        setTelefono('');
        setEmail('');
        setOrderNumber(data.numeroPedido || null);
        setCompanyPhone(data.companyPhone || null);
        
        if (data.whatsappLink) {
          (globalThis as Record<string, unknown>).__whatsappLink = data.whatsappLink;
          const match = data.whatsappLink.match(/wa\.me\/(\d+)\?text=(.+)/);
          if (match) {
            const numero = match[1];
            const mensaje = decodeURIComponent(match[2]);
            abrirWhatsApp(numero, mensaje);
          }
        }
        setSent(true);
        setConfirming(false);
      } else {
        setErrors({ nombre: data.error || t("validationOrderError", language) });
      }
    } catch (err) {
      console.error('Error:', err);
      setErrors({ nombre: t("connectionError", language) });
    } finally {
      setSending(false);
    }
  }, [nombre, telefono, email, items, totalPrice, language, closeCart, abrirWhatsApp]);

  return (
    <>
      <Dialog open={sent} onOpenChange={(open) => {
        if (!open) {
          setSent(false)
          setConfirming(false)
          setMessageCopied(false)
          clearRetryTimers()
          clearCart()
          closeCart()
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-primary">
              <span className="text-2xl">✓</span>
              {t("sendingOrder", language)}
            </DialogTitle>
            <DialogDescription className="text-base">
              {isMobile
                ? (confirming ? t("sendingOrder", language) : t("whatsappCheck", language))
                : t("whatsappDesktopChoice", language)
              }
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
                  <button
                    type="button"
                    onClick={handleOpenInApp}
                    disabled={retryCountdown !== null && retryCountdown > 0}
                    className="w-full text-center bg-whatsapp text-primary-foreground py-3 px-4 rounded-full font-semibold hover:bg-whatsapp-hover transition-colors duration-150 disabled:opacity-70"
                  >
                    {retryCountdown === null
                      ? t("whatsappDesktopApp", language)
                      : retryCountdown > 0
                        ? t("whatsappRetrying", language).replace("{seconds}", String(retryCountdown))
                        : t("whatsappRetry", language)
                    }
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
          {companyPhone && orderNumber && (
            <div className="bg-foreground text-background p-3 rounded-lg mt-4 w-full text-center">
              <p className="text-xs font-medium">
                * {t("whatsappCantSend", language)} {companyPhone} {t("withOrderNumber", language)} #{orderNumber}
              </p>
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
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-muted-foreground">
            <div className="relative animate-empty-float">
              <ShoppingBag className="size-12 opacity-20" />
              <span className="absolute inset-0 flex items-center justify-center text-2xl opacity-30">+</span>
            </div>
            <p className="text-base font-medium text-foreground">{t("emptyCart", language)}</p>
            <p className="text-sm text-center max-w-[200px]">{t("addDishesToStart", language)}</p>
            <button
              onClick={() => {
                closeCart();
                document.getElementById('menu')?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="mt-2 px-6 py-3 bg-primary text-primary-foreground rounded-full font-medium hover:bg-primary/90 transition-colors min-h-[44px]"
            >
              {t("viewMenu", language)}
            </button>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto">
              <ul className="flex flex-col gap-3 py-4">
                {items.map((ci) => {
                  const itemKey = getItemKey(ci.item, ci.selectedComplements);
                  const complementPrice = ci.selectedComplements?.reduce((sum, c) => sum + c.price, 0) || 0;
                  const totalItemPrice = ci.item.price + complementPrice;
                  let itemAnimationClass = '';
                  if (ci.justAdded) {
                    itemAnimationClass = 'animate-cart-item-add';
                  } else if (ci.justRemoved) {
                    itemAnimationClass = 'animate-cart-item-remove';
                  }
                  return (
                    <li 
                      key={itemKey} 
                      className={`flex items-center gap-3 rounded-lg bg-card p-3 ${itemAnimationClass}`}
                    >
                      <div className="flex-1">
                        <p className="font-semibold text-card-foreground">
                          {(language !== "es" && ci.item.translations?.[language]?.name) || ci.item.name}
                        </p>
                        {ci.selectedComplements && ci.selectedComplements.length > 0 && (
                          <p className="text-xs text-muted-foreground">
                            + {ci.selectedComplements.map(c => c.name).join(', ')}
                          </p>
                        )}
                        <p className="text-sm text-muted-foreground">
                          {totalItemPrice.toFixed(2).replace(".", ",")}{"€"}
                        </p>
                      </div>

                      <div className="flex items-center gap-1 md:gap-2">
                        <RippleButton
                          variant="outline"
                          size="icon"
                          className="min-h-[44px] min-w-[44px] md:min-h-7 md:min-w-7 bg-transparent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          onClick={() => updateQuantity(itemKey, ci.quantity - 1)}
                          aria-label={t("reduceQuantity", language)}
                        >
                          <Minus className="size-4" />
                        </RippleButton>
                        <span className="w-6 md:w-6 text-center font-semibold text-foreground animate-quantity-pulse" key={ci.quantity}>
                          {ci.quantity}
                        </span>
                        <RippleButton
                          variant="outline"
                          size="icon"
                          className="min-h-[44px] min-w-[44px] md:min-h-7 md:min-w-7 bg-transparent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          onClick={() => updateQuantity(itemKey, ci.quantity + 1)}
                          aria-label={t("increaseQuantity", language)}
                        >
                          <Plus className="size-4" />
                        </RippleButton>
                        <RippleButton
                          variant="ghost"
                          size="icon"
                          className="min-h-[44px] min-w-[44px] md:min-h-7 md:min-w-7 text-destructive hover:text-destructive hover:bg-destructive/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
                  <div className="flex items-center gap-2">
                    <User className="size-4 text-muted-foreground" />
                    <Input
                      type="text"
                      placeholder={t("placeholderName", language)}
                      value={nombre}
                      onChange={(e) => { setNombre(e.target.value); setErrors(prev => ({ ...prev, nombre: undefined })); }}
                      className={`h-9 ${errors.nombre ? 'border-destructive' : ''}`}
                      maxLength={100}
                      autoComplete="name"
                      aria-label={t("placeholderName", language)}
                      aria-describedby={errors.nombre ? "nombre-error" : undefined}
                      aria-invalid={!!errors.nombre}
                    />
                  </div>
                  {errors.nombre && <p id="nombre-error" role="alert" className="text-xs text-destructive mt-1 ml-6">{errors.nombre}</p>}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <Phone className="size-4 text-muted-foreground" />
                    <Input
                      type="tel"
                      placeholder={t("placeholderPhone", language)}
                      value={telefono}
                      onChange={(e) => { const val = e.target.value.replaceAll(/\D/g, '').slice(0, 15); setTelefono(val); setErrors(prev => ({ ...prev, telefono: undefined })); }}
                      className={`h-9 ${errors.telefono ? 'border-destructive' : ''}`}
                      maxLength={15}
                      autoComplete="tel"
                      aria-label={t("placeholderPhone", language)}
                      aria-describedby={errors.telefono ? "telefono-error" : undefined}
                      aria-invalid={!!errors.telefono}
                    />
                  </div>
                  {errors.telefono && <p id="telefono-error" role="alert" className="text-xs text-destructive mt-1 ml-6">{errors.telefono}</p>}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <Mail className="size-4 text-muted-foreground" />
                    <Input
                      type="email"
                      placeholder={t("placeholderEmail", language)}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="h-9"
                      maxLength={100}
                      autoComplete="email"
                      aria-label={t("placeholderEmail", language)}
                    />
                  </div>
                  <p className="text-xs mt-1 ml-6 text-muted-foreground">{t("promoMessage", language)}</p>
                </div>
              </div>

              <div className="mb-4 flex items-center justify-between px-2">
                <span className="text-lg font-semibold text-foreground">{t("total", language)}</span>
                <span className="text-2xl font-bold text-foreground tabular-nums animate-price-update" key={totalPrice}>
                  {totalPrice.toFixed(2).replace(".", ",") + "€"}
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
