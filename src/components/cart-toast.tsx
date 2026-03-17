'use client';

import { useEffect, useState, useCallback } from 'react';
import { ShoppingBag, X } from 'lucide-react';
import { useCart } from '@/lib/cart-context';
import { useLanguage } from '@/lib/language-context';
import { t } from '@/lib/translations';

export function CartToast() {
  const { lastAddedItem, totalItems, totalPrice, isCartOpen, openCart } = useCart();
  const { language } = useLanguage();
  const [visible, setVisible] = useState(false);
  const [itemName, setItemName] = useState('');

  useEffect(() => {
    if (!lastAddedItem) {
      setVisible(false);
      return;
    }
    if (!isCartOpen) {
      setItemName(lastAddedItem.name);
      setVisible(true);

      const timer = setTimeout(() => {
        setVisible(false);
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [lastAddedItem, isCartOpen]);

  const handleClose = useCallback(() => {
    setVisible(false);
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-40 md:left-auto md:right-6 md:w-80 animate-in slide-in-from-bottom-4 duration-300">
      <div className="bg-card border border-border rounded-xl shadow-lg overflow-hidden">
        <div className="flex items-center justify-between p-3 bg-primary/5 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
              <ShoppingBag className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="text-sm font-medium text-foreground">
              {lastAddedItem?.quantity}x {lastAddedItem && lastAddedItem.quantity > 1 ? t("itemsAdded", language) : t("itemAdded", language)}
            </span>
          </div>
          <button
            onClick={handleClose}
            className="p-1 hover:bg-muted rounded-full transition-colors"
            aria-label={t("close", language)}
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
        
        <div className="p-3">
          <p className="text-sm text-foreground font-medium truncate mb-1">
            {itemName}
          </p>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              Total: {totalPrice.toFixed(2).replace('.', ',')}€
            </span>
            <button
              onClick={() => {
                handleClose();
                openCart();
              }}
              className="text-xs font-medium text-primary hover:underline"
            >
              {t("viewCart", language)} →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
