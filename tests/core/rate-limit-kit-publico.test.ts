/**
 * sdd kit-expiry-m2a (docs/sdd/kit-expiry-reminders/m2a/), DD1/DD2/DD12 de
 * design.md: el límite de la página pública del kit vive en el cargador
 * (no en `proxy.ts`, congelado por `proxy-autorizacion.test.ts`), así que
 * necesita su propia función `kitPublicoDentroDeLimite(ip)` — booleana, no
 * una `NextResponse` 429 (una RSC no puede devolver una).
 *
 * `ipDeCabeceras` se EXTRAE de la lógica ya probada de `getClientIp`
 * (`cf-connecting-ip` → primera de `x-forwarded-for` → `x-real-ip` →
 * `'unknown'`), para poder leer la IP desde `headers()` de Next (RSC), que
 * no es un `Request`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const limitMock = vi.fn();
const slidingWindowMock = vi.fn((limit: number, window: string) => ({ limit, window }));
// Función normal, NO arrow: `new RatelimitCtorMock()` necesita [[Construct]],
// que una arrow function no tiene (TypeError: ... is not a constructor).
const RatelimitCtorMock = vi.fn().mockImplementation(function RatelimitMock() {
  return { limit: limitMock };
});

vi.mock('@upstash/redis', () => ({
  Redis: vi.fn().mockImplementation(function RedisMock(config: unknown) {
    return { __config: config };
  }),
}));

vi.mock('@upstash/ratelimit', () => ({
  Ratelimit: Object.assign(RatelimitCtorMock, { slidingWindow: slidingWindowMock }),
}));

const { ipDeCabeceras, kitPublicoDentroDeLimite } = await import('@/core/infrastructure/api/rate-limit');

describe('ipDeCabeceras', () => {
  it('prioriza cf-connecting-ip sobre cualquier otra cabecera', () => {
    const h = new Headers({ 'cf-connecting-ip': '1.1.1.1', 'x-forwarded-for': '2.2.2.2', 'x-real-ip': '3.3.3.3' });
    expect(ipDeCabeceras(h)).toBe('1.1.1.1');
  });

  it('sin cf-connecting-ip, usa la primera IP de x-forwarded-for', () => {
    const h = new Headers({ 'x-forwarded-for': '2.2.2.2, 9.9.9.9', 'x-real-ip': '3.3.3.3' });
    expect(ipDeCabeceras(h)).toBe('2.2.2.2');
  });

  it('sin cf-connecting-ip ni x-forwarded-for, usa x-real-ip', () => {
    const h = new Headers({ 'x-real-ip': '3.3.3.3' });
    expect(ipDeCabeceras(h)).toBe('3.3.3.3');
  });

  it("sin ninguna cabecera, devuelve 'unknown'", () => {
    const h = new Headers();
    expect(ipDeCabeceras(h)).toBe('unknown');
  });
});

describe('kitPublicoDentroDeLimite', () => {
  beforeEach(() => {
    limitMock.mockReset();
    RatelimitCtorMock.mockClear();
    slidingWindowMock.mockClear();
  });

  it('sin UPSTASH_REDIS_REST_URL/TOKEN configurados, deja pasar (true)', async () => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;

    expect(await kitPublicoDentroDeLimite('9.9.9.9')).toBe(true);
    expect(RatelimitCtorMock).not.toHaveBeenCalled();
  });

  it('con Redis configurado y el límite disponible, success:false → false; usa el prefijo ratelimit:kit-publico y slidingWindow(20, "1 m")', async () => {
    // El limitador es un singleton de módulo (igual que el resto de
    // `rate-limit.ts`): solo se construye UNA vez, en la primera llamada con
    // Redis configurado. Por eso el prefijo y `slidingWindow` se comprueban
    // aquí, no en un test aparte — una llamada posterior reutiliza la misma
    // instancia y no vuelve a invocar el constructor.
    process.env.UPSTASH_REDIS_REST_URL = 'https://fake.upstash.io';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'fake-token';
    limitMock.mockResolvedValue({ success: false, limit: 20, remaining: 0, reset: Date.now() });

    expect(await kitPublicoDentroDeLimite('8.8.8.8')).toBe(false);
    expect(slidingWindowMock).toHaveBeenCalledWith(20, '1 m');
    expect(RatelimitCtorMock).toHaveBeenCalledWith(
      expect.objectContaining({ prefix: 'ratelimit:kit-publico' }),
    );
  });

  it('con Redis configurado, success:true → true', async () => {
    limitMock.mockResolvedValue({ success: true, limit: 20, remaining: 19, reset: Date.now() });

    expect(await kitPublicoDentroDeLimite('8.8.8.8')).toBe(true);
  });

  it('DD12: si limit() lanza, deja pasar (fail-open) en vez de bloquear', async () => {
    limitMock.mockRejectedValue(new Error('Upstash no responde'));

    expect(await kitPublicoDentroDeLimite('8.8.8.8')).toBe(true);
  });
});
