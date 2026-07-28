import { app, BrowserWindow, ipcMain, globalShortcut, Menu, dialog } from 'electron';
import * as path from 'node:path';
import { promises as fsPromises, appendFileSync } from 'node:fs';
import * as crypto from 'node:crypto';
import { exec } from 'node:child_process';
import Store from 'electron-store';
import { listPrinters, printReceipt } from './printer/index';
import { z } from 'zod';

interface StoreSchema {
  domain: string;
  printerName: string;
  signingKey: string;
}

interface PinCacheSchema {
  [empleadoId: string]: string;
}

interface FiscalSnapshotPayload {
  empresaNombre: string;
  aperturaAt: string;
  numeroZ: number;
  [key: string]: unknown;
}

// ── IPC input schemas (GAP-003 — SIALTI runtime validation) ──────────────────

const StoreSetSchema = z.object({
  domain: z.string().min(1).max(253),
  printerName: z.string().min(1).max(255),
});

const PrintReceiptSchema = z.object({
  empresa: z.object({
    nombre: z.string().max(200),
    nif: z.string().max(20),
    direccion: z.string().max(500),
  }),
  ticket: z.object({
    serie: z.string().max(50),
    fecha: z.string().min(10).max(60),
    operador: z.string().max(200),
  }),
  items: z.array(z.object({
    nombre: z.string().max(200),
    cantidad: z.number().int().positive(),
    precioUnitarioCents: z.number().int().min(0),
    subtotalCents: z.number().int().min(0),
  })),
  totales: z.object({
    baseImponibleCents: z.number().int().min(0),
    tipoImpuesto: z.enum(['iva', 'igic']),
    porcentajeImpuesto: z.number().min(0).max(100),
    impuestoCents: z.number().int().min(0),
    totalCents: z.number().int().min(0),
  }),
  aeatUrl: z.string().max(2048).nullable(),
  esCobro: z.boolean(),
  rectificaNumero: z.string().max(50).optional(),
});

const EmpleadoIdSchema = z.string().uuid();

const PinHashSchema = z.string().min(1).max(500);

const FiscalSnapshotSchema = z.object({
  empresaNombre: z.string().min(1).max(200),
  aperturaAt: z.string().min(10).max(60),
  numeroZ: z.number().int().positive(),
}).passthrough();

app.setName('Multisistema TPV');
Menu.setApplicationMenu(null);

const store = new Store<StoreSchema>();
const pinStore = new Store<PinCacheSchema>({ name: 'lc-pin-cache' });
let mainWindow: BrowserWindow;
let splashWindow: BrowserWindow | null = null;

function createSplash(): void {
  splashWindow = new BrowserWindow({
    width: 320,
    height: 220,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    transparent: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });
  void splashWindow.loadFile(path.join(__dirname, '../splash.html'));
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    title: `Multisistema TPV v${app.getVersion()}`,
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 768,
    frame: true,
    kiosk: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once('ready-to-show', () => {
    splashWindow?.close();
    splashWindow = null;
    mainWindow.show();
    mainWindow.focus();
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
      blocked.push({ key: 'I', control: true, shift: true }, { key: 'F12' });
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
  ipcMain.handle('store:set', (_event, data: unknown) => {
    const parsed = StoreSetSchema.safeParse(data);
    if (!parsed.success) return { success: false, error: 'Datos de configuración inválidos' };
    store.set('domain', parsed.data.domain);
    store.set('printerName', parsed.data.printerName);
    void mainWindow.loadURL(`https://${parsed.data.domain}/tpv`);
  });

  ipcMain.handle('printer:list', async () => {
    return listPrinters(mainWindow);
  });

  ipcMain.handle('printer:print', async (_event, data: unknown) => {
    const parsed = PrintReceiptSchema.safeParse(data);
    if (!parsed.success) return { success: false, error: 'Datos de ticket inválidos' };
    const printerName = store.get('printerName') as string | undefined;
    if (!printerName) {
      return { success: false, error: 'Impresora no configurada' };
    }
    return printReceipt(printerName, parsed.data);
  });

  ipcMain.handle('lc-pin:get', (_event, empleadoId: unknown) => {
    const parsed = EmpleadoIdSchema.safeParse(empleadoId);
    if (!parsed.success) return undefined;
    return pinStore.get(parsed.data);
  });

  ipcMain.handle('lc-pin:set', (_event, empleadoId: unknown, hash: unknown) => {
    const idParsed = EmpleadoIdSchema.safeParse(empleadoId);
    const hashParsed = PinHashSchema.safeParse(hash);
    if (!idParsed.success || !hashParsed.success) return;
    pinStore.set(idParsed.data, hashParsed.data);
  });

  ipcMain.handle('lc-pin:delete', (_event, empleadoId: unknown) => {
    const parsed = EmpleadoIdSchema.safeParse(empleadoId);
    if (!parsed.success) return;
    pinStore.delete(parsed.data);
  });

  ipcMain.handle('fiscal:save-snapshot', async (_event, data: unknown) => {
    const parsed = FiscalSnapshotSchema.safeParse(data);
    if (!parsed.success) return { success: false, error: 'Datos de snapshot inválidos' };
    try {
      const slug = parsed.data.empresaNombre.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const date = parsed.data.aperturaAt.slice(0, 10);
      const dir = path.join(app.getPath('userData'), 'fiscal', slug);
      await fsPromises.mkdir(dir, { recursive: true });
      const file = path.join(dir, `${date}-Z${parsed.data.numeroZ}.json`);

      // Hash the full payload with a device-specific key (generated once on first launch)
      // This detects local tampering: any edit to the JSON will break the signature
      const signingKey = store.get('signingKey') as string;
      const serialized = JSON.stringify(parsed.data, null, 2);
      const integrityHash = crypto.createHmac('sha256', signingKey).update(serialized).digest('hex');

      const securePayload = {
        ...parsed.data,
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
    const dir = app.getPath('userData');
    const logPath = path.join(dir, 'tpv-update.log');
    appendFileSync(logPath, `[${new Date().toISOString()}] ${msg}\n`, 'utf-8');
  } catch {
    // last-resort: write next to exe
    try {
      const exeDir = path.dirname(process.execPath);
      appendFileSync(path.join(exeDir, 'tpv-update.log'), `[${new Date().toISOString()}] ${msg}\n`, 'utf-8');
    } catch { console.warn('TPV: fallback log write also failed'); }
  }
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

    const scriptPath = path.join(app.getPath('temp'), 'tpv-self-update.ps1');
    const script = [
      'Start-Sleep -Seconds 2',
      `Copy-Item -Force '${tmpExe}' '${currentExe}'`,
      `Start-Process '${currentExe}'`,
      `Remove-Item -Force '${tmpExe}' -ErrorAction SilentlyContinue`,
      `Remove-Item -Force $MyInvocation.MyCommand.Path -ErrorAction SilentlyContinue`,
    ].join('\r\n');
    await fsPromises.writeFile(scriptPath, script, 'utf-8');

    await dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Actualización lista',
      message: `v${tpv.version} descargada. La aplicación se reiniciará ahora.`,
      buttons: ['Reiniciar'],
      defaultId: 0,
    });

    exec(`powershell -WindowStyle Hidden -ExecutionPolicy Bypass -File "${scriptPath}"`);
    app.quit();
  } catch (err) {
    writeUpdateLog(`ERROR: ${err instanceof Error ? err.message : String(err)}`);
  }
}

app.whenReady().then(() => {
  if (!store.get('signingKey')) {
    store.set('signingKey', crypto.randomBytes(32).toString('hex'));
  }
  createSplash();
  createWindow();
  registerGlobalShortcuts();
  setupIpc();
  const domain = store.get('domain') as string | undefined;
  writeUpdateLog(`app.whenReady — version=${app.getVersion()} userData=${app.getPath('userData')} domain=${domain ?? '(no domain)'}`);
  if (domain) void checkForPortableUpdate(domain);
}).catch(console.error);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
