// sdd kit-expiry-m2b (docs/sdd/kit-expiry-reminders/m2b/), DD6 de design.md:
// el CSRF de doble envío (proxy.ts) no cubre las rutas públicas — esta es la
// protección de las rutas POST públicas de M2b (alta, gestión, enlace).
import { describe, expect, it } from 'vitest';
import { esPeticionJsonPublicaValida } from '@/lib/peticion-publica';

function peticion(opts: { contentType?: string; origin?: string; host?: string } = {}): Request {
  const headers = new Headers();
  if (opts.contentType !== undefined) headers.set('content-type', opts.contentType);
  if (opts.origin !== undefined) headers.set('origin', opts.origin);
  headers.set('host', opts.host ?? 'tienda.kitemergenciacanarias.es');
  return new Request('https://tienda.kitemergenciacanarias.es/api/kit-avisos/alta', {
    method: 'POST',
    headers,
  });
}

describe('esPeticionJsonPublicaValida', () => {
  it('sin Content-Type application/json devuelve 415', () => {
    const r = esPeticionJsonPublicaValida(peticion({ contentType: 'text/plain' }));
    expect(r).toEqual({ ok: false, status: 415 });
  });

  it('con Origin de otro host devuelve 403', () => {
    const r = esPeticionJsonPublicaValida(
      peticion({ contentType: 'application/json', origin: 'https://otro-sitio.com' }),
    );
    expect(r).toEqual({ ok: false, status: 403 });
  });

  it('sin Origin es válida', () => {
    const r = esPeticionJsonPublicaValida(peticion({ contentType: 'application/json' }));
    expect(r).toEqual({ ok: true });
  });

  it('con Origin del mismo host es válida', () => {
    const r = esPeticionJsonPublicaValida(
      peticion({ contentType: 'application/json', origin: 'https://tienda.kitemergenciacanarias.es' }),
    );
    expect(r).toEqual({ ok: true });
  });

  it('acepta application/json con un charset en el Content-Type', () => {
    const r = esPeticionJsonPublicaValida(peticion({ contentType: 'application/json; charset=utf-8' }));
    expect(r).toEqual({ ok: true });
  });
});
