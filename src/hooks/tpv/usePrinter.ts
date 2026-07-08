'use client';

import { useCallback, useState } from 'react';
import { BrowserPrinter } from '@/lib/tpv/printer';
import type { PrintTicket } from '@/lib/tpv/printer';

const printer = new BrowserPrinter();

interface UsePrinterResult {
  print: (ticket: PrintTicket) => Promise<void>;
  isPrinting: boolean;
  printError: string | null;
}

export function usePrinter(): UsePrinterResult {
  const [isPrinting, setIsPrinting] = useState(false);
  const [printError, setPrintError] = useState<string | null>(null);

  const print = useCallback(async (ticket: PrintTicket) => {
    setIsPrinting(true);
    setPrintError(null);
    try {
      await printer.print(ticket);
    } catch (err) {
      setPrintError(err instanceof Error ? err.message : 'Error de impresión');
    } finally {
      setIsPrinting(false);
    }
  }, []);

  return { print, isPrinting, printError };
}
