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

## Trampas

- **`electron/package.json` con `"type": "commonjs"`** — el proceso main necesita CJS. El `package.json` raiz tiene `"type": "module"`, por eso el sub-package tiene su propio `type`.
- **`electron/dist/` en `.gitignore`** — los bundles no se commitean. Siempre recompilar antes de distribuir.
