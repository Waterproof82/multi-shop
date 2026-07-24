export {};

declare global {
  interface Window {
    electronAPI?: {
      isElectron: true;
      getPrinters: () => Promise<string[]>;
      print: (data: unknown) => Promise<{ success: boolean; error?: string }>;
      saveConfig: (data: { domain: string; printerName: string }) => Promise<void>;
      saveFiscalSnapshot: (data: unknown) => Promise<{ success: boolean; path?: string; error?: string }>;
      lcPinStore?: {
        get: (empleadoId: string) => Promise<string | undefined>;
        set: (empleadoId: string, hash: string) => Promise<void>;
        delete: (empleadoId: string) => Promise<void>;
      };
    };
  }
}
