import { app, BrowserWindow, ipcMain, globalShortcut, Menu, dialog } from 'electron';
import * as path from 'path';
import { promises as fsPromises } from 'fs';
import { appendFileSync } from 'fs';
import * as crypto from 'crypto';
import { exec } from 'child_process';
import Store from 'electron-store';
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

app.setName('Multisistema TPV');
Menu.setApplicationMenu(null);

const store = new Store<StoreSchema>();
let mainWindow: BrowserWindow;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    title: `Multisistema TPV v${app.getVersion()}`,
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

  // Keep our version title — prevent web page from overriding it
  mainWindow.on('page-title-updated', (event) => {
    event.preventDefault();
  });
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

function isNewerVersion(remote: string, current: string): boolean {
  const parse = (v: string) => v.split('.').map(Number);
  const [rMaj, rMin, rPat] = parse(remote);
  const [cMaj, cMin, cPat] = parse(current);
  if (rMaj !== cMaj) return rMaj > cMaj;
  if (rMin !== cMin) return rMin > cMin;
  return rPat > cPat;
}

function writeUpdateLog(msg: string): void {
  try {
    const logPath = path.join(app.getPath('userData'), 'tpv-update.log');
    appendFileSync(logPath, `[${new Date().toISOString()}] ${msg}\n`, 'utf-8');
  } catch { /* ignore */ }
}

async function checkForPortableUpdate(domain: string): Promise<void> {
  writeUpdateLog(`checkForPortableUpdate start — domain=${domain} current=${app.getVersion()}`);
  try {
    const res = await fetch(`https://${domain}/api/app/version`);
    writeUpdateLog(`API response status=${res.status}`);
    if (!res.ok) return;
    const data = await res.json() as { tpv?: { version: string; exeUrl: string | null } };
    writeUpdateLog(`API tpv=${JSON.stringify(data.tpv)}`);
    const tpv = data.tpv;
    if (!tpv?.version || !tpv.exeUrl) return;

    const current = app.getVersion();
    writeUpdateLog(`version check — remote=${tpv.version} current=${current} isNewer=${isNewerVersion(tpv.version, current)}`);
    if (!isNewerVersion(tpv.version, current)) return;

    const choice = await dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Actualización disponible',
      message: `Nueva versión ${tpv.version} disponible`,
      detail: `Versión instalada: ${current}\n\nSe descargará y reemplazará automáticamente al hacer clic en Actualizar.`,
      buttons: ['Actualizar ahora', 'Más tarde'],
      defaultId: 0,
      cancelId: 1,
    });

    if (choice.response !== 0) return;

    const tmpExe = path.join(app.getPath('temp'), `tpv-update-${tpv.version}.exe`);
    const currentExe = process.execPath;

    // Download in background — no blocking dialog
    mainWindow.setTitle(`Multisistema TPV v${current} — Descargando ${tpv.version}...`);

    const dlRes = await fetch(tpv.exeUrl);
    if (!dlRes.ok) throw new Error('Error al descargar la actualización');
    const buffer = Buffer.from(await dlRes.arrayBuffer());
    await fsPromises.writeFile(tmpExe, buffer);

    const scriptPath = path.join(app.getPath('temp'), 'tpv-self-update.bat');
    const script = [
      '@echo off',
      'timeout /t 2 /nobreak > nul',
      `copy /Y "${tmpExe}" "${currentExe}"`,
      `start "" "${currentExe}"`,
      `del "${tmpExe}"`,
      'del "%~f0"',
    ].join('\r\n');
    await fsPromises.writeFile(scriptPath, script, 'utf-8');

    await dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Actualización lista',
      message: `v${tpv.version} descargada. La aplicación se reiniciará ahora.`,
      buttons: ['Reiniciar'],
      defaultId: 0,
    });

    exec(`start "" "${scriptPath}"`);
    app.quit();
  } catch (err) {
    writeUpdateLog(`ERROR: ${err instanceof Error ? err.message : String(err)}`);
  }
}

app.whenReady().then(() => {
  if (!store.get('signingKey')) {
    store.set('signingKey', crypto.randomBytes(32).toString('hex'));
  }
  createWindow();
  registerGlobalShortcuts();
  setupIpc();
  const domain = store.get('domain') as string | undefined;
  if (domain) void checkForPortableUpdate(domain);
}).catch(console.error);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
