'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { saveCsrfToken } from '@/lib/csrf-client';
import { logClientError } from '@/lib/client-error';
import { useLanguage } from '@/lib/language-context';
import { t } from '@/lib/translations';

function TpvPinCard() {
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pin.length < 4 || loading) return;
    setLoading(true);
    setError(null);

    const res = await fetch('/api/tpv/empleados/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    });

    if (!res.ok) {
      setLoading(false);
      setError('PIN incorrecto');
      setPin('');
      return;
    }

    const data = await res.json() as { nextUrl?: string; rol?: string };
    window.dispatchEvent(new CustomEvent('tpv-auth-changed', {
      detail: { rol: data.rol ?? 'cajero', isEmployeeSession: true },
    }));
    const form = document.createElement('form');
    form.method = 'GET';
    form.action = data.nextUrl ?? '/tpv/mostrador';
    document.body.appendChild(form);
    form.submit();
  }

  return (
    <div className="max-w-md w-full bg-[#1a1d27] border border-[#2e3347] rounded-lg p-8">
      <div className="text-center mb-6">
        <span className="inline-block text-xs font-bold text-[#4f72ff] uppercase tracking-widest mb-2">TPV</span>
        <h2 className="text-lg font-semibold text-[#e8eaf0]">Acceso de empleado</h2>
        <p className="text-sm text-[#6b7280] mt-1">Introduce tu PIN para acceder al TPV</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error !== null && (
          <div role="alert" className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-md text-sm text-center">
            {error}
          </div>
        )}
        <input
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={pin}
          onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
          placeholder="PIN (4-8 dígitos)"
          style={{ WebkitTextSecurity: 'disc' } as React.CSSProperties}
          className="w-full bg-[#22263a] border border-[#2e3347] rounded-md px-4 py-3 text-xl font-bold text-center tracking-widest text-[#e8eaf0] outline-none focus:border-[#4f72ff] transition-colors placeholder:text-sm placeholder:font-normal placeholder:tracking-normal placeholder:text-[#6b7280]"
        />
        <button
          type="submit"
          disabled={pin.length < 4 || loading}
          className="w-full flex justify-center items-center gap-2 py-3 px-4 min-h-[44px] rounded-md text-sm font-medium text-white bg-[#4f72ff] hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        >
          {loading ? (
            <>
              <Loader2 className="animate-spin h-4 w-4" />
              Verificando...
            </>
          ) : (
            'Entrar al TPV'
          )}
        </button>
      </form>
    </div>
  );
}

interface LoginFormProps {
  readonly empresaNombre: string | null;
}

export default function LoginForm({ empresaNombre }: LoginFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
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

      // Save the CSRF token returned by login so it's available immediately for admin actions
      if (data.data?.csrfToken) {
        saveCsrfToken(data.data.csrfToken);
      }

      if (data.data?.admin?.rol === 'superadmin') {
        router.push('/superadmin');
      } else {
        const next = searchParams.get('next');
        const destination = next?.startsWith('/') ? next : '/admin';
        router.push(destination);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('unknownError', language));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 py-10 bg-background">
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

      <TpvPinCard />
    </div>
  );
}
