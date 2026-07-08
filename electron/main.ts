import { app, BrowserWindow, ipcMain, globalShortcut } from 'electron';
import * as path from 'path';
import Store from 'electron-store';
import { autoUpdater } from 'electron-updater';
import { listPrinters, printReceipt } from './printer/index';
import type { ReceiptData } from './printer/receipt';

interface StoreSchema {
  domain: string;
  printerName: string;
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
