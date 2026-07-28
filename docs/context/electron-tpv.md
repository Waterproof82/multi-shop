# Electron TPV Windows

## Archivos fuente

- `electron/main.ts` — proceso main
- `electron/preload.ts` — contextBridge
- `electron/dist/` — bundles esbuild (en .gitignore, no commitear)

## Proceso de build

```
pnpm build:electron:prep      # esbuild: .ts → electron/dist/*.js
pnpm build:electron:rebuild   # native modules para el target de Electron
electron-builder --win        # genera el instalador
```

Editar SIEMPRE los `.ts` fuente, NUNCA los `.js` en `electron/dist/`.

## Arquitectura

- **URL remota siempre** — el shell carga `https://{dominio}/tpv` desde produccion. No hay Next.js local dentro de Electron.
- **IPC para impresion** — renderer llama `window.electronAPI.print(data)` via contextBridge. El main process recibe el IPC y llama a `node-thermal-printer`. Nunca acceder a modulos de Node directamente desde el renderer.
- **Auto-update endpoint** — `GET /api/app/version/latest.yml` sirve el YAML para `electron-updater`. Implementado en `src/app/api/app/version/latest.yml/route.ts`.

## Versiones

| Componente | Versión |
|---|---|
| Electron | 39.8.10 |
| electron-builder | 26.15.7 |
| electron-store | 8.2.0 (última CJS; v9+ es ESM-only) |

## Seguridad

- **`sandbox: true`** — renderer en sandbox OS-level desde v1.1.0. Seguro porque `preload.ts` solo usa `contextBridge` + `ipcRenderer`, sin acceso directo a Node.js.
- **`contextIsolation: true`** y **`nodeIntegration: false`** — siempre activos.
- **IPC validation** — todos los handlers validan con Zod antes de procesar (GAP-003 SIALTI).

## Trampas

- **`electron/package.json` con `"type": "commonjs"`** — el proceso main necesita CJS. El `package.json` raiz tiene `"type": "module"`, por eso el sub-package tiene su propio `type`.
- **`electron/dist/` en `.gitignore`** — los bundles no se commitean. Siempre recompilar antes de distribuir.
- **`electron-store` debe ser v8.x** — v9+ es ESM-only; esbuild compila a CJS (`--platform=node`). No actualizar a v9+ sin cambiar el target de esbuild.
- **`pnpm.onlyBuiltDependencies: ['electron']`** — necesario en pnpm v10 para permitir la descarga del binario de Electron.
