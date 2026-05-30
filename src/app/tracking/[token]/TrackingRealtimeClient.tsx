'use client';

import { useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

export function useTrackingRealtime(pedidoId: string, onUpdate: () => void) {
  useEffect(() => {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const channel = supabase
      .channel(`delivery-tracking:${pedidoId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'pedidos',
        filter: `id=eq.${pedidoId}`,
      }, () => onUpdate())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [pedidoId, onUpdate]);
}
