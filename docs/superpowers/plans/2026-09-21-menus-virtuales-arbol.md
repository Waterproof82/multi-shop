# Rediseño del árbol de Menús Virtuales — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rediseñar `src/app/admin/(protected)/menus-virtuales/page.tsx` para que crear y ver menús virtuales sea claro: jerarquía visual (iconos + badges + breadcrumb), creación vía diálogo (sin nodos placeholder), reordenar con drag & drop real, y feedback consistente con el resto del admin (banner inline + diálogo de confirmación, sin `alert`/`confirm`).

**Architecture:** Dos componentes nuevos y aislados (`NuevoMenuVirtualDialog`, `EliminarMenuVirtualDialog`) que reciben callbacks — no hacen fetch propio, igual que `ModalidadesEntregaForm`. Una función pura nueva (`reordenarPorArrastre`) hace todo el cálculo de reindexado, separada del wiring de `@dnd-kit` para poder testearla sin simular drag real. El backend gana un método adicional (`getProductCounts`) que reutiliza una query ya existente (`findAsignacionesByTenant`) en vez de tocar SQL.

**Tech Stack:** Next.js 16 / React 19, `@dnd-kit/core` + `@dnd-kit/sortable` (nueva dependencia), Vitest + Testing Library (patrón ya usado en `tests/ui/modalidades-entrega-form.test.tsx`).

Spec: `docs/superpowers/specs/2026-09-21-menus-virtuales-arbol-design.md`

---

### Task 1: Agregar `@dnd-kit`

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Instalar las dependencias**

Run: `pnpm add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities`
Expected: `package.json` y `pnpm-lock.yaml` se actualizan, exit code 0.

- [ ] **Step 2: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore(menus-virtuales): agregar @dnd-kit para reordenar el árbol"
```

---

### Task 2: Claves de traducción nuevas

**Files:**
- Modify: `src/lib/translations.ts:522-537` (bloque `es`)
- Modify: `src/lib/translations.ts:1586-1601` (bloque `en`)

- [ ] **Step 1: Agregar claves ES**

En el bloque `es` (después de la línea 537, `menuVirtualAsignarError`), agregar:

```ts
    menuVirtualCrearTitulo: "Nuevo menú",
    menuVirtualCrearSubcategoriaTitulo: "Nueva subcategoría",
    menuVirtualCrearDescripcion: "Elegí un nombre. Podés cambiarlo después.",
    menuVirtualNombrePlaceholder: "Ej: Bebidas",
    menuVirtualCrearConfirmar: "Crear",
    menuVirtualVacio: "Vacío",
    menuVirtualEliminarTitulo: "Eliminar menú",
    menuVirtualProductosCount: "producto(s)",
    menuVirtualSubcategoriasCount: "subcategoría(s)",
    menuVirtualGuardarNombreError: "Error al guardar los cambios.",
```

- [ ] **Step 2: Agregar claves EN**

En el bloque `en` (después de la línea 1601, `menuVirtualAsignarError`), agregar:

```ts
    menuVirtualCrearTitulo: "New menu",
    menuVirtualCrearSubcategoriaTitulo: "New subcategory",
    menuVirtualCrearDescripcion: "Choose a name. You can change it later.",
    menuVirtualNombrePlaceholder: "E.g: Drinks",
    menuVirtualCrearConfirmar: "Create",
    menuVirtualVacio: "Empty",
    menuVirtualEliminarTitulo: "Delete menu",
    menuVirtualProductosCount: "product(s)",
    menuVirtualSubcategoriasCount: "subcategory(ies)",
    menuVirtualGuardarNombreError: "Error saving changes.",
```

- [ ] **Step 3: Verificar que compila**

Run: `pnpm typecheck`
Expected: sin errores (las claves nuevas son opcionales para el tipo `t()`, no rompen nada existente).

- [ ] **Step 4: Commit**

```bash
git add src/lib/translations.ts
git commit -m "i18n(menus-virtuales): claves para diálogo de creación y badges"
```

---

### Task 3: Backend — conteo de productos por nodo

**Files:**
- Modify: `src/core/application/use-cases/menu-virtual.use-case.ts`
- Modify: `src/app/api/admin/menus-virtuales/route.ts`
- Test: `tests/core/menu-virtual-use-case-product-counts.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```ts
// tests/core/menu-virtual-use-case-product-counts.test.ts
import { describe, it, expect, vi } from 'vitest';
import { MenuVirtualUseCase } from '../../src/core/application/use-cases/menu-virtual.use-case';
import type { IMenuVirtualRepository } from '../../src/core/domain/repositories/IMenuVirtualRepository';

function repoStubConAsignaciones(asignaciones: { menuVirtualId: string; productoId: string }[]): IMenuVirtualRepository {
  return {
    findAllByTenant: vi.fn(),
    findAsignacionesByTenant: vi.fn().mockResolvedValue({ success: true, data: asignaciones }),
    findProductoIdsByMenuVirtual: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    setProductos: vi.fn(),
    addProductos: vi.fn(),
  };
}

describe('MenuVirtualUseCase.getProductCounts', () => {
  it('agrupa las asignaciones por menuVirtualId', async () => {
    const repo = repoStubConAsignaciones([
      { menuVirtualId: 'hoja-1', productoId: 'p1' },
      { menuVirtualId: 'hoja-1', productoId: 'p2' },
      { menuVirtualId: 'hoja-2', productoId: 'p3' },
    ]);
    const useCase = new MenuVirtualUseCase(repo);

    const result = await useCase.getProductCounts('empresa-1');

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.get('hoja-1')).toBe(2);
    expect(result.data.get('hoja-2')).toBe(1);
    expect(result.data.has('hoja-sin-productos')).toBe(false);
  });

  it('propaga el error si el repo falla', async () => {
    const repo = repoStubConAsignaciones([]);
    repo.findAsignacionesByTenant = vi.fn().mockResolvedValue({
      success: false,
      error: { code: 'DB_ERROR', message: 'boom', module: 'repository', method: 'findAsignacionesByTenant' },
    });
    const useCase = new MenuVirtualUseCase(repo);

    const result = await useCase.getProductCounts('empresa-1');

    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Correr el test para confirmar que falla**

Run: `pnpm vitest run tests/core/menu-virtual-use-case-product-counts.test.ts`
Expected: FAIL — `getProductCounts is not a function`.

- [ ] **Step 3: Implementar `getProductCounts`**

En `src/core/application/use-cases/menu-virtual.use-case.ts`, agregar el método a la clase (después de `getProductoIds`):

```ts
  async getProductCounts(empresaId: string): Promise<Result<Map<string, number>>> {
    const result = await this.repo.findAsignacionesByTenant(empresaId);
    if (!result.success) return result;

    const counts = new Map<string, number>();
    for (const asignacion of result.data) {
      counts.set(asignacion.menuVirtualId, (counts.get(asignacion.menuVirtualId) ?? 0) + 1);
    }
    return { success: true, data: counts };
  }
```

- [ ] **Step 4: Correr el test para confirmar que pasa**

Run: `pnpm vitest run tests/core/menu-virtual-use-case-product-counts.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Exponer el conteo en el GET del admin**

Modificar `src/app/api/admin/menus-virtuales/route.ts` — reemplazar el `GET` actual:

```ts
export async function GET(request: NextRequest) {
  const ctx = await resolveAdminContextWithEmpresa(request);
  if (ctx.error) return ctx.error;
  const { empresaId } = ctx;

  const [nodosResult, countsResult] = await Promise.all([
    getMenuVirtualUseCase().getAll(empresaId),
    getMenuVirtualUseCase().getProductCounts(empresaId),
  ]);

  if (!nodosResult.success) return handleResultWithStatus(nodosResult);
  if (!countsResult.success) return handleResultWithStatus(countsResult);

  const nodosConConteo = nodosResult.data.map(nodo => ({
    ...nodo,
    productosCount: countsResult.data.get(nodo.id) ?? 0,
  }));

  return handleResultWithStatus({ success: true, data: nodosConConteo });
}
```

- [ ] **Step 6: Typecheck + lint completo**

Run: `pnpm lint && pnpm typecheck`
Expected: sin errores.

- [ ] **Step 7: Commit**

```bash
git add src/core/application/use-cases/menu-virtual.use-case.ts src/app/api/admin/menus-virtuales/route.ts tests/core/menu-virtual-use-case-product-counts.test.ts
git commit -m "feat(menus-virtuales): exponer productosCount por nodo en el listado admin"
```

---

### Task 4: Función pura de reordenamiento

**Files:**
- Create: `src/lib/menu-virtual-reorder.ts`
- Test: `tests/core/menu-virtual-reorder.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```ts
// tests/core/menu-virtual-reorder.test.ts
import { describe, it, expect } from 'vitest';
import { reordenarPorArrastre } from '../../src/lib/menu-virtual-reorder';

describe('reordenarPorArrastre', () => {
  it('mueve el nodo arrastrado a la posición del nodo soltado y reindexa orden 0..n-1', () => {
    const nodos = [
      { id: 'a', orden: 0 },
      { id: 'b', orden: 1 },
      { id: 'c', orden: 2 },
    ];

    const resultado = reordenarPorArrastre(nodos, 'a', 'c');

    expect(resultado.map(n => n.id)).toEqual(['b', 'c', 'a']);
    expect(resultado.map(n => n.orden)).toEqual([0, 1, 2]);
  });

  it('devuelve el array sin cambios si activeId y overId son el mismo nodo', () => {
    const nodos = [{ id: 'a', orden: 0 }, { id: 'b', orden: 1 }];

    const resultado = reordenarPorArrastre(nodos, 'a', 'a');

    expect(resultado).toBe(nodos);
  });

  it('devuelve el array sin cambios si algún id no existe en la lista', () => {
    const nodos = [{ id: 'a', orden: 0 }, { id: 'b', orden: 1 }];

    const resultado = reordenarPorArrastre(nodos, 'a', 'inexistente');

    expect(resultado).toBe(nodos);
  });

  it('preserva campos extra de cada nodo (no solo id/orden)', () => {
    const nodos = [
      { id: 'a', orden: 0, nombre: 'Bebidas' },
      { id: 'b', orden: 1, nombre: 'Postres' },
    ];

    const resultado = reordenarPorArrastre(nodos, 'a', 'b');

    expect(resultado.find(n => n.id === 'a')?.nombre).toBe('Bebidas');
  });
});
```

- [ ] **Step 2: Correr el test para confirmar que falla**

Run: `pnpm vitest run tests/core/menu-virtual-reorder.test.ts`
Expected: FAIL — no se puede resolver el módulo `../../src/lib/menu-virtual-reorder`.

- [ ] **Step 3: Implementar la función**

```ts
// src/lib/menu-virtual-reorder.ts
export interface NodoOrdenable {
  id: string;
  orden: number;
}

export function reordenarPorArrastre<T extends NodoOrdenable>(
  nodos: T[],
  activeId: string,
  overId: string
): T[] {
  if (activeId === overId) return nodos;

  const ordenados = [...nodos].sort((a, b) => a.orden - b.orden);
  const fromIndex = ordenados.findIndex(n => n.id === activeId);
  const toIndex = ordenados.findIndex(n => n.id === overId);
  if (fromIndex === -1 || toIndex === -1) return nodos;

  const [moved] = ordenados.splice(fromIndex, 1);
  ordenados.splice(toIndex, 0, moved);

  return ordenados.map((n, idx) => ({ ...n, orden: idx }));
}
```

- [ ] **Step 4: Correr el test para confirmar que pasa**

Run: `pnpm vitest run tests/core/menu-virtual-reorder.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/menu-virtual-reorder.ts tests/core/menu-virtual-reorder.test.ts
git commit -m "feat(menus-virtuales): funcion pura de reindexado para drag and drop"
```

---

### Task 5: `NuevoMenuVirtualDialog`

**Files:**
- Create: `src/components/admin/NuevoMenuVirtualDialog.tsx`
- Test: `tests/ui/nuevo-menu-virtual-dialog.test.tsx`

- [ ] **Step 1: Escribir el test que falla**

```tsx
// tests/ui/nuevo-menu-virtual-dialog.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LanguageProvider } from '@/lib/language-context';
import { NuevoMenuVirtualDialog } from '@/components/admin/NuevoMenuVirtualDialog';

function renderDialog(props: Partial<React.ComponentProps<typeof NuevoMenuVirtualDialog>> = {}) {
  const onOpenChange = vi.fn();
  const onConfirm = vi.fn();
  render(
    <LanguageProvider>
      <NuevoMenuVirtualDialog
        open
        esSubcategoria={false}
        saving={false}
        onOpenChange={onOpenChange}
        onConfirm={onConfirm}
        {...props}
      />
    </LanguageProvider>
  );
  return { onOpenChange, onConfirm };
}

describe('NuevoMenuVirtualDialog', () => {
  it('el botón Crear está deshabilitado con el nombre vacío', () => {
    renderDialog();
    expect(screen.getByRole('button', { name: /crear/i })).toBeDisabled();
  });

  it('llama a onConfirm con el nombre recortado al enviar', () => {
    const { onConfirm } = renderDialog();
    fireEvent.change(screen.getByLabelText(/nombre/i), { target: { value: '  Bebidas  ' } });
    fireEvent.click(screen.getByRole('button', { name: /crear/i }));
    expect(onConfirm).toHaveBeenCalledWith('Bebidas');
  });

  it('no llama a onConfirm si el nombre es solo espacios', () => {
    const { onConfirm } = renderDialog();
    fireEvent.change(screen.getByLabelText(/nombre/i), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: /crear/i }));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('muestra el título de subcategoría cuando esSubcategoria es true', () => {
    renderDialog({ esSubcategoria: true });
    expect(screen.getByText(/nueva subcategoría/i)).toBeInTheDocument();
  });

  it('cancelar llama a onOpenChange(false)', () => {
    const { onOpenChange } = renderDialog();
    fireEvent.click(screen.getByRole('button', { name: /cancelar/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
```

- [ ] **Step 2: Correr el test para confirmar que falla**

Run: `pnpm vitest run tests/ui/nuevo-menu-virtual-dialog.test.tsx`
Expected: FAIL — no se puede resolver `@/components/admin/NuevoMenuVirtualDialog`.

- [ ] **Step 3: Implementar el componente**

```tsx
// src/components/admin/NuevoMenuVirtualDialog.tsx
'use client';

import { useState, type FormEvent } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/lib/language-context';
import { t } from '@/lib/translations';

interface NuevoMenuVirtualDialogProps {
  open: boolean;
  esSubcategoria: boolean;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (nombre: string) => void;
}

export function NuevoMenuVirtualDialog({
  open,
  esSubcategoria,
  saving,
  onOpenChange,
  onConfirm,
}: Readonly<NuevoMenuVirtualDialogProps>) {
  const { language } = useLanguage();
  const [nombre, setNombre] = useState('');

  function handleOpenChange(next: boolean) {
    if (!next) setNombre('');
    onOpenChange(next);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = nombre.trim();
    if (!trimmed) return;
    onConfirm(trimmed);
    setNombre('');
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {esSubcategoria
              ? t('menuVirtualCrearSubcategoriaTitulo', language)
              : t('menuVirtualCrearTitulo', language)}
          </DialogTitle>
          <DialogDescription>{t('menuVirtualCrearDescripcion', language)}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="nuevo-menu-virtual-nombre" className="block text-sm font-medium text-foreground mb-1">
              {t('menuVirtualNombre', language)}
            </label>
            <Input
              id="nuevo-menu-virtual-nombre"
              value={nombre}
              onChange={e => setNombre(e.target.value)}
              placeholder={t('menuVirtualNombrePlaceholder', language)}
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" type="button" onClick={() => handleOpenChange(false)}>
              {t('cancel', language)}
            </Button>
            <Button type="submit" disabled={saving || nombre.trim().length === 0}>
              {t('menuVirtualCrearConfirmar', language)}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Correr el test para confirmar que pasa**

Run: `pnpm vitest run tests/ui/nuevo-menu-virtual-dialog.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/NuevoMenuVirtualDialog.tsx tests/ui/nuevo-menu-virtual-dialog.test.tsx
git commit -m "feat(menus-virtuales): dialogo de creacion, reemplaza el nodo placeholder"
```

---

### Task 6: `EliminarMenuVirtualDialog`

**Files:**
- Create: `src/components/admin/EliminarMenuVirtualDialog.tsx`
- Test: `tests/ui/eliminar-menu-virtual-dialog.test.tsx`

- [ ] **Step 1: Escribir el test que falla**

```tsx
// tests/ui/eliminar-menu-virtual-dialog.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LanguageProvider } from '@/lib/language-context';
import { EliminarMenuVirtualDialog } from '@/components/admin/EliminarMenuVirtualDialog';

describe('EliminarMenuVirtualDialog', () => {
  it('muestra el nombre del nodo a eliminar', () => {
    render(
      <LanguageProvider>
        <EliminarMenuVirtualDialog open nodoNombre="Bebidas" onOpenChange={vi.fn()} onConfirm={vi.fn()} />
      </LanguageProvider>
    );
    expect(screen.getByText('Bebidas')).toBeInTheDocument();
  });

  it('confirmar llama a onConfirm', () => {
    const onConfirm = vi.fn();
    render(
      <LanguageProvider>
        <EliminarMenuVirtualDialog open nodoNombre="Bebidas" onOpenChange={vi.fn()} onConfirm={onConfirm} />
      </LanguageProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: /eliminar/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('cancelar llama a onOpenChange(false), no a onConfirm', () => {
    const onOpenChange = vi.fn();
    const onConfirm = vi.fn();
    render(
      <LanguageProvider>
        <EliminarMenuVirtualDialog open nodoNombre="Bebidas" onOpenChange={onOpenChange} onConfirm={onConfirm} />
      </LanguageProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: /cancelar/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Correr el test para confirmar que falla**

Run: `pnpm vitest run tests/ui/eliminar-menu-virtual-dialog.test.tsx`
Expected: FAIL — no se puede resolver `@/components/admin/EliminarMenuVirtualDialog`.

- [ ] **Step 3: Implementar el componente**

```tsx
// src/components/admin/EliminarMenuVirtualDialog.tsx
'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/lib/language-context';
import { t } from '@/lib/translations';

interface EliminarMenuVirtualDialogProps {
  open: boolean;
  nodoNombre: string | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export function EliminarMenuVirtualDialog({
  open,
  nodoNombre,
  onOpenChange,
  onConfirm,
}: Readonly<EliminarMenuVirtualDialogProps>) {
  const { language } = useLanguage();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('menuVirtualEliminarTitulo', language)}</DialogTitle>
          <DialogDescription>
            {t('menuVirtualEliminarConfirm', language)} <strong>{nodoNombre}</strong>
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-3">
          <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>
            {t('cancel', language)}
          </Button>
          <Button type="button" variant="destructive" onClick={onConfirm}>
            {t('menuVirtualEliminar', language)}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Correr el test para confirmar que pasa**

Run: `pnpm vitest run tests/ui/eliminar-menu-virtual-dialog.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/EliminarMenuVirtualDialog.tsx tests/ui/eliminar-menu-virtual-dialog.test.tsx
git commit -m "feat(menus-virtuales): dialogo de confirmacion de borrado, reemplaza confirm() nativo"
```

---

### Task 7: Rediseñar `menus-virtuales/page.tsx`

**Files:**
- Modify: `src/app/admin/(protected)/menus-virtuales/page.tsx` (reemplazo completo)

Este task integra todo lo anterior: iconos + badges + estado vacío, breadcrumb, diálogos, drag & drop, y banner de error en vez de `alert`/`confirm`. No es TDD puro (es wiring de UI ya cubierto por los componentes/función pura testeados arriba) — se verifica con `pnpm lint && pnpm build` y una pasada manual en el navegador (Task 8).

- [ ] **Step 1: Reemplazar el archivo completo**

```tsx
// src/app/admin/(protected)/menus-virtuales/page.tsx
'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, Trash2, Save, Loader2, Folder, Tag, GripVertical } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { fetchWithCsrf } from '@/lib/csrf-client';
import { useAdmin } from '@/lib/admin-context';
import { useLanguage } from '@/lib/language-context';
import { t } from '@/lib/translations';
import { reordenarPorArrastre } from '@/lib/menu-virtual-reorder';
import { NuevoMenuVirtualDialog } from '@/components/admin/NuevoMenuVirtualDialog';
import { EliminarMenuVirtualDialog } from '@/components/admin/EliminarMenuVirtualDialog';

interface MenuVirtual {
  id: string;
  empresaId: string;
  padreId: string | null;
  nombre: string;
  orden: number;
  productosCount: number;
}

interface AdminProducto {
  id: string;
  titulo_es: string;
  activo: boolean;
}

interface SortableNodoRowProps {
  nodo: MenuVirtual;
  selected: boolean;
  esHijo: boolean;
  subcategoriasCount: number;
  onSelect: () => void;
}

function SortableNodoRow({ nodo, selected, esHijo, subcategoriasCount, onSelect }: Readonly<SortableNodoRowProps>) {
  const { language } = useLanguage();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: nodo.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const vacio = subcategoriasCount === 0 && nodo.productosCount === 0;
  const Icono = esHijo ? Tag : Folder;

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-1">
      <button
        type="button"
        aria-label={t('orderLabel', language)}
        className="touch-none p-1.5 text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        onClick={onSelect}
        className={`flex-1 text-left px-2 py-2 rounded-lg text-sm flex items-center gap-2 ${
          esHijo ? '' : 'font-medium'
        } ${selected ? 'bg-primary/10 text-primary' : 'hover:bg-muted/50 text-foreground'}`}
      >
        <Icono className="w-4 h-4 shrink-0 opacity-70" />
        <span className="truncate">{nodo.nombre}</span>
        {vacio ? (
          <span className="ml-auto text-xs text-muted-foreground">{t('menuVirtualVacio', language)}</span>
        ) : (
          <span className="ml-auto text-xs text-muted-foreground shrink-0">
            {esHijo ? nodo.productosCount : subcategoriasCount}
          </span>
        )}
      </button>
    </div>
  );
}

export default function MenusVirtualesPage() {
  const { empresaId } = useAdmin();
  const { language } = useLanguage();
  const [nodos, setNodos] = useState<MenuVirtual[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editNombre, setEditNombre] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [productos, setProductos] = useState<AdminProducto[]>([]);
  const [selectedProductoIds, setSelectedProductoIds] = useState<string[]>([]);
  const [productoSearch, setProductoSearch] = useState('');
  const [savingProductos, setSavingProductos] = useState(false);

  const [dialogAbierto, setDialogAbierto] = useState(false);
  const [padreParaNuevo, setPadreParaNuevo] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);

  const [eliminarAbierto, setEliminarAbierto] = useState(false);
  const [nodoAEliminar, setNodoAEliminar] = useState<MenuVirtual | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const fetchNodos = useCallback(async () => {
    const res = await fetch('/api/admin/menus-virtuales');
    if (!res.ok) return;
    const data = await res.json() as MenuVirtual[];
    setNodos(data);
  }, []);

  useEffect(() => {
    void fetchNodos().finally(() => setLoading(false));
  }, [fetchNodos]);

  useEffect(() => {
    void fetch('/api/admin/productos')
      .then(res => res.ok ? res.json() : [])
      .then((data: AdminProducto[]) => setProductos(data));
  }, []);

  const padres = useMemo(() => nodos.filter(n => !n.padreId).sort((a, b) => a.orden - b.orden), [nodos]);
  const hijosDe = useCallback((padreId: string) => nodos.filter(n => n.padreId === padreId).sort((a, b) => a.orden - b.orden), [nodos]);

  const selectedNodo = nodos.find(n => n.id === selectedId) ?? null;
  const selectedPadre = selectedNodo?.padreId ? nodos.find(n => n.id === selectedNodo.padreId) ?? null : null;
  const selectedEsHoja = selectedNodo !== null && hijosDe(selectedNodo.id).length === 0;

  function handleSelect(nodo: MenuVirtual) {
    setSelectedId(nodo.id);
    setEditNombre(nodo.nombre);
    setProductoSearch('');
    setSelectedProductoIds([]);
    setError('');
  }

  useEffect(() => {
    if (!selectedId || !selectedEsHoja) return;
    void fetch(`/api/admin/menus-virtuales/${selectedId}/productos`)
      .then(res => res.ok ? res.json() : [])
      .then((ids: string[]) => setSelectedProductoIds(ids));
  }, [selectedId, selectedEsHoja]);

  function abrirDialogoNuevoMenu() {
    setPadreParaNuevo(null);
    setDialogAbierto(true);
  }

  function abrirDialogoNuevaSubcategoria(padreId: string) {
    setPadreParaNuevo(padreId);
    setDialogAbierto(true);
  }

  async function handleCrear(nombre: string) {
    if (!empresaId) return;
    setCreando(true);
    setError('');
    try {
      const res = await fetchWithCsrf('/api/admin/menus-virtuales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre_es: nombre, empresaId, padreId: padreParaNuevo }),
      });
      if (!res.ok) {
        setError(t('menuVirtualGuardarNombreError', language));
        return;
      }
      const created = await res.json() as MenuVirtual;
      setNodos(prev => [...prev, { ...created, productosCount: 0 }]);
      handleSelect({ ...created, productosCount: 0 });
      setDialogAbierto(false);
    } finally {
      setCreando(false);
    }
  }

  async function handleGuardarNombre() {
    if (!selectedId) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetchWithCsrf(`/api/admin/menus-virtuales/${selectedId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre_es: editNombre }),
      });
      if (!res.ok) {
        setError(t('menuVirtualGuardarNombreError', language));
        return;
      }
      const updated = await res.json() as MenuVirtual;
      setNodos(prev => prev.map(n => n.id === selectedId ? { ...updated, productosCount: n.productosCount } : n));
    } finally {
      setSaving(false);
    }
  }

  function pedirEliminar(nodo: MenuVirtual) {
    setNodoAEliminar(nodo);
    setEliminarAbierto(true);
  }

  async function handleEliminar() {
    if (!nodoAEliminar) return;
    const id = nodoAEliminar.id;
    const res = await fetchWithCsrf(`/api/admin/menus-virtuales/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      setError(t('menuVirtualGuardarNombreError', language));
      return;
    }
    setNodos(prev => prev.filter(n => n.id !== id && n.padreId !== id));
    if (selectedId === id) setSelectedId(null);
    setEliminarAbierto(false);
    setNodoAEliminar(null);
  }

  function toggleProducto(productoId: string) {
    setSelectedProductoIds(prev =>
      prev.includes(productoId) ? prev.filter(id => id !== productoId) : [...prev, productoId]
    );
  }

  async function handleGuardarProductos() {
    if (!selectedId) return;
    setSavingProductos(true);
    setError('');
    try {
      const res = await fetchWithCsrf(`/api/admin/menus-virtuales/${selectedId}/productos`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productoIds: selectedProductoIds }),
      });
      if (!res.ok) {
        setError(t('menuVirtualGuardarProductosError', language));
        return;
      }
      setNodos(prev => prev.map(n => n.id === selectedId ? { ...n, productosCount: selectedProductoIds.length } : n));
    } finally {
      setSavingProductos(false);
    }
  }

  async function persistirOrden(reordenados: MenuVirtual[], original: MenuVirtual[]) {
    const cambiados = reordenados.filter(n => {
      const previo = original.find(o => o.id === n.id);
      return previo && previo.orden !== n.orden;
    });
    await Promise.all(cambiados.map(n =>
      fetchWithCsrf(`/api/admin/menus-virtuales/${n.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orden: n.orden }),
      })
    ));
  }

  function handleDragEndPadres(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const reordenados = reordenarPorArrastre(padres, String(active.id), String(over.id));
    if (reordenados === padres) return;
    setNodos(prev => prev.map(n => reordenados.find(r => r.id === n.id) ?? n));
    void persistirOrden(reordenados, padres);
  }

  function handleDragEndHijos(padreId: string, event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const hijos = hijosDe(padreId);
    const reordenados = reordenarPorArrastre(hijos, String(active.id), String(over.id));
    if (reordenados === hijos) return;
    setNodos(prev => prev.map(n => reordenados.find(r => r.id === n.id) ?? n));
    void persistirOrden(reordenados, hijos);
  }

  const productosFiltrados = useMemo(() => {
    const q = productoSearch.trim().toLowerCase();
    const activos = productos.filter(p => p.activo);
    if (!q) return activos;
    return activos.filter(p => p.titulo_es.toLowerCase().includes(q));
  }, [productos, productoSearch]);

  if (loading) {
    return <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="p-6 grid grid-cols-1 md:grid-cols-[320px_1fr] gap-6">
      <div className="space-y-2">
        <Button onClick={abrirDialogoNuevoMenu} className="w-full justify-start gap-2">
          <Plus className="w-4 h-4" /> {t('menuVirtualNuevoMenu', language)}
        </Button>
        {padres.length === 0 && (
          <p className="text-sm text-muted-foreground py-4">{t('menuVirtualSinNodos', language)}</p>
        )}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEndPadres}>
          <SortableContext items={padres.map(p => p.id)} strategy={verticalListSortingStrategy}>
            {padres.map(padre => {
              const hijos = hijosDe(padre.id);
              return (
                <div key={padre.id} className="space-y-1">
                  <SortableNodoRow
                    nodo={padre}
                    selected={selectedId === padre.id}
                    esHijo={false}
                    subcategoriasCount={hijos.length}
                    onSelect={() => handleSelect(padre)}
                  />
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={event => handleDragEndHijos(padre.id, event)}
                  >
                    <SortableContext items={hijos.map(h => h.id)} strategy={verticalListSortingStrategy}>
                      <div className="pl-4">
                        {hijos.map(hijo => (
                          <SortableNodoRow
                            key={hijo.id}
                            nodo={hijo}
                            selected={selectedId === hijo.id}
                            esHijo
                            subcategoriasCount={0}
                            onSelect={() => handleSelect(hijo)}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                  <button
                    type="button"
                    onClick={() => abrirDialogoNuevaSubcategoria(padre.id)}
                    className="w-full text-left pl-8 pr-3 py-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    + {t('menuVirtualNuevaSubcategoria', language)}
                  </button>
                </div>
              );
            })}
          </SortableContext>
        </DndContext>
      </div>

      {selectedNodo && (
        <div className="space-y-6 max-w-xl">
          {error && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-md text-sm">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              {selectedPadre ? `${selectedPadre.nombre} › ${selectedNodo.nombre}` : selectedNodo.nombre}
            </p>
            <div>
              <label htmlFor="menu-virtual-nombre" className="text-sm font-medium text-foreground">{t('menuVirtualNombre', language)}</label>
              <Input id="menu-virtual-nombre" value={editNombre} onChange={e => setEditNombre(e.target.value)} />
            </div>
            <div className="flex items-end gap-2">
              <Button onClick={handleGuardarNombre} disabled={saving} className="gap-2">
                <Save className="w-4 h-4" /> {t('menuVirtualGuardar', language)}
              </Button>
              <Button variant="outline" onClick={() => pedirEliminar(selectedNodo)} className="gap-2 text-destructive">
                <Trash2 className="w-4 h-4" /> {t('menuVirtualEliminar', language)}
              </Button>
            </div>
          </div>

          {selectedEsHoja && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-foreground">
                  {t('menuVirtualProductosAsociados', language)} ({selectedProductoIds.length})
                </h3>
                <Button size="sm" onClick={handleGuardarProductos} disabled={savingProductos} className="gap-2">
                  <Save className="w-4 h-4" /> {t('menuVirtualGuardar', language)}
                </Button>
              </div>
              <Input
                type="search"
                value={productoSearch}
                onChange={e => setProductoSearch(e.target.value)}
                placeholder={t('menuVirtualBuscarProducto', language)}
                aria-label={t('menuVirtualBuscarProducto', language)}
              />
              <div className="max-h-96 overflow-y-auto space-y-1 border border-border rounded-lg p-2">
                {productosFiltrados.map(producto => (
                  <label
                    key={producto.id}
                    className="flex items-center gap-2 cursor-pointer p-2 rounded-md hover:bg-muted/50"
                  >
                    <input
                      type="checkbox"
                      checked={selectedProductoIds.includes(producto.id)}
                      onChange={() => toggleProducto(producto.id)}
                      className="w-4 h-4 accent-primary shrink-0"
                    />
                    <span className="text-sm text-foreground truncate">{producto.titulo_es}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <NuevoMenuVirtualDialog
        open={dialogAbierto}
        esSubcategoria={padreParaNuevo !== null}
        saving={creando}
        onOpenChange={setDialogAbierto}
        onConfirm={handleCrear}
      />
      <EliminarMenuVirtualDialog
        open={eliminarAbierto}
        nodoNombre={nodoAEliminar?.nombre ?? null}
        onOpenChange={setEliminarAbierto}
        onConfirm={handleEliminar}
      />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `pnpm lint && pnpm typecheck`
Expected: sin errores. Si el linter marca S3776 en algún handler, extraer a función de módulo antes de continuar (no debería hacer falta — cada handler quedó corto).

- [ ] **Step 3: Commit**

```bash
git add "src/app/admin/(protected)/menus-virtuales/page.tsx"
git commit -m "feat(menus-virtuales): rediseño del árbol — jerarquía visual, dialogos y drag&drop"
```

---

### Task 8: Verificación manual en navegador

**Files:** ninguno (solo verificación)

- [ ] **Step 1: Levantar el dev server**

Run: `pnpm dev`

- [ ] **Step 2: Verificar en `/admin/menus-virtuales`**

- Crear un menú nuevo → se abre el diálogo, no aparece ningún nodo hasta confirmar con un nombre.
- Crear una subcategoría dentro de ese menú → mismo diálogo, título distinto, aparece anidada.
- Ver el badge de "(vacío)" en un nodo sin subcategorías ni productos.
- Asociar 2-3 productos a una hoja, guardar, volver a la lista → el badge de esa hoja muestra el conteo correcto tras recargar la página (confirma que el GET trae `productosCount`).
- Arrastrar dos menús raíz entre sí (usando el handle `⋮⋮`) → el orden visual cambia y persiste tras recargar la página.
- Arrastrar dos subcategorías del mismo padre entre sí → mismo resultado, sin afectar a otros padres.
- Eliminar un nodo → aparece el diálogo de confirmación (no un `confirm()` del navegador), cancelar no borra nada, confirmar sí.
- Forzar un error (cortar la red o parar el server a mitad de un guardado) → aparece el banner rojo inline, no un `alert()`.

- [ ] **Step 3: Si algo no coincide con lo esperado, corregir antes de continuar** (no hay placeholder aquí — es el gate real antes de dar la tarea por terminada).

---

### Task 9: Suite completa + build

**Files:** ninguno

- [ ] **Step 1: Suite completa**

Run: `pnpm vitest run`
Expected: todos los tests en verde, incluidos los 2 fixtures corregidos en la Task previa a este plan (`tests/compliance/menu-virtual-mapper.test.ts`, `tests/core/get-menu-use-case-no-duplicate-log.test.ts`) y los nuevos de este plan.

- [ ] **Step 2: Build**

Run: `pnpm build`
Expected: build exitoso (ignorar el warning de "Skipping validation of types", es esperado en este proyecto).

- [ ] **Step 3: Commit final si algo quedó sin commitear**

```bash
git status --short
```

Si hay cambios sueltos (p. ej. ajustes hechos durante la verificación manual), commitearlos con un mensaje descriptivo antes de cerrar.
