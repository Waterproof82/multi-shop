// sdd pet-id-qr-profile (docs/sdd/pet-id-qr-profile/, kitemergenciacanarias),
// Fase 10 (DD5/R-QR.4): dos limitadores nuevos para el alta de chapas — por
// IP (`mascota-form`, contra bombardeo de peticiones) y por CÓDIGO
// (`mascota-alta-email`, contra bombardeo de emails a un dueño ya activo).
// Calco exacto de `kitAvisosDentroDeLimite`/`kitAvisosEmailDentroDeLimite`
// (M2b) — ver `rate-limit-kit-avisos.test.ts`. El segundo limitador se
// clava por CÓDIGO, no por el email que llega en el cuerpo: el email de
// «intento» se envía al email YA REGISTRADO del dueño, no al que escribió
// quien reenvía el alta, así que limitar por el email entrante no
// protegería al dueño real de un bombardeo (desviación documentada frente a
// la redacción literal de design.md, que decía "sha256 del email").
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

const { mascotaFormDentroDeLimite, mascotaAltaEmailDentroDeLimite } = await import(
  '@/core/infrastructure/api/rate-limit'
);

beforeEach(() => {
  limitMock.mockReset();
  RatelimitCtorMock.mockClear();
  slidingWindowMock.mockClear();
  process.env.UPSTASH_REDIS_REST_URL = 'https://fake.upstash.io';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'fake-token';
});

describe('mascotaFormDentroDeLimite', () => {
  it('usa el prefijo ratelimit:mascota-form y slidingWindow(5, "10 m")', async () => {
    limitMock.mockResolvedValue({ success: true });

    await mascotaFormDentroDeLimite('1.2.3.4');

    expect(slidingWindowMock).toHaveBeenCalledWith(5, '10 m');
    expect(RatelimitCtorMock).toHaveBeenCalledWith(expect.objectContaining({ prefix: 'ratelimit:mascota-form' }));
  });

  it('con success:false devuelve false', async () => {
    limitMock.mockResolvedValue({ success: false });
    expect(await mascotaFormDentroDeLimite('1.2.3.4')).toBe(false);
  });

  it('con success:true devuelve true', async () => {
    limitMock.mockResolvedValue({ success: true });
    expect(await mascotaFormDentroDeLimite('1.2.3.4')).toBe(true);
  });

  it('si limit() lanza, devuelve true (fail-open)', async () => {
    limitMock.mockRejectedValue(new Error('upstash caído'));
    expect(await mascotaFormDentroDeLimite('1.2.3.4')).toBe(true);
  });
});

describe('mascotaAltaEmailDentroDeLimite', () => {
  it('usa el prefijo ratelimit:mascota-alta-email y slidingWindow(3, "24 h")', async () => {
    limitMock.mockResolvedValue({ success: true });

    await mascotaAltaEmailDentroDeLimite('M-ABCD-1234-5');

    expect(slidingWindowMock).toHaveBeenCalledWith(3, '24 h');
    expect(RatelimitCtorMock).toHaveBeenCalledWith(
      expect.objectContaining({ prefix: 'ratelimit:mascota-alta-email' }),
    );
  });

  it('con success:false devuelve false', async () => {
    limitMock.mockResolvedValue({ success: false });
    expect(await mascotaAltaEmailDentroDeLimite('M-ABCD-1234-5')).toBe(false);
  });

  it('con success:true devuelve true', async () => {
    limitMock.mockResolvedValue({ success: true });
    expect(await mascotaAltaEmailDentroDeLimite('M-ABCD-1234-5')).toBe(true);
  });

  it('si limit() lanza, devuelve true (fail-open)', async () => {
    limitMock.mockRejectedValue(new Error('upstash caído'));
    expect(await mascotaAltaEmailDentroDeLimite('M-ABCD-1234-5')).toBe(true);
  });
});
