"use client"

import { Minus, Plus, Trash2, ShoppingBag, User, Phone, Mail } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
// Removed unused import 'Label'
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
import { useState } from "react"

import { useCart, type Complement } from "@/lib/cart-context"
import { useLanguage } from "@/lib/language-context"
import { t } from "@/lib/translations"
import type { MenuItemVM } from "@/core/application/dtos/menu-view-model"

function getItemKey(item: MenuItemVM, complements?: Complement[]): string {
  const complementIds = complements?.map(c => c.id).sort().join(',') || '';
  return `${item.id}-${complementIds}`;
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
  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [email, setEmail] = useState('')
  const [errors, setErrors] = useState<{ nombre?: string; telefono?: string }>({})

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

  const handleConfirmOrder = async () => {
    setErrors({});
    
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
      
      if (res.ok) {
        if (data.whatsappLink) {
          window.open(data.whatsappLink, '_blank');
        }
        setSent(true);
        setNombre('');
        setTelefono('');
        setEmail('');
      } else {
        setErrors({ nombre: data.error || t("validationOrderError", language) });
      }
    } catch (err) {
      console.error('Error:', err);
      setErrors({ nombre: t("validationOrderError", language) });
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <Dialog open={sent} onOpenChange={(open) => {
        if (!open) {
          setSent(false)
          clearCart()
          closeCart()
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-600">
              <span className="text-2xl">✓</span>
              {t("orderReceivedTitle", language)}
            </DialogTitle>
            <DialogDescription className="text-base">
              {t("orderReceivedMessage", language)}
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>

      <Sheet open={isCartOpen} onOpenChange={closeCart}>
      <SheetContent className="flex w-full flex-col sm:max-w-md bg-background">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 font-serif text-foreground">
            <ShoppingBag className="size-5" />
            {t("yourOrder", language)}
          </SheetTitle>
          <SheetDescription>
            {t("cartDescription", language)}
          </SheetDescription>
        </SheetHeader>

        {items.length > 0 && (
          <div className="mx-1 mb-3 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
            <p className="text-sm text-amber-800 font-medium">
              {t("noPaymentRequired", language)}
            </p>
          </div>
        )}

        {items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
            <ShoppingBag className="size-12 opacity-30" />
            <p className="text-lg">{t("emptyCart", language)}</p>
            <p className="text-sm">{t("addDishesToStart", language)}</p>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto">
              <div className="flex flex-col gap-3 py-4">
                {items.map((ci) => {
                  const itemKey = getItemKey(ci.item, ci.selectedComplements);
                  const complementPrice = ci.selectedComplements?.reduce((sum, c) => sum + c.price, 0) || 0;
                  const totalItemPrice = ci.item.price + complementPrice;
                  return (
                    <div key={itemKey} className="flex items-center gap-3 rounded-lg bg-card p-3">
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

                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="icon"
                          className="size-7 bg-transparent"
                          onClick={() => updateQuantity(itemKey, ci.quantity - 1)}
                          aria-label={t("reduceQuantity", language)}
                        >
                          <Minus className="size-3" />
                        </Button>
                        <span className="w-6 text-center font-semibold text-foreground">{ci.quantity}</span>
                        <Button
                          variant="outline"
                          size="icon"
                          className="size-7 bg-transparent"
                          onClick={() => updateQuantity(itemKey, ci.quantity + 1)}
                          aria-label={t("increaseQuantity", language)}
                        >
                          <Plus className="size-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 text-destructive hover:text-destructive"
                          onClick={() => removeItem(itemKey)}
                          aria-label={`${t("remove", language)} ${(language !== "es" && ci.item.translations?.[language]?.name) || ci.item.name}`}
                        >
                          <Trash2 className="size-3" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="border-t border-border pt-4 pb-6 px-2 bg-background/80 shadow-[0_-2px_16px_0_rgba(0,0,0,0.04)] rounded-b-xl">
              <div className="space-y-3 mb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <User className="size-4 text-muted-foreground" />
                    <Input
                      type="text"
                      placeholder={t("placeholderName", language)}
                      value={nombre}
                      onChange={(e) => { setNombre(e.target.value); setErrors(prev => ({ ...prev, nombre: undefined })); }}
                      className={`h-9 ${errors.nombre ? 'border-red-500' : ''}`}
                      maxLength={100}
                      autoComplete="name"
                    />
                  </div>
                  {errors.nombre && <p className="text-xs text-red-500 mt-1 ml-6">{errors.nombre}</p>}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <Phone className="size-4 text-muted-foreground" />
                    <Input
                      type="tel"
                      placeholder={t("placeholderPhone", language)}
                      value={telefono}
                      onChange={(e) => { const val = e.target.value.replaceAll(/\D/g, '').slice(0, 15); setTelefono(val); setErrors(prev => ({ ...prev, telefono: undefined })); }}
                      className={`h-9 ${errors.telefono ? 'border-red-500' : ''}`}
                      maxLength={15}
                      autoComplete="tel"
                    />
                  </div>
                  {errors.telefono && <p className="text-xs text-red-500 mt-1 ml-6">{errors.telefono}</p>}
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
                    />
                  </div>
                  <p className="text-xs mt-1 ml-6 bg-gradient-to-r from-orange-500 via-pink-500 to-purple-500 bg-clip-text text-transparent font-medium">{t("promoMessage", language)}</p>
                </div>
              </div>

              <div className="mb-4 flex items-center justify-between px-2">
                <span className="text-lg font-semibold text-foreground">{t("total", language)}</span>
                <span className="font-serif text-2xl font-bold text-foreground">
                  {totalPrice.toFixed(2).replace(".", ",") + "€"}
                </span>
              </div>

              <div className="flex flex-col gap-2 px-1">
                <Button 
                  className="w-full bg-primary text-primary-foreground hover:bg-primary/90 rounded-full py-3 text-lg font-semibold shadow-md transition-all duration-200"
                  size="lg"
                  onClick={handleConfirmOrder}
                  disabled={sending || sent}
                >
                  {(() => {
                    if (sending) return 'Enviando...';
                    if (sent) return '¡Pedido enviado!';
                    return t("confirmOrder", language);
                  })()}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground rounded-full py-2 font-medium hover:bg-muted/40 transition-all duration-200"
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
