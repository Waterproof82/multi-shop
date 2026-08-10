/**
 * Cierre de mesa pagada desde `/tpv/mesas`.
 *
 * Bug real en produccion (2026-08-10, mesa 1): el cierre triunfaba en el
 * servidor (`cerrada_at` seteado, `mesas.sesion_id` limpiado, broadcast
 * disparado) pero la tarjeta de la mesa en el TPV que lo pidio seguia
 * mostrando "Pagada". Causa: `handleConfirmClose` llamaba a `router.refresh()`,
 * que no toca el estado de `mesas` — ese vive en `TpvCatalogProvider` (contexto
 * de cliente) y solo se actualiza via `refreshMesas()` o un broadcast de
 * Realtime que le confirme el cambio. Si el broadcast no llega (WS
 * reconectando, etc.), la propia accion del usuario no se refleja nunca.
 *
 * La correccion: tras un cierre exitoso, llamar a `refreshMesas()`
 * directamente — no depender solo del broadcast para reflejar la ACCION
 * PROPIA del usuario. El broadcast sigue siendo necesario para reflejar
 * cierres hechos desde OTRO dispositivo (ver `externalCobro` en
 * MostradorClient), pero no para este caso.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MesasGrid } from '@/components/tpv/MesasGrid';
import type { MesaWithSession } from '@/core/domain/repositories/IMesaRepository';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
}));

const fetchWithCsrf = vi.fn();
vi.mock('@/lib/csrf-client', () => ({
  fetchWithCsrf: (...args: unknown[]) => fetchWithCsrf(...args),
}));

const refreshMesas = vi.fn().mockResolvedValue(undefined);
let mesasActuales: MesaWithSession[] = [];
vi.mock('@/lib/tpv-catalog-ctx', () => ({
  useTpvCatalog: () => ({
    mesas: mesasActuales,
    turno: { id: 'turno-1' },
    refreshMesas,
  }),
}));

const mesaPagada: MesaWithSession = {
  id: 'mesa-1',
  empresaId: 'empresa-1',
  numero: 1,
  nombre: null,
  sesionId: 'sesion-1',
  activeOrderCount: 0,
  sessionTotal: 25,
  sesionPagada: true,
  pagoEnCurso: false,
  divisionActiva: false,
  itemsDiferidos: [],
  clienteActivo: false,
  preparadoPedidoNumbers: [],
  llamadaActiva: false,
};

beforeEach(() => {
  push.mockClear();
  fetchWithCsrf.mockReset();
  refreshMesas.mockClear();
  mesasActuales = [mesaPagada];
});

describe('MesasGrid — cerrar mesa pagada', () => {
  it('tras un cierre exitoso, refresca la mesa via refreshMesas (no solo router.refresh)', async () => {
    fetchWithCsrf.mockResolvedValue({ ok: true } as Response);

    render(<MesasGrid modo="cobrar" />);

    fireEvent.click(screen.getByRole('button', { name: /Mesa 1/i }));
    fireEvent.click(screen.getByRole('button', { name: /Confirmar/i }));

    await waitFor(() => {
      expect(fetchWithCsrf).toHaveBeenCalledWith('/api/tpv/mesas/mesa-1/cerrar', { method: 'POST' });
    });
    await waitFor(() => {
      expect(refreshMesas).toHaveBeenCalled();
    });
  });

  it('si el cierre falla, avisa con un error visible y NO se queda mudo', async () => {
    fetchWithCsrf.mockResolvedValue({ ok: false } as Response);

    render(<MesasGrid modo="cobrar" />);

    fireEvent.click(screen.getByRole('button', { name: /Mesa 1/i }));
    fireEvent.click(screen.getByRole('button', { name: /Confirmar/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });
});
