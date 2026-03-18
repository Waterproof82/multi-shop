import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { NextResponse } from "next/server";

let redis: Redis | null = null;

function getRedis(): Redis | null {
  if (redis) return redis;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) return null;

  redis = new Redis({ url, token });
  return redis;
}

/**
 * Rate limiter para login: 5 intentos por 15 minutos por IP.
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
 * Rate limiter para rutas públicas (unsubscribe, pedidos): 20 requests por minuto por IP.
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
 * Rate limiter para rutas admin: 60 requests por minuto por IP.
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

function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return request.headers.get("x-real-ip") || "unknown";
}

/**
 * Aplica rate limiting al login. Devuelve NextResponse 429 si se excede, o null si pasa.
 */
export async function rateLimitLogin(request: Request): Promise<NextResponse | null> {
  const limiter = getLoginLimiter();
  if (!limiter) return null; // Sin Redis configurado, no limitar

  const ip = getClientIp(request);
  const { success, limit, remaining, reset } = await limiter.limit(ip);

  if (!success) {
    return NextResponse.json(
      { error: "Demasiados intentos de login. Inténtalo de nuevo más tarde." },
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
 * Aplica rate limiting a rutas públicas. Devuelve NextResponse 429 si se excede, o null si pasa.
 */
export async function rateLimitPublic(request: Request): Promise<NextResponse | null> {
  const limiter = getPublicLimiter();
  if (!limiter) return null;

  const ip = getClientIp(request);
  const { success, limit, remaining, reset } = await limiter.limit(ip);

  if (!success) {
    return NextResponse.json(
      { error: "Demasiadas solicitudes. Inténtalo de nuevo más tarde." },
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
 * Aplica rate limiting a rutas admin. Devuelve NextResponse 429 si se excede, o null si pasa.
 */
export async function rateLimitAdmin(request: Request): Promise<NextResponse | null> {
  const limiter = getAdminLimiter();
  if (!limiter) return null;

  const ip = getClientIp(request);
  const { success, limit, remaining, reset } = await limiter.limit(ip);

  if (!success) {
    return NextResponse.json(
      { error: "Demasiadas solicitudes al panel de administración. Inténtalo de nuevo más tarde." },
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
