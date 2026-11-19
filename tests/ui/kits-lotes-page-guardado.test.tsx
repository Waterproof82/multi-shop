/**
 * Prueba en producción del 2026-11-19: al guardar las caducidades de un lote
 * no aparecía ningún mensaje. La página pasaba `onSaved={cargar}`, `cargar`
 * ponía `loading` y sustituía la página entera por un spinner: el editor se
 * desmontaba y su mensaje de «guardado» se perdía. Guardar caducidades no
 * cambia la lista de lotes, así que el editor debe seguir montado.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useState } from 'react';

vi.mock('@/lib/language-context', () => ({ useLanguage: () => ({ language: 'es' }) }));
vi.mock('@/lib/admin-context', () => ({ useAdmin: () => ({ empresaId: 'emp-1', overrideEmpresaId: undefined }) }));
vi.mock('@/lib/csrf-client', () => ({ fetchWithCsrf: vi.fn() }));
vi.mock('@/app/admin/(protected)/kits/lotes/series-lote', () => ({ SeriesLote: () => null }));
vi.mock('@/app/admin/(protected)/kits/lotes/lote-caducidades-editor', () => ({
  LoteCaducidadesEditor: ({ onSaved }: { onSaved?: () => void }) => {
    const [guardado, setGuardado] = useState(false);
    return (
      <div>
        <button type="button" onClick={() => { setGuardado(true); onSaved?.(); }}>guardar-simulado</button>
        {guardado && <p>caducidades-guardadas-simulado</p>}
      </div>
    );
  },
}));

import KitsLotesPage from '@/app/admin/(protected)/kits/lotes/page';

const LOTE = { id: 'lote-1', codigo: 'L-1', productoId: 'p-1', productoNombre: 'Mochila', fechaMontaje: '2026-11-19' };

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.includes('/api/admin/kits/lotes')) {
      return new Response(JSON.stringify({ items: [LOTE], total: 1, page: 1, pageSize: 20 }), { status: 200 });
    }
    return new Response(JSON.stringify([]), { status: 200 });
  }));
});

describe('Página de lotes — guardar caducidades', () => {
  it('tras guardar, el editor sigue montado y su mensaje de guardado sigue visible', async () => {
    render(<KitsLotesPage />);
    fireEvent.click(await screen.findByRole('button', { name: /Caducidades del lote/i }));

    fireEvent.click(await screen.findByRole('button', { name: 'guardar-simulado' }));

    await waitFor(() => expect(screen.queryByText('caducidades-guardadas-simulado')).toBeInTheDocument());
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByText('caducidades-guardadas-simulado')).toBeInTheDocument();
  });
});
