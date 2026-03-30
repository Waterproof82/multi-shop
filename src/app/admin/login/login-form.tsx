'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { saveCsrfToken } from '@/lib/csrf-client';
import { logClientError } from '@/lib/client-error';
import { useLanguage } from '@/lib/language-context';
import { t } from '@/lib/translations';

interface LoginFormProps {
  readonly empresaNombre: string | null;
}

export default function LoginForm({ empresaNombre }: LoginFormProps) {
  const router = useRouter();
  const { language } = useLanguage();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [csrfToken, setCsrfToken] = useState('');

  useEffect(() => {
    fetch('/api/admin/login', { method: 'GET' })
      .then(res => res.json())
      .then(data => {
        if (data.csrfToken) {
          setCsrfToken(data.csrfToken);
          saveCsrfToken(data.csrfToken);
        }
      })
      .catch((error) => {
        logClientError(error, 'fetchCsrfToken');
        setError(t('loginFormError', language));
      });
  }, [language]);

  const handleSubmit = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 429) throw new Error(t('loginRateLimit', language));
        throw new Error(t('loginErrorDefault', language));
      }

      if (data.data?.admin?.rol === 'superadmin') {
        router.push('/superadmin');
      } else {
        router.push('/admin');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('unknownError', language));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="max-w-md w-full p-8 bg-card rounded-lg shadow-elegant-lg border border-border">
        <div className="text-center mb-8">
          {empresaNombre ? (
            <h1 className="text-2xl font-semibold text-foreground">
              {empresaNombre}
            </h1>
          ) : (
            <h1 className="text-2xl font-semibold text-foreground">
              {t("adminPanel", language)}
            </h1>
          )}
          <p className="text-muted-foreground mt-2">
            {empresaNombre ? t("adminPanel", language) : t("loginSubtitle", language)}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div id="login-error" role="alert" className="p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-md text-sm">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-foreground">
              {t("email", language)}
            </label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              aria-invalid={!!error}
              aria-describedby={error ? "login-error" : undefined}
              placeholder="admin@tuempresa.com"
              className="mt-1"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-foreground">
              {t("passwordLabel", language)}
            </label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              aria-invalid={!!error}
              aria-describedby={error ? "login-error" : undefined}
              placeholder="••••••••"
              className="mt-1"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex justify-center py-3 px-4 min-h-[44px] border border-transparent rounded-md text-sm font-medium text-primary-foreground bg-primary hover:bg-primary/90 outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-ring disabled:opacity-50 transition-all duration-150 ease-out active:scale-[0.98]"
          >
            {loading ? (
              <>
                <Loader2 className="animate-spin motion-reduce:animate-none h-4 w-4 mr-2" />
                {t("signingIn", language)}
              </>
            ) : (
              t("loginButton", language)
            )}
          </button>
        </form>

        <div className="mt-6 text-center">
          <Link href="/" className="text-sm text-primary hover:underline">
            ← {t("backToMenu", language)}
          </Link>
        </div>
      </div>
    </div>
  );
}
