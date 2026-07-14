import { contextBridge, ipcRenderer } from 'electron';
import type { ReceiptData } from './printer/receipt';

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true as const,
  getPrinters: (): Promise<string[]> =>
    ipcRenderer.invoke('printer:list'),
  print: (data: ReceiptData): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('printer:print', data),
  saveConfig: (data: { domain: string; printerName: string }): Promise<void> =>
    ipcRenderer.invoke('store:set', data),
  saveFiscalSnapshot: (data: unknown): Promise<{ success: boolean; path?: string; error?: string }> =>
    ipcRenderer.invoke('fiscal:save-snapshot', data),
});
