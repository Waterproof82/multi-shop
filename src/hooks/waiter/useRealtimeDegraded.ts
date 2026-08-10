'use client';

import { useCallback, useEffect, useState } from 'react';

/** Cada cuánto se re-consulta al servidor mientras Realtime está caído. */
const DEGRADED_POLL_MS = 15000;

interface Options {
  /**
   * Predicado opcional evaluado antes de cada sondeo. Si devuelve true, ese
   * ciclo se salta.
   *
   * Existe por `/waiter/pendientes`: durante el validate loop hay un `confirmingRef`
   * que debe bloquear cualquier fetch, o se lee estado parcial entre iteraciones
   * (trampa #3 de docs/context/realtime-channels.md). Un sondeo ciego cada 15 s
   * reintroduciría exactamente esa race.
   */
  readonly pauseWhen?: () => boolean;
}

/**
 * Detecta la caída de los canales de Realtime y mantiene la vista viva a base
 * de sondeo mientras dure.
 *
 * POR QUÉ EXISTE
 * Los `subscribe()` de cocina/bar/pendientes solo hacían `console.error` ante
 * CHANNEL_ERROR / TIMED_OUT. Con wifi inestable eso deja la pantalla congelada
 * en el último estado conocido sin ningún indicio — el peor modo de fallo,
 * porque aparenta funcionar.
 *
 * LO QUE DELIBERADAMENTE NO HACE
 * No resuscribe, no recrea canales y no toca su ciclo de vida: de reconectar el
 * socket ya se encarga supabase-js. Hacerlo a mano arriesga dejar dos canales
 * con el mismo nombre sobre el cliente singleton, que es precisamente cómo un
 * canal enmudece sin lanzar error (trampa #2). Este hook solo observa el estado
 * y compensa con fetch.
 *
 * Se usa un intervalo plano en vez de una cadena de reintentos con backoff a
 * propósito: se limpia solo al recuperar el canal o al desmontar, y no puede
 * dejar timers huérfanos.
 */
export function useRealtimeDegraded(refetch: () => void | Promise<void>, options: Options = {}) {
  const { pauseWhen } = options;
  const [realtimeDegraded, setRealtimeDegraded] = useState(false);

  /** Pasar como callback de `.subscribe()`, sin alterar nada más de la cadena. */
  const trackChannelStatus = useCallback((status: string, label: string) => {
    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      console.error(`[Realtime] ${label}:`, status);
      setRealtimeDegraded(true);
      return;
    }
    // SUBSCRIBED tras una caída: el canal volvió y el sondeo deja de hacer falta.
    if (status === 'SUBSCRIBED') setRealtimeDegraded(false);
  }, []);

  useEffect(() => {
    if (!realtimeDegraded) return;
    const run = () => {
      if (pauseWhen?.()) return;
      void refetch();
    };
    run(); // recuperar de inmediato lo perdido durante la caída
    const id = setInterval(run, DEGRADED_POLL_MS);
    return () => clearInterval(id);
  }, [realtimeDegraded, refetch, pauseWhen]);

  return { realtimeDegraded, trackChannelStatus };
}
