/**
 * sdd pet-id-qr-profile (docs/sdd/pet-id-qr-profile/, kitemergenciacanarias),
 * Fase 9 — ruta de la tabla de `design.md`: límite `mascota-publico` (IP,
 * 20/1 min) para `GET /m/{codigo}`. Calco exacto de
 * `rate-limit-kit-publico.test.ts` (M2a): el límite vive en `rate-limit.ts`
 * (no en `proxy.ts`, congelado) porque una RSC no puede devolver un 429 — el
 * cargador lo traduce en el mismo 404 neutro (R7 de tasks.md).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const limitMock = vi.fn();
const slidingWindowMock = vi.fn((limit: number, window: string) => ({ limit, window }));
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

const { mascotaPublicoDentroDeLimite } = await import('@/core/infrastructure/api/rate-limit');

describe('mascotaPublicoDentroDeLimite', () => {
  beforeEach(() => {
    limitMock.mockReset();
    RatelimitCtorMock.mockClear();
    slidingWindowMock.mockClear();
  });

  it('sin UPSTASH_REDIS_REST_URL/TOKEN configurados, deja pasar (true)', async () => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;

    expect(await mascotaPublicoDentroDeLimite('9.9.9.9')).toBe(true);
    expect(RatelimitCtorMock).not.toHaveBeenCalled();
  });

  it('con Redis configurado y el límite disponible, success:false → false; usa el prefijo ratelimit:mascota-publico y slidingWindow(20, "1 m")', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://fake.upstash.io';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'fake-token';
    limitMock.mockResolvedValue({ success: false, limit: 20, remaining: 0, reset: Date.now() });

    expect(await mascotaPublicoDentroDeLimite('8.8.8.8')).toBe(false);
    expect(slidingWindowMock).toHaveBeenCalledWith(20, '1 m');
    expect(RatelimitCtorMock).toHaveBeenCalledWith(
      expect.objectContaining({ prefix: 'ratelimit:mascota-publico' }),
    );
  });

  it('con Redis configurado, success:true → true', async () => {
    limitMock.mockResolvedValue({ success: true, limit: 20, remaining: 19, reset: Date.now() });

    expect(await mascotaPublicoDentroDeLimite('8.8.8.8')).toBe(true);
  });

  it('si limit() lanza, deja pasar (fail-open) en vez de bloquear', async () => {
    limitMock.mockRejectedValue(new Error('Upstash no responde'));

    expect(await mascotaPublicoDentroDeLimite('8.8.8.8')).toBe(true);
  });
});
