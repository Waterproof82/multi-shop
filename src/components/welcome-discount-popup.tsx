'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Gift, Mail, X, Check, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useLanguage, type Language } from '@/lib/language-context';
import { t } from '@/lib/translations';
import { fetchWithCsrf } from '@/lib/csrf-client';

interface WelcomeDiscountPopupProps {
  empresaId: string;
  empresaNombre: string;
  porcentaje: number;
  idioma: Language;
}

export function WelcomeDiscountPopup({ empresaId, empresaNombre, porcentaje, idioma }: WelcomeDiscountPopupProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const shouldReduceMotion = useReducedMotion() ?? false;

  useEffect(() => {
    // Check if user has already dismissed the popup for this empresa
    const dismissedKey = `welcome_discount_dismissed_${empresaId}`;
    const alreadyDismissed = localStorage.getItem(dismissedKey);
    console.log('[WelcomeDiscount] Checking popup conditions:', { empresaId, alreadyDismissed });
    
    if (alreadyDismissed) {
      console.log('[WelcomeDiscount] Already dismissed, not showing');
      return;
    }

    // Show popup after 30 seconds (use 5 seconds for testing)
    console.log('[WelcomeDiscount] Setting timer for 30 seconds...');
    const timer = setTimeout(() => {
      console.log('[WelcomeDiscount] Timer fired, showing popup');
      setIsOpen(true);
    }, 30000); // 30000 = 30s, change to 5000 for 5s testing

    return () => clearTimeout(timer);
  }, [empresaId]);

  const handleClose = () => {
    setIsOpen(false);
    // Save to localStorage so popup doesn't show again
    localStorage.setItem(`welcome_discount_dismissed_${empresaId}`, 'true');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const response = await fetchWithCsrf('/api/descuento/subscribe', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || t('welcomeDiscountError', idioma));
        return;
      }

      setIsSuccess(true);
    } catch {
      setError(t('connectionError', idioma));
    } finally {
      setIsLoading(false);
    }
  };

  // Animation variants
  const fadeInUp = shouldReduceMotion
    ? { initial: {}, animate: {} }
    : {
        initial: { opacity: 0, y: 20 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: 20 },
      };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent 
        className="sm:max-w-md"
        showCloseButton={!isSuccess}
        aria-describedby="welcome-discount-desc"
      >
        <DialogHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <Gift className="h-8 w-8 text-primary" />
          </div>
          <DialogTitle className="text-xl font-bold text-foreground">
            {isSuccess 
              ? t('welcomeDiscountSuccessTitle', idioma)
              : t('welcomeDiscountTitle', idioma)
            }
          </DialogTitle>
          <DialogDescription id="welcome-discount-desc" className="text-base text-muted-foreground">
            {isSuccess 
              ? t('welcomeDiscountSuccess', idioma)
              : t('welcomeDiscountDescription', idioma).replace('{porcentaje}', porcentaje.toString()).replace('{nombre}', empresaNombre)
            }
          </DialogDescription>
        </DialogHeader>

        <AnimatePresence mode="wait">
          {isSuccess ? (
            <motion.div
              key="success"
              {...fadeInUp}
              className="flex flex-col items-center gap-4 py-4"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                <Check className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
              <Button 
                onClick={handleClose} 
                variant="default"
                className="w-full min-h-[44px]"
              >
                {t('welcomeDiscountClose', idioma)}
              </Button>
            </motion.div>
          ) : (
            <motion.div
              key="form"
              {...fadeInUp}
            >
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="welcome-email" className="sr-only">
                    {t('welcomeDiscountEmailLabel', idioma)}
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="welcome-email"
                      type="email"
                      placeholder={t('welcomeDiscountPlaceholder', idioma)}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="pl-10 min-h-[44px]"
                      autoComplete="email"
                      aria-label={t('welcomeDiscountEmailLabel', idioma)}
                    />
                  </div>
                </div>

                {error && (
                  <p role="alert" className="text-sm text-destructive">
                    {error}
                  </p>
                )}

                <Button 
                  type="submit" 
                  disabled={isLoading}
                  className="w-full min-h-[44px]"
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    t('welcomeDiscountSubmit', idioma)
                  )}
                </Button>
              </form>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Close button for accessibility - hidden visually but available to screen readers */}
        {!isSuccess && (
          <button
            type="button"
            onClick={handleClose}
            className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:right-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-background focus:rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
            aria-label={t('close', idioma)}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Helper component for the label
function Label({ htmlFor, children, className }: { htmlFor?: string; children: React.ReactNode; className?: string }) {
  return (
    <label 
      htmlFor={htmlFor} 
      className={className}
    >
      {children}
    </label>
  );
}