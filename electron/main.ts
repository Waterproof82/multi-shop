import { app, BrowserWindow, ipcMain, globalShortcut } from 'electron';
import * as path from 'path';
import { promises as fsPromises } from 'fs';
import * as crypto from 'crypto';
import Store from 'electron-store';
import { autoUpdater } from 'electron-updater';
import { listPrinters, printReceipt } from './printer/index';
import type { ReceiptData } from './printer/receipt';

interface StoreSchema {
  domain: string;
  printerName: string;
  signingKey: string;
}

interface FiscalSnapshotPayload {
  empresaNombre: string;
  aperturaAt: string;
  numeroZ: number;
  [key: string]: unknown;
}

const store = new Store<StoreSchema>();
let mainWindow: BrowserWindow;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 768,
    frame: true,
    kiosk: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const domain = store.get('domain') as string | undefined;
  if (!domain) {
    void mainWindow.loadFile(path.join(__dirname, '../setup.html'));
  } else {
    void mainWindow.loadURL(`https://${domain}/tpv`);
  }

  blockDangerousShortcuts();
}

function blockDangerousShortcuts(): void {
  mainWindow.webContents.on('before-input-event', (event, input) => {
    const blocked: Array<{ key: string; control?: boolean; shift?: boolean }> = [
      { key: 'F5' },
      { key: 'r', control: true },
      { key: '=', control: true },
      { key: '-', control: true },
      { key: '0', control: true },
      { key: 'F11' },
    ];

    if (app.isPackaged) {
      blocked.push({ key: 'I', control: true, shift: true });
      blocked.push({ key: 'F12' });
    }

    const isBlocked = blocked.some(
      (b) =>
        input.key === b.key &&
        (b.control === undefined || input.control === b.control) &&
        (b.shift === undefined || input.shift === b.shift),
    );

    if (isBlocked) event.preventDefault();
  });
}

function registerGlobalShortcuts(): void {
  globalShortcut.register('CommandOrControl+Shift+R', () => {
    store.clear();
    void mainWindow.loadFile(path.join(__dirname, '../setup.html'));
  });
}

function setupIpc(): void {
  ipcMain.handle('store:set', (_event, data: { domain: string; printerName: string }) => {
    store.set('domain', data.domain);
    store.set('printerName', data.printerName);
    void mainWindow.loadURL(`https://${data.domain}/tpv`);
  });

  ipcMain.handle('printer:list', async () => {
    return listPrinters(mainWindow);
  });

  ipcMain.handle('printer:print', async (_event, data: ReceiptData) => {
    const printerName = store.get('printerName') as string | undefined;
    if (!printerName) {
      return { success: false, error: 'Impresora no configurada' };
    }
    return printReceipt(printerName, data);
  });

  ipcMain.handle('fiscal:save-snapshot', async (_event, data: FiscalSnapshotPayload) => {
    try {
      const slug = data.empresaNombre.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const date = data.aperturaAt.slice(0, 10);
      const dir = path.join(app.getPath('userData'), 'fiscal', slug);
      await fsPromises.mkdir(dir, { recursive: true });
      const file = path.join(dir, `${date}-Z${data.numeroZ}.json`);

      // Hash the full payload with a device-specific key (generated once on first launch)
      // This detects local tampering: any edit to the JSON will break the signature
      const signingKey = store.get('signingKey') as string;
      const serialized = JSON.stringify(data, null, 2);
      const integrityHash = crypto.createHmac('sha256', signingKey).update(serialized).digest('hex');

      const securePayload = {
        ...data,
        sialti_metadata: {
          secured_at: new Date().toISOString(),
          integrity_hash: integrityHash,
          verification_standard: 'RD 1007/2023',
        },
      };

      await fsPromises.writeFile(file, JSON.stringify(securePayload, null, 2), 'utf-8');
      return { success: true, path: file };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  });
}

function setupAutoUpdater(): void {
  const domain = store.get('domain') as string | undefined;
  if (!domain) return;

  autoUpdater.setFeedURL({
    provider: 'generic',
    url: `https://${domain}/api/app/version/`,
  } as Parameters<typeof autoUpdater.setFeedURL>[0]);

  autoUpdater.checkForUpdatesAndNotify().catch(() => {
    // Silencioso — no crashear si no hay red o no hay nueva versión
  });
}

app.whenReady().then(() => {
  if (!store.get('signingKey')) {
    store.set('signingKey', crypto.randomBytes(32).toString('hex'));
  }
  createWindow();
  registerGlobalShortcuts();
  setupIpc();
  setupAutoUpdater();
}).catch(console.error);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
