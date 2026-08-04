'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useOnlineStatus } from '@/hooks/tpv/useOnlineStatus';
import { fetchWithCsrf } from '@/lib/csrf-client';
import {
  enqueueCommand,
  flushCommandQueue,
  getQueuedCount,
  isResumeSignal,
  itemStatusKey,
  type QueuedCommand,
} from '@/lib/waiter/command-queue';

/**
 * Reintento periódico mientras queden comandos. `navigator.onLine` no es fiable
 * por sí solo: da true con portal cautivo o con el AP conectado pero sin salida,
 * que es el fallo típico del wifi de un restaurante.
 */
const RETRY_INTERVAL_MS = 30000;

/**
 * Conecta la cola de comandos offline a una vista del panel de camarero.
 *
 * Devuelve `enqueueItemStatus` para usar en el `catch` de red del PATCH: cuando
 * la petición no llega, el cambio queda encolado y el estado optimista SE
 * CONSERVA, en lugar de revertirse. Esa es la diferencia con el rollback: un
 * rechazo del servidor sí debe revertir, pero una red caída no — la intención
 * del usuario sigue siendo válida y se aplicará al reconectar.
 */
export function useCommandQueue(onFlushed?: () => void) {
  const [pendingCount, setPendingCount] = useState(0);
  const isOnline = useOnlineStatus();

  // Ref para que un callback inline del llamador no reinicie los efectos.
  const onFlushedRef = useRef(onFlushed);
  onFlushedRef.current = onFlushed;

  const flush = useCallback(async () => {
    const before = await getQueuedCount();
    if (before === 0) { setPendingCount(0); return; }

    const pending = await flushCommandQueue((cmd: QueuedCommand) =>
      fetchWithCsrf(cmd.url, { method: cmd.method, body: cmd.body }),
    );
    setPendingCount(pending);
    // Solo se resincroniza si algo llegó a aplicarse, para no disparar fetches
    // inútiles cuando la red sigue caída.
    if (pending < before) onFlushedRef.current?.();
  }, []);

  const enqueueItemStatus = useCallback(
    async (pedidoId: string, itemIdx: number, url: string, body: unknown) => {
      await enqueueCommand({
        key: itemStatusKey(pedidoId, itemIdx),
        url,
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      setPendingCount(await getQueuedCount());
    },
    [],
  );

  // Vaciado al montar y en cada recuperación de conectividad.
  useEffect(() => {
    if (!isOnline) return;
    void flush();
  }, [isOnline, flush]);

  // Reintento mientras queden pendientes: cubre el caso de `navigator.onLine`
  // en true con la red realmente inservible, donde no llega evento 'online'.
  useEffect(() => {
    if (pendingCount === 0 || !isOnline) return;
    const id = setInterval(() => { void flush(); }, RETRY_INTERVAL_MS);
    return () => clearInterval(id);
  }, [pendingCount, isOnline, flush]);

  // Vuelta al primer plano.
  //
  // Sin esto quedaba un agujero de hasta RETRY_INTERVAL_MS tras despertar el
  // dispositivo, y es el agujero que MÁS se nota: con la pantalla apagada el
  // navegador congela los timers de la página, así que el setInterval de arriba
  // sencillamente no corre. El PDA del camarero pasa media jornada en ese estado
  // — se marca un plato, se guarda el aparato en el bolsillo, se vuelve a sacar.
  //
  // Tampoco sirve apoyarse en el evento 'online': si la red nunca llegó a caerse
  // del todo (el caso del AP asociado sin salida) ese evento no se dispara nunca.
  //
  // No se filtra por `pendingCount`: `flush` ya sale solo si la cola está vacía,
  // y leerlo aquí obligaría a re-suscribir los listeners en cada cambio.
  useEffect(() => {
    function handleResume(event: Event) {
      if (!isResumeSignal(event.type, document.visibilityState)) return;
      // navigator.onLine miente en positivo, pero no en negativo: si dice que no
      // hay red, no la hay. Ahorra un intento condenado al despertar sin cobertura.
      if (!navigator.onLine) return;
      void flush();
    }

    document.addEventListener('visibilitychange', handleResume);
    window.addEventListener('pageshow', handleResume);
    return () => {
      document.removeEventListener('visibilitychange', handleResume);
      window.removeEventListener('pageshow', handleResume);
    };
  }, [flush]);

  return { pendingCount, enqueueItemStatus, flush };
}
