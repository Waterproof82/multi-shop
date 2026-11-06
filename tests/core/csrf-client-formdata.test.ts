import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCsrf } from '@/lib/csrf-client';

// getCsrfToken() lee el cookie `csrf_token` (token:signature) y necesita
// `window`/`document`; el proyecto `unit` corre en node.
function stubNavegadorConCsrf() {
  vi.stubGlobal('window', {});
  vi.stubGlobal('document', { cookie: 'csrf_token=token123:signature' });
}

function headersDe(fetchMock: ReturnType<typeof vi.fn>): Headers {
  return fetchMock.mock.calls[0][1].headers as Headers;
}

describe('fetchWithCsrf con FormData', () => {
  beforeEach(() => {
    stubNavegadorConCsrf();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('no fuerza Content-Type JSON: el navegador debe poner el boundary del multipart', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const formData = new FormData();
    formData.append('file', new Blob(['x'], { type: 'image/png' }), 'x.png');

    await fetchWithCsrf('/api/admin/upload-image', { method: 'POST', body: formData });

    expect(headersDe(fetchMock).get('Content-Type')).toBeNull();
    expect(headersDe(fetchMock).get('x-csrf-token')).toBe('token123');
  });

  it('mantiene application/json para bodies JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await fetchWithCsrf('/api/admin/productos', {
      method: 'PUT',
      body: JSON.stringify({ titulo_es: 'Producto' }),
    });

    expect(headersDe(fetchMock).get('Content-Type')).toBe('application/json');
  });
});
