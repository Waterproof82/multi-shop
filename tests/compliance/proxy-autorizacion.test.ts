/**
 * Tests de CARACTERIZACIÓN de `src/proxy.ts`.
 *
 * No describen cómo debería comportarse el proxy: describen cómo se comporta HOY.
 * Existen para poder refactorizarlo (complejidad 28) sabiendo que nada cambió.
 *
 * POR QUÉ ESTE FICHERO IMPORTA MÁS QUE OTROS
 * `proxy.ts` decide, para CADA petición, si hace falta autenticarse. Un fallo
 * aquí no degrada una pantalla: abre el sistema. Y la parte más frágil no son
 * las ramas de JWT —esas fallan ruidosamente— sino la CADENA DE `if` del final:
 * está ordenada, y el orden es parte del contrato. Añadir una ruta en el sitio
 * equivocado, o mover un bloque, no rompe ningún test de negocio ni falla en
 * desarrollo. Simplemente deja una puerta abierta.
 *
 * La suite 1 congela esa cadena como una tabla legible.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// ── Dobles ────────────────────────────────────────────────────────────────────
// Se sustituye todo lo que sale de proceso (Upstash, Supabase) y la verificación
// criptográfica, para que los tests midan DECISIONES de enrutado y no jose.

const rateLimitAdminMock = vi.fn(async () => null as unknown);
const jwtVerifyMock = vi.fn();
const isTokenRevokedMock = vi.fn(async () => false);
const verifyCsrfTokenMock = vi.fn(() => true);
const verifyWaiterTokenMock = vi.fn(async () => null as unknown);
const verifyTpvEmployeeTokenMock = vi.fn(async () => null as unknown);

vi.mock('@/core/infrastructure/api/rate-limit', () => ({
  rateLimitAdmin: (...a: unknown[]) => rateLimitAdminMock(...(a as [])),
}));
vi.mock('jose', () => ({
  jwtVerify: (...a: unknown[]) => jwtVerifyMock(...(a as [])),
}));
vi.mock('@/lib/token-revocation', () => ({
  isTokenRevoked: (...a: unknown[]) => isTokenRevokedMock(...(a as [])),
}));
vi.mock('@/lib/csrf', () => ({
  verifyCsrfToken: (...a: unknown[]) => verifyCsrfTokenMock(...(a as [])),
}));
vi.mock('@/lib/waiter-auth', () => ({
  verifyWaiterToken: (...a: unknown[]) => verifyWaiterTokenMock(...(a as [])),
}));
vi.mock('@/lib/tpv-employee-auth', () => ({
  verifyTpvEmployeeToken: (...a: unknown[]) => verifyTpvEmployeeTokenMock(...(a as [])),
  signTpvEmployeeToken: vi.fn(async () => 'token-firmado'),
}));
vi.mock('@/core/infrastructure/database/supabase-client', () => ({
  getSupabaseClient: () => ({}),
}));

const { proxy } = await import('@/proxy');

// ── Utilidades ────────────────────────────────────────────────────────────────

const HOST = 'https://mermelada-tomate.es';

function peticion(
  path: string,
  { metodo = 'GET', cookies = {}, cabeceras = {} }: {
    metodo?: string;
    cookies?: Record<string, string>;
    cabeceras?: Record<string, string>;
  } = {},
): NextRequest {
  const headers = new Headers(cabeceras);
  const galletas = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
  if (galletas) headers.set('cookie', galletas);
  return new NextRequest(`${HOST}${path}`, { method: metodo, headers });
}

/** `NextResponse.next()` marca la respuesta con esta cabecera interna de Next. */
function dejaPasar(res: Response): boolean {
  return res.status === 200 && res.headers.has('x-middleware-next');
}

/** Token de admin válido, ya verificado por el doble de `jose`. */
function adminValido(rol = 'admin', empresaId: string | null = 'e1') {
  jwtVerifyMock.mockResolvedValue({
    payload: { adminId: 'a1', rol, empresaId, jti: 'jti-1' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  rateLimitAdminMock.mockResolvedValue(null);
  isTokenRevokedMock.mockResolvedValue(false);
  verifyCsrfTokenMock.mockReturnValue(true);
  verifyWaiterTokenMock.mockResolvedValue(null);
  verifyTpvEmployeeTokenMock.mockResolvedValue(null);
  process.env.ACCESS_TOKEN_SECRET = 'secreto-de-test';
});

// ── Suite 1: la tabla de enrutado ─────────────────────────────────────────────

describe('qué rutas exigen autenticación (sin credenciales)', () => {
  /** Rutas que DEBEN bloquear a un anónimo. */
  const PROTEGIDAS = [
    '/api/admin/productos',
    '/api/admin/pedidos/delete-all',
    '/api/waiter/mesa',
    '/api/waiter/pendientes',
    '/api/kitchen/items',
    '/api/tpv/stock/mermas',
    '/api/laborcontrol/fichaje',
    '/api/superadmin/empresas',
    // Despacho manual a Glovo: es una acción de admin. El webhook y el quote
    // quedan fuera a propósito (ver más abajo).
    '/api/glovo/order',
  ];

  it.each(PROTEGIDAS)('%s bloquea al anónimo', async (ruta) => {
    const res = await proxy(peticion(ruta));
    expect([401, 403]).toContain(res.status);
  });

  /**
   * Rutas que DEBEN seguir siendo públicas. Esta lista es tan importante como la
   * de arriba: si alguien mete una aquí por error, la expone.
   */
  const PUBLICAS = [
    '/api/admin/login',
    '/api/admin/promociones/unsubscribe',
    '/api/unsubscribe',
    '/api/csp-report',
    '/api/promo/reservar',
    '/api/promo/item/abc',
    '/api/waiter/auth',
    '/api/waiter/logout',
    '/api/tpv/empleados/login',
    '/api/tpv/empleados/logout',
    '/api/tpv/activate',
    // El webhook lo llama Glovo y verifica HMAC internamente; el quote es
    // público y acotado por dominio.
    '/api/glovo/webhook',
    '/api/glovo/quote',
    // El cron valida CRON_SECRET dentro de la propia ruta.
    '/api/laborcontrol/cron/seal',
  ];

  it.each(PUBLICAS)('%s deja pasar sin credenciales', async (ruta) => {
    const res = await proxy(peticion(ruta));
    expect(dejaPasar(res)).toBe(true);
  });

  it('el export de auditoría pasa solo con Bearer, no sin él', async () => {
    const sinBearer = await proxy(peticion('/api/tpv/audit/export'));
    expect(dejaPasar(sinBearer)).toBe(false);

    const conBearer = await proxy(
      peticion('/api/tpv/audit/export', { cabeceras: { authorization: 'Bearer t' } }),
    );
    expect(dejaPasar(conBearer)).toBe(true);
  });

  it('el preflight OPTIONS de /api/* responde 204 sin tocar auth', async () => {
    const res = await proxy(peticion('/api/admin/productos', { metodo: 'OPTIONS' }));
    expect(res.status).toBe(204);
  });
});

// ── Suite 2: ramas de autorización de admin ───────────────────────────────────

describe('handleAdminAuth — cada rama de rechazo', () => {
  it('sin admin_token → 401', async () => {
    const res = await proxy(peticion('/api/admin/productos'));
    expect(res.status).toBe(401);
  });

  it('sin ACCESS_TOKEN_SECRET configurado → 500, no 401', async () => {
    // Importa distinguirlos: 401 dice "credencial mala", 500 dice "el servidor
    // está mal montado". Confundirlos manda a depurar al sitio equivocado.
    delete process.env.ACCESS_TOKEN_SECRET;
    const res = await proxy(peticion('/api/admin/productos', { cookies: { admin_token: 't' } }));
    expect(res.status).toBe(500);
  });

  it('JWT que no verifica → 401', async () => {
    jwtVerifyMock.mockRejectedValue(new Error('firma inválida'));
    const res = await proxy(peticion('/api/admin/productos', { cookies: { admin_token: 't' } }));
    expect(res.status).toBe(401);
  });

  it('token sin adminId → 401', async () => {
    jwtVerifyMock.mockResolvedValue({ payload: { jti: 'j', rol: 'admin' } });
    const res = await proxy(peticion('/api/admin/productos', { cookies: { admin_token: 't' } }));
    expect(res.status).toBe(401);
  });

  it('token SIN jti → 401 (no se podría revocar nunca)', async () => {
    jwtVerifyMock.mockResolvedValue({ payload: { adminId: 'a1', rol: 'admin', empresaId: 'e1' } });
    const res = await proxy(peticion('/api/admin/productos', { cookies: { admin_token: 't' } }));
    expect(res.status).toBe(401);
  });

  it('token cuyo jti está revocado → 401', async () => {
    adminValido();
    isTokenRevokedMock.mockResolvedValue(true);
    const res = await proxy(peticion('/api/admin/productos', { cookies: { admin_token: 't' } }));
    expect(res.status).toBe(401);
  });

  it('el rate limit corta ANTES de verificar el JWT', async () => {
    // El orden es deliberado: verificar firmas es caro, y hacerlo antes del
    // límite permitiría inundar ese paso a base de tokens basura.
    rateLimitAdminMock.mockResolvedValue(
      new Response(null, { status: 429 }) as unknown as null,
    );
    const res = await proxy(peticion('/api/admin/productos', { cookies: { admin_token: 't' } }));
    expect(res.status).toBe(429);
    expect(jwtVerifyMock).not.toHaveBeenCalled();
  });

  it('token válido en GET → pasa y propaga identidad en cabeceras', async () => {
    adminValido('admin', 'empresa-7');
    const res = await proxy(peticion('/api/admin/productos', { cookies: { admin_token: 't' } }));

    expect(dejaPasar(res)).toBe(true);
    expect(res.headers.get('x-empresa-id')).toBe('empresa-7');
    expect(res.headers.get('x-admin-id')).toBe('a1');
    expect(res.headers.get('x-admin-rol')).toBe('admin');
  });
});

// ── Suite 3: CSRF en métodos mutativos ────────────────────────────────────────

describe('CSRF de admin — solo en métodos que escriben', () => {
  const MUTATIVOS = ['POST', 'PUT', 'DELETE', 'PATCH'];

  it.each(MUTATIVOS)('%s sin cabecera csrf → 403', async (metodo) => {
    adminValido();
    const res = await proxy(
      peticion('/api/admin/productos', { metodo, cookies: { admin_token: 't' } }),
    );
    expect(res.status).toBe(403);
  });

  it('POST con csrf cuya firma no valida → 403', async () => {
    adminValido();
    verifyCsrfTokenMock.mockReturnValue(false);
    const res = await proxy(peticion('/api/admin/productos', {
      metodo: 'POST',
      cookies: { admin_token: 't', csrf_token: 'abc:firma' },
      cabeceras: { 'x-csrf-token': 'abc' },
    }));
    expect(res.status).toBe(403);
  });

  it('POST cuya cabecera csrf NO coincide con la cookie → 403', async () => {
    // La firma es válida, pero el valor no es el mismo: es justo el ataque que
    // el double-submit pretende parar.
    adminValido();
    const res = await proxy(peticion('/api/admin/productos', {
      metodo: 'POST',
      cookies: { admin_token: 't', csrf_token: 'abc:firma' },
      cabeceras: { 'x-csrf-token': 'otro-valor' },
    }));
    expect(res.status).toBe(403);
  });

  it('POST con csrf correcto → pasa', async () => {
    adminValido();
    const res = await proxy(peticion('/api/admin/productos', {
      metodo: 'POST',
      cookies: { admin_token: 't', csrf_token: 'abc:firma' },
      cabeceras: { 'x-csrf-token': 'abc' },
    }));
    expect(dejaPasar(res)).toBe(true);
  });

  it('GET con token válido NO exige csrf', async () => {
    adminValido();
    const res = await proxy(peticion('/api/admin/productos', { cookies: { admin_token: 't' } }));
    expect(dejaPasar(res)).toBe(true);
  });
});

// ── Suite 4: superadmin ───────────────────────────────────────────────────────

describe('/api/superadmin exige rol superadmin, no solo sesión válida', () => {
  it('un admin normal autenticado → 403', async () => {
    adminValido('admin');
    const res = await proxy(peticion('/api/superadmin/empresas', { cookies: { admin_token: 't' } }));
    expect(res.status).toBe(403);
  });

  it('un superadmin → pasa', async () => {
    adminValido('superadmin', null);
    const res = await proxy(peticion('/api/superadmin/empresas', { cookies: { admin_token: 't' } }));
    expect(dejaPasar(res)).toBe(true);
  });

  it('superadmin con empresaId null propaga cadena vacía, no "null"', async () => {
    adminValido('superadmin', null);
    const res = await proxy(peticion('/api/superadmin/empresas', { cookies: { admin_token: 't' } }));
    expect(res.headers.get('x-empresa-id')).toBe('');
  });
});

// ── Suite 5: CSP en rutas de página ───────────────────────────────────────────

describe('CSP de las páginas', () => {
  const cspDe = (res: Response) => res.headers.get('content-security-policy') ?? '';
  const nonceDe = (csp: string) => /'nonce-([^']+)'/.exec(csp)?.[1];

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('en PRODUCCIÓN usa nonce + strict-dynamic', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const csp = cspDe(await proxy(peticion('/')));

    expect(csp).toContain('strict-dynamic');
    expect(csp).toMatch(/'nonce-[A-Za-z0-9+/=]+'/);

    // La comprobación se acota a `script-src` a propósito. `style-src` SÍ lleva
    // `unsafe-inline` en producción —lo necesitan los estilos en línea de Next y
    // Tailwind— y es aceptable: inyectar CSS no ejecuta código. Afirmar sobre la
    // cadena entera confundiría ambas cosas y daría un falso positivo.
    const scriptSrc = csp.split(';').find((d) => d.trim().startsWith('script-src')) ?? '';
    expect(scriptSrc).not.toContain('unsafe-inline');
    expect(scriptSrc).not.toContain('unsafe-eval');
  });

  it('el nonce cambia en cada petición', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    const a = nonceDe(cspDe(await proxy(peticion('/'))));
    const b = nonceDe(cspDe(await proxy(peticion('/'))));

    expect(a).toBeTruthy();
    expect(a).not.toBe(b);
  });

  it('en DESARROLLO afloja a unsafe-inline/eval (lo pide el HMR de Turbopack)', async () => {
    // Caracterizado a propósito: es una diferencia deliberada entre entornos, y
    // quien refactorice `buildCsp` tiene que saber que existe antes de "limpiarla".
    vi.stubEnv('NODE_ENV', 'development');
    const csp = cspDe(await proxy(peticion('/')));

    expect(csp).toContain('unsafe-inline');
    expect(csp).toContain('unsafe-eval');
    expect(csp).not.toContain('strict-dynamic');
  });

  it('las páginas de admin no se pueden empotrar en un iframe', async () => {
    const admin = cspDe(await proxy(peticion('/admin/productos')));
    const publica = cspDe(await proxy(peticion('/')));

    expect(admin).toContain("frame-ancestors 'none'");
    expect(publica).toContain("frame-ancestors 'self'");
  });
});
