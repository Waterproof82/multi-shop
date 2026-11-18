/**
 * kit-expiry-m5 M5c (sdd en kitemergenciacanarias, docs/sdd/kit-expiry-reminders/m5/)
 * R-M5.5: boton "Descargar etiquetas (PDF)" junto al listado de series del
 * lote (M4c). DD8: `fetch` -> `Blob` -> `URL.createObjectURL`, nunca un
 * `<a download>` directo a la ruta — un 403 con JSON nunca se "descarga"
 * como PDF (patron de ExportFichajes.tsx).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LanguageProvider } from '@/lib/language-context';
import { SeriesLote } from '@/app/admin/(protected)/kits/lotes/series-lote';

vi.mock('@/lib/admin-context', () => ({
  useAdmin: () => ({ overrideEmpresaId: '', empresaId: 'empresa-1' }),
}));

function serieList(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    serie: `S${String(i + 1).padStart(6, '0')}`,
    loteId: 'lote-1',
    empresaId: 'empresa-1',
    pedidoId: null,
    registradoAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
  }));
}

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    headers: new Headers(),
    json: async () => body,
  } as unknown as Response;
}

function pdfResponse() {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ 'Content-Disposition': 'attachment; filename="etiquetas-L01-1-MUESTRA.pdf"' }),
    blob: async () => new Blob(['%PDF-fake'], { type: 'application/pdf' }),
  } as unknown as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;
let createObjectURLMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  createObjectURLMock = vi.fn(() => 'blob:fake-url');
  URL.createObjectURL = createObjectURLMock as unknown as typeof URL.createObjectURL;
  URL.revokeObjectURL = vi.fn() as unknown as typeof URL.revokeObjectURL;
});

afterEach(() => {
  vi.restoreAllMocks();
});

function renderSeriesLote() {
  return render(
    <LanguageProvider>
      <SeriesLote loteId="lote-1" />
    </LanguageProvider>
  );
}

describe('SeriesLote — descarga de etiquetas PDF (R-M5.5)', () => {
  it('sin series, el boton de descarga esta desactivado', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(serieList(0)));

    renderSeriesLote();

    const boton = await screen.findByRole('button', { name: /Descargar etiquetas \(PDF\)/ });
    expect(boton).toBeDisabled();
  });

  it('con 1200 series, muestra 3 botones por bloque de 500 con rangos', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(serieList(1200)));

    renderSeriesLote();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /1[–-]500/ })).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /501[–-]1000/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /1001[–-]1200/ })).toBeInTheDocument();

    fetchMock.mockResolvedValueOnce(pdfResponse());
    fireEvent.click(screen.getByRole('button', { name: /501[–-]1000/ }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('pagina=2'));
    });
  });

  it('una respuesta 403 muestra el error y no descarga ningun PDF', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(serieList(10)));

    renderSeriesLote();

    const boton = await screen.findByRole('button', { name: /Descargar etiquetas \(PDF\)/ });

    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'Kits deshabilitado' }, false, 403));
    fireEvent.click(boton);

    await waitFor(() => {
      expect(screen.getByText('Kits deshabilitado')).toBeInTheDocument();
    });
    expect(createObjectURLMock).not.toHaveBeenCalled();
  });

  it('con la bandera de publicacion ya en true (kit-expiry-m2a), no avisa de que el PDF es una muestra', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(serieList(10)));

    renderSeriesLote();

    await screen.findByRole('button', { name: /Descargar etiquetas \(PDF\)/ });
    expect(screen.queryByText(/muestra/i)).not.toBeInTheDocument();
  });
});
