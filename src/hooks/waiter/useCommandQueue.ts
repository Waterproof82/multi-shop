'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useOnlineStatus } from '@/hooks/tpv/useOnlineStatus';
import { fetchWithCsrf } from '@/lib/csrf-client';
import {
  enqueueCommand,
  flushCommandQueue,
  getQueuedCount,
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

  return { pendingCount, enqueueItemStatus, flush };
}
