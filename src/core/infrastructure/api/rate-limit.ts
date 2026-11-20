import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { NextResponse } from "next/server";

let redis: Redis | null = null;

function getRedis(): Redis | null {
  if (redis) return redis;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[rate-limit] CRITICAL: UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are not set. Rate limiting is disabled in production.');
    }
    return null;
  }

  redis = new Redis({ url, token });
  return redis;
}

/**
 * In production, if Redis is not configured, login rate limiting MUST block requests
 * to prevent brute-force attacks. Other rate limiters degrade gracefully.
 * Read lazily (inside a function) to avoid capturing NODE_ENV at module load time.
 */
function isFailClosed(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * Rate limiter for login: 5 attempts per 15 minutes per IP.
 */
let loginLimiter: Ratelimit | null = null;

function getLoginLimiter(): Ratelimit | null {
  if (loginLimiter) return loginLimiter;

  const client = getRedis();
  if (!client) return null;

  loginLimiter = new Ratelimit({
    redis: client,
    limiter: Ratelimit.slidingWindow(5, "15 m"),
    prefix: "ratelimit:login",
  });
  return loginLimiter;
}

/**
 * Rate limiter for public routes (unsubscribe, orders): 20 requests per minute per IP.
 */
let publicLimiter: Ratelimit | null = null;

function getPublicLimiter(): Ratelimit | null {
  if (publicLimiter) return publicLimiter;

  const client = getRedis();
  if (!client) return null;

  publicLimiter = new Ratelimit({
    redis: client,
    limiter: Ratelimit.slidingWindow(20, "1 m"),
    prefix: "ratelimit:public",
  });
  return publicLimiter;
}

/**
 * Rate limiter for order tracking polling: 60 requests per minute per token.
 * Keyed by token (not IP) so multiple users don't share the same bucket.
 */
let trackingLimiter: Ratelimit | null = null;

function getTrackingLimiter(): Ratelimit | null {
  if (trackingLimiter) return trackingLimiter;

  const client = getRedis();
  if (!client) return null;

  trackingLimiter = new Ratelimit({
    redis: client,
    limiter: Ratelimit.slidingWindow(60, "1 m"),
    prefix: "ratelimit:tracking",
  });
  return trackingLimiter;
}

/**
 * Rate limiter for mesa polling endpoints (orders, token lookup): 120 requests per minute per mesaId.
 * Keyed by mesaId (UUID) so polling from the customer's table does not exhaust the shared IP bucket.
 */
let mesaPollingLimiter: Ratelimit | null = null;

function getMesaPollingLimiter(): Ratelimit | null {
  if (mesaPollingLimiter) return mesaPollingLimiter;

  const client = getRedis();
  if (!client) return null;

  mesaPollingLimiter = new Ratelimit({
    redis: client,
    limiter: Ratelimit.slidingWindow(120, "1 m"),
    prefix: "ratelimit:mesa-polling",
  });
  return mesaPollingLimiter;
}

/**
 * Apply rate limiting to mesa polling endpoints. Keyed by mesaId (not IP).
 * Returns NextResponse 429 if exceeded, or null if passed.
 */
export async function rateLimitMesaPolling(mesaId: string): Promise<NextResponse | null> {
  const limiter = getMesaPollingLimiter();
  if (!limiter) return null;

  const { success } = await limiter.limit(mesaId);
  if (!success) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429 }
    );
  }

  return null;
}

/**
 * Rate limiter for admin routes: 60 requests per minute per IP.
 */
let adminLimiter: Ratelimit | null = null;

function getAdminLimiter(): Ratelimit | null {
  if (adminLimiter) return adminLimiter;

  const client = getRedis();
  if (!client) return null;

  adminLimiter = new Ratelimit({
    redis: client,
    limiter: Ratelimit.slidingWindow(60, "1 m"),
    prefix: "ratelimit:admin",
  });
  return adminLimiter;
}

/**
 * sdd kit-expiry-m2a (docs/sdd/kit-expiry-reminders/m2a/), DD2 de design.md:
 * extraída de `getClientIp` para poder leer la IP desde `headers()` de Next
 * (RSC), que no es un `Request`. `Pick<Headers, 'get'>` acepta las dos
 * formas sin forzar un cast. El comportamiento no cambia.
 *
 * Cloudflare sets cf-connecting-ip to the real client IP.
 * When this header is absent (e.g. Cloudflare DNS-only or direct Vercel),
 * fall back to x-forwarded-for FIRST entry: Cloudflare rewrites the header
 * so the real client IP is always first, then appends its own edge IP last.
 * Taking the last entry would key rate limits on a rotating Cloudflare IP,
 * allowing unlimited retries from the same client.
 */
export function ipDeCabeceras(h: Pick<Headers, "get">): string {
  const cfIp = h.get("cf-connecting-ip");
  if (cfIp) return cfIp.trim();

  const forwarded = h.get("x-forwarded-for");
  if (forwarded) {
    const ips = forwarded.split(",").map(ip => ip.trim());
    // First IP is the real client IP set by Cloudflare
    return ips[0];
  }
  return h.get("x-real-ip") || "unknown";
}

// NOTE: UPSTASH_REDIS_REST_URL is required in production for login rate limiting.
function getClientIp(request: Request): string {
  return ipDeCabeceras(request.headers);
}

/**
 * sdd kit-expiry-m2a (docs/sdd/kit-expiry-reminders/m2a/), R-M2a.1.5/DD1:
 * 20 peticiones por minuto e IP para `/kit/{serie}`. Vive aquí (no en
 * `proxy.ts`, congelado por `proxy-autorizacion.test.ts`) porque una RSC no
 * puede devolver un 429 — el cargador lo traduce en el mismo 404 neutro.
 */
let kitPublicoLimiter: Ratelimit | null = null;

function getKitPublicoLimiter(): Ratelimit | null {
  if (kitPublicoLimiter) return kitPublicoLimiter;

  const client = getRedis();
  if (!client) return null;

  kitPublicoLimiter = new Ratelimit({
    redis: client,
    limiter: Ratelimit.slidingWindow(20, "1 m"),
    prefix: "ratelimit:kit-publico",
  });
  return kitPublicoLimiter;
}

/**
 * DD12: fail-open. Sin Redis configurado, o si `limit()` lanza, deja pasar
 * (mismo criterio que `rateLimitPublic`, D-M2a-2) — el límite no debe tumbar
 * la página pública por un fallo de Upstash.
 */
export async function kitPublicoDentroDeLimite(ip: string): Promise<boolean> {
  const limiter = getKitPublicoLimiter();
  if (!limiter) return true;

  try {
    const { success } = await limiter.limit(ip);
    return success;
  } catch {
    return true;
  }
}

/**
 * sdd pet-id-qr-profile (docs/sdd/pet-id-qr-profile/, kitemergenciacanarias),
 * Fase 9: 20 peticiones por minuto e IP para `GET /m/{codigo}` — calco
 * exacto de `kitPublicoLimiter` (M2a), mismo prefijo/ventana que la tabla de
 * rutas de design.md. Vive aquí (no en `proxy.ts`, congelado) por el mismo
 * motivo: una RSC no puede devolver un 429.
 */
let mascotaPublicoLimiter: Ratelimit | null = null;

function getMascotaPublicoLimiter(): Ratelimit | null {
  if (mascotaPublicoLimiter) return mascotaPublicoLimiter;

  const client = getRedis();
  if (!client) return null;

  mascotaPublicoLimiter = new Ratelimit({
    redis: client,
    limiter: Ratelimit.slidingWindow(20, "1 m"),
    prefix: "ratelimit:mascota-publico",
  });
  return mascotaPublicoLimiter;
}

/**
 * R7 de tasks.md: fail-open (mismo criterio que `kitPublicoDentroDeLimite`).
 * El cargador (`cargar-perfil-publico.ts`) traduce un `false` en el mismo
 * 404 neutro que desconocido/libre/pendiente/flag apagado — nunca un 429.
 */
export async function mascotaPublicoDentroDeLimite(ip: string): Promise<boolean> {
  const limiter = getMascotaPublicoLimiter();
  if (!limiter) return true;

  try {
    const { success } = await limiter.limit(ip);
    return success;
  } catch {
    return true;
  }
}

/**
 * sdd kit-expiry-m2b (docs/sdd/kit-expiry-reminders/m2b/), DD7 de design.md:
 * 5 peticiones cada 10 min por IP para el alta y el enlace de gestión de
 * avisos. Vive aquí (no en `proxy.ts`, congelado) por el mismo motivo que
 * `kitPublicoDentroDeLimite` (M2a) — son rutas públicas sin sesión.
 */
let kitAvisosLimiter: Ratelimit | null = null;

function getKitAvisosLimiter(): Ratelimit | null {
  if (kitAvisosLimiter) return kitAvisosLimiter;

  const client = getRedis();
  if (!client) return null;

  kitAvisosLimiter = new Ratelimit({
    redis: client,
    limiter: Ratelimit.slidingWindow(5, "10 m"),
    prefix: "ratelimit:kit-avisos",
  });
  return kitAvisosLimiter;
}

/** DD7: fail-open — sin Redis, o si `limit()` lanza, deja pasar (mismo criterio que `kitPublicoDentroDeLimite`). */
export async function kitAvisosDentroDeLimite(ip: string): Promise<boolean> {
  const limiter = getKitAvisosLimiter();
  if (!limiter) return true;

  try {
    const { success } = await limiter.limit(ip);
    return success;
  } catch {
    return true;
  }
}

/**
 * sdd kit-expiry-m2b, DD7/R-M2b.2.7: tope de 3 emails cada 24 h por SERIE,
 * sumando confirmación, "intento" y "solicitud" (todos comparten la misma
 * clave). Evita que el alta o el enlace de gestión se usen para bombardear
 * de emails a un titular.
 */
let kitAvisosEmailLimiter: Ratelimit | null = null;

function getKitAvisosEmailLimiter(): Ratelimit | null {
  if (kitAvisosEmailLimiter) return kitAvisosEmailLimiter;

  const client = getRedis();
  if (!client) return null;

  kitAvisosEmailLimiter = new Ratelimit({
    redis: client,
    limiter: Ratelimit.slidingWindow(3, "24 h"),
    prefix: "ratelimit:kit-avisos-email",
  });
  return kitAvisosEmailLimiter;
}

/** DD7: fail-open, igual que `kitAvisosDentroDeLimite`. */
export async function kitAvisosEmailDentroDeLimite(serie: string): Promise<boolean> {
  const limiter = getKitAvisosEmailLimiter();
  if (!limiter) return true;

  try {
    const { success } = await limiter.limit(serie);
    return success;
  } catch {
    return true;
  }
}

/**
 * Apply rate limiting to login. Returns NextResponse 429 if exceeded, or null if passed.
 */
export async function rateLimitLogin(request: Request): Promise<NextResponse | null> {
  const limiter = getLoginLimiter();
  if (!limiter) {
    // Fail-closed in production: block login if Redis is unavailable to prevent brute-force
    if (isFailClosed()) {
      return NextResponse.json(
        { error: "Service temporarily unavailable. Please try again later." },
        { status: 503 }
      );
    }
    return null;
  }

  const ip = getClientIp(request);
  const { success, limit, remaining, reset } = await limiter.limit(ip);

  if (!success) {
    return NextResponse.json(
      { error: "Too many login attempts. Please try again later." },
      {
        status: 429,
        headers: {
          "X-RateLimit-Limit": limit.toString(),
          "X-RateLimit-Remaining": remaining.toString(),
          "X-RateLimit-Reset": reset.toString(),
          "Retry-After": Math.ceil((reset - Date.now()) / 1000).toString(),
        },
      }
    );
  }

  return null;
}

/**
 * Apply rate limiting to public routes. Returns NextResponse 429 if exceeded, or null if passed.
 */
export async function rateLimitPublic(request: Request): Promise<NextResponse | null> {
  const limiter = getPublicLimiter();
  if (!limiter) return null;

  const ip = getClientIp(request);
  const { success, limit, remaining, reset } = await limiter.limit(ip);

  if (!success) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      {
        status: 429,
        headers: {
          "X-RateLimit-Limit": limit.toString(),
          "X-RateLimit-Remaining": remaining.toString(),
          "X-RateLimit-Reset": reset.toString(),
          "Retry-After": Math.ceil((reset - Date.now()) / 1000).toString(),
        },
      }
    );
  }

  return null;
}

/**
 * Apply rate limiting to tracking polling, keyed by token.
 * Returns NextResponse 429 if exceeded, or null if passed.
 */
export async function rateLimitTracking(token: string): Promise<NextResponse | null> {
  const limiter = getTrackingLimiter();
  if (!limiter) return null;

  const { success } = await limiter.limit(token);

  if (!success) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429 }
    );
  }

  return null;
}

/**
 * Rate limiter for waiter login: 5 attempts per minute per IP.
 * Fail-closed: blocks requests in production if Redis is unavailable.
 */
let waiterLoginLimiter: Ratelimit | null = null;

function getWaiterLoginLimiter(): Ratelimit | null {
  if (waiterLoginLimiter) return waiterLoginLimiter;

  const client = getRedis();
  if (!client) return null;

  waiterLoginLimiter = new Ratelimit({
    redis: client,
    limiter: Ratelimit.slidingWindow(5, "1 m"),
    prefix: "ratelimit:waiter-login",
  });
  return waiterLoginLimiter;
}

/**
 * Apply rate limiting to waiter login. Returns NextResponse 429 if exceeded, or null if passed.
 */
export async function rateLimitWaiterLogin(request: Request): Promise<NextResponse | null> {
  const limiter = getWaiterLoginLimiter();
  if (!limiter) {
    if (isFailClosed()) {
      return NextResponse.json(
        { error: "Service temporarily unavailable. Please try again later." },
        { status: 503 }
      );
    }
    return null;
  }

  const ip = getClientIp(request);
  const { success, limit, remaining, reset } = await limiter.limit(ip);

  if (!success) {
    return NextResponse.json(
      { error: "Too many login attempts. Please try again later." },
      {
        status: 429,
        headers: {
          "X-RateLimit-Limit": limit.toString(),
          "X-RateLimit-Remaining": remaining.toString(),
          "X-RateLimit-Reset": reset.toString(),
          "Retry-After": Math.ceil((reset - Date.now()) / 1000).toString(),
        },
      }
    );
  }

  return null;
}

/**
 * Apply rate limiting to admin routes. Returns NextResponse 429 if exceeded, or null if passed.
 */
export async function rateLimitAdmin(request: Request): Promise<NextResponse | null> {
  const limiter = getAdminLimiter();
  if (!limiter) return null;

  const ip = getClientIp(request);
  const { success, limit, remaining, reset } = await limiter.limit(ip);

  if (!success) {
    return NextResponse.json(
      { error: "Too many requests to admin panel. Please try again later." },
      {
        status: 429,
        headers: {
          "X-RateLimit-Limit": limit.toString(),
          "X-RateLimit-Remaining": remaining.toString(),
          "X-RateLimit-Reset": reset.toString(),
          "Retry-After": Math.ceil((reset - Date.now()) / 1000).toString(),
        },
      }
    );
  }

  return null;
}

/**
 * Rate limiter for mesa client token issuance: 10 tokens per hour per mesaId.
 * Keyed by mesaId to prevent abuse even with physical QR access.
 */
let mesaTokenLimiter: Ratelimit | null = null;

function getMesaTokenLimiter(): Ratelimit | null {
  if (mesaTokenLimiter) return mesaTokenLimiter;

  const client = getRedis();
  if (!client) return null;

  mesaTokenLimiter = new Ratelimit({
    redis: client,
    limiter: Ratelimit.slidingWindow(30, "1 h"),
    prefix: "ratelimit:mesa-token",
  });
  return mesaTokenLimiter;
}

/**
 * Apply rate limiting to mesa token issuance. Keyed by mesaId.
 * Returns NextResponse 429 if exceeded, or null if passed.
 */
export async function rateLimitMesaTokenIssuance(mesaId: string): Promise<NextResponse | null> {
  const limiter = getMesaTokenLimiter();
  if (!limiter) return null;

  const { success } = await limiter.limit(mesaId);
  if (!success) {
    return NextResponse.json(
      { error: "Too many QR scans. Please try again later." },
      { status: 429 }
    );
  }

  return null;
}
