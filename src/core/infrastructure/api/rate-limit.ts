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

function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return request.headers.get("x-real-ip") || "unknown";
}

/**
 * Apply rate limiting to login. Returns NextResponse 429 if exceeded, or null if passed.
 */
export async function rateLimitLogin(request: Request): Promise<NextResponse | null> {
  const limiter = getLoginLimiter();
  if (!limiter) return null; // No Redis configured, skip rate limiting

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
