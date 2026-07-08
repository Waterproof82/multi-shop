import { ThermalPrinter, PrinterTypes, CharacterSet, BreakLine } from 'node-thermal-printer';
import type { BrowserWindow } from 'electron';
import type { ReceiptData } from './receipt';
import { buildAndPrint } from './receipt';

export async function listPrinters(win: BrowserWindow): Promise<string[]> {
  const printers = await win.webContents.getPrintersAsync();
  return printers.map((p) => p.name);
}

export async function printReceipt(
  printerName: string,
  data: ReceiptData,
): Promise<{ success: boolean; error?: string }> {
  try {
    const printer = new ThermalPrinter({
      type: PrinterTypes.EPSON,
      interface: `printer:${printerName}`,
      characterSet: CharacterSet.PC858_EURO,
      breakLine: BreakLine.WORD,
      removeSpecialCharacters: false,
      lineCharacter: '-',
    });

    const isConnected = await printer.isPrinterConnected();
    if (!isConnected) {
      return { success: false, error: 'Impresora no disponible' };
    }

    await buildAndPrint(printer, data);
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    return { success: false, error: message };
  }
}
