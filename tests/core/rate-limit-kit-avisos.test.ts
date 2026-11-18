// sdd kit-expiry-m2b (docs/sdd/kit-expiry-reminders/m2b/), DD7 de design.md:
// dos limitadores nuevos para el alta/enlace de avisos — por IP (contra
// bombardeo de peticiones) y por serie (contra bombardeo de emails a un
// titular). Los dos son *fail-open*, igual que `kitPublicoDentroDeLimite`
// (DD12 de M2a). Mismo patrón de mock que `rate-limit-kit-publico.test.ts`.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const limitMock = vi.fn();
const slidingWindowMock = vi.fn((limit: number, window: string) => ({ limit, window }));
// Función normal, NO arrow: `new RatelimitCtorMock()` necesita [[Construct]].
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

const { kitAvisosDentroDeLimite, kitAvisosEmailDentroDeLimite } = await import(
  '@/core/infrastructure/api/rate-limit'
);

beforeEach(() => {
  limitMock.mockReset();
  RatelimitCtorMock.mockClear();
  slidingWindowMock.mockClear();
  process.env.UPSTASH_REDIS_REST_URL = 'https://fake.upstash.io';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'fake-token';
});

describe('kitAvisosDentroDeLimite', () => {
  it('usa el prefijo ratelimit:kit-avisos y slidingWindow(5, "10 m")', async () => {
    limitMock.mockResolvedValue({ success: true });

    await kitAvisosDentroDeLimite('1.2.3.4');

    expect(slidingWindowMock).toHaveBeenCalledWith(5, '10 m');
    expect(RatelimitCtorMock).toHaveBeenCalledWith(expect.objectContaining({ prefix: 'ratelimit:kit-avisos' }));
  });

  it('con success:false devuelve false', async () => {
    limitMock.mockResolvedValue({ success: false });
    expect(await kitAvisosDentroDeLimite('1.2.3.4')).toBe(false);
  });

  it('con success:true devuelve true', async () => {
    limitMock.mockResolvedValue({ success: true });
    expect(await kitAvisosDentroDeLimite('1.2.3.4')).toBe(true);
  });

  it('si limit() lanza, devuelve true (fail-open)', async () => {
    limitMock.mockRejectedValue(new Error('upstash caído'));
    expect(await kitAvisosDentroDeLimite('1.2.3.4')).toBe(true);
  });
});

describe('kitAvisosEmailDentroDeLimite', () => {
  it('usa el prefijo ratelimit:kit-avisos-email y slidingWindow(3, "24 h")', async () => {
    limitMock.mockResolvedValue({ success: true });

    await kitAvisosEmailDentroDeLimite('KEC-ABCD-1234-5');

    expect(slidingWindowMock).toHaveBeenCalledWith(3, '24 h');
    expect(RatelimitCtorMock).toHaveBeenCalledWith(
      expect.objectContaining({ prefix: 'ratelimit:kit-avisos-email' }),
    );
  });

  it('con success:false devuelve false', async () => {
    limitMock.mockResolvedValue({ success: false });
    expect(await kitAvisosEmailDentroDeLimite('KEC-ABCD-1234-5')).toBe(false);
  });

  it('con success:true devuelve true', async () => {
    limitMock.mockResolvedValue({ success: true });
    expect(await kitAvisosEmailDentroDeLimite('KEC-ABCD-1234-5')).toBe(true);
  });

  it('si limit() lanza, devuelve true (fail-open)', async () => {
    limitMock.mockRejectedValue(new Error('upstash caído'));
    expect(await kitAvisosEmailDentroDeLimite('KEC-ABCD-1234-5')).toBe(true);
  });
});
