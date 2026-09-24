# Landing Page — Etapa 3: UI de admin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pantalla `/admin/landing` donde el admin del tenant edita las 6 secciones de la landing (activo, orden, contenido por tipo) contra la API ya construida en la Etapa 2. Sin cambios en el renderizado público todavía (Etapa 4).

**Architecture:** Una página cliente con 6 pestañas fijas (una por `LandingSeccionTipo`), un componente reutilizable `TranslatableField` para los campos traducibles (mismo patrón "mostrar/ocultar traducciones" que ya usa `product-form-dialog.tsx`), y un mapa de configuración estático `SECCION_CAMPOS` que describe qué campos renderizar por tipo — así un solo renderer genérico cubre los 6 formularios en vez de 6 componentes casi idénticos.

**Tech Stack:** Next.js App Router (Client Component), React, TypeScript, Vitest + Testing Library, Tailwind v4.

**Spec de referencia:** `docs/superpowers/specs/2026-09-24-landing-page-rearquitectura-rutas-design.md`, sección "5. UI" → "Admin del tenant".

---

## Contexto para quien ejecute esto

- Regla de oro del proyecto: tras cada tarea completada correr `pnpm lint && pnpm build`.
- Commits sin "Co-Authored-By" ni atribución de IA.
- La API de la Etapa 2 ya existe y está en producción: `GET /api/admin/landing-secciones` (lista todas las secciones existentes de la empresa) y `PUT /api/admin/landing-secciones/{tipo}` (upsert de una, body `{activo, orden, contenido}`). Un tenant nuevo puede no tener ninguna fila todavía — la pantalla debe arrancar con las 6 secciones en blanco/inactivas si la API no devuelve nada para algún tipo.
- **Precedente de testing de este codebase para pantallas admin de CRUD completo**: `src/app/admin/(protected)/menus-virtuales/page.tsx` (la pantalla más parecida a esta) **no tiene test propio** — solo sus diálogos hijos (`NuevoMenuVirtualDialog`, `EliminarMenuVirtualDialog`) tienen tests unitarios. La pantalla en sí se verifica con `pnpm build` + chequeo manual en el navegador. Este plan sigue la misma convención: el componente reutilizable `TranslatableField` (Task 1) tiene test real vía TDD; la página en sí (Task 3) no.
- `ImageUploader` (`@/components/ui/image-uploader`) resuelve el `empresaId` internamente — no hace falta pasarle `empresaIdProp` desde una pantalla admin normal (confirmado en el uso existente de `product-form-dialog.tsx`).

## File Structure

**Nuevos:**
- `src/components/admin/landing/translatable-field.tsx` — input traducible reutilizable (es siempre visible + toggle "mostrar/ocultar traducciones" para en/fr/it/de).
- `src/components/admin/landing/seccion-campos.ts` — mapa estático `SECCION_CAMPOS: Record<LandingSeccionTipo, CampoConfig[]>`, describe los campos de cada uno de los 6 tipos.
- `src/app/admin/(protected)/landing/page.tsx` — pantalla principal.
- `tests/ui/translatable-field.test.tsx` — tests del componente reutilizable.

**Modificados:**
- `src/lib/translations.ts` — 4 keys nuevas (`sidebarLanding`, `landingSeccionGuardar`, `landingSeccionGuardarError`, `landingSeccionAgregarImagen`) en `es` + `en`.
- `src/app/admin/(protected)/admin-sidebar.tsx` — nueva entrada de navegación.

---

### Task 1: `TranslatableField` — input traducible reutilizable

**Files:**
- Create: `src/components/admin/landing/translatable-field.tsx`
- Test: `tests/ui/translatable-field.test.tsx`

- [ ] **Step 1: Escribir el test que falla**

```tsx
// tests/ui/translatable-field.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LanguageProvider } from '@/lib/language-context';
import { TranslatableField } from '@/components/admin/landing/translatable-field';

describe('TranslatableField', () => {
  it('muestra el input en español siempre visible', () => {
    render(
      <LanguageProvider>
        <TranslatableField label="Título" value={{ es: 'Hola' }} onChange={() => {}} />
      </LanguageProvider>
    );
    expect(screen.getByDisplayValue('Hola')).toBeInTheDocument();
  });

  it('no muestra los otros idiomas hasta hacer click en el toggle', () => {
    render(
      <LanguageProvider>
        <TranslatableField label="Título" value={{ es: 'Hola', en: 'Hello' }} onChange={() => {}} />
      </LanguageProvider>
    );
    expect(screen.queryByDisplayValue('Hello')).not.toBeInTheDocument();
  });

  it('muestra los otros idiomas al hacer click en el toggle', () => {
    render(
      <LanguageProvider>
        <TranslatableField label="Título" value={{ es: 'Hola', en: 'Hello' }} onChange={() => {}} />
      </LanguageProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: /Traducciones/ }));
    expect(screen.getByDisplayValue('Hello')).toBeInTheDocument();
  });

  it('llama a onChange con el campo es actualizado, preservando el resto', () => {
    const onChange = vi.fn();
    render(
      <LanguageProvider>
        <TranslatableField label="Título" value={{ es: 'Hola', en: 'Hello' }} onChange={onChange} />
      </LanguageProvider>
    );
    fireEvent.change(screen.getByDisplayValue('Hola'), { target: { value: 'Hola mundo' } });
    expect(onChange).toHaveBeenCalledWith({ es: 'Hola mundo', en: 'Hello' });
  });

  it('llama a onChange con el campo en actualizado, preservando es', () => {
    const onChange = vi.fn();
    render(
      <LanguageProvider>
        <TranslatableField label="Título" value={{ es: 'Hola' }} onChange={onChange} />
      </LanguageProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: /Traducciones/ }));
    fireEvent.change(screen.getByLabelText('English'), { target: { value: 'Hello' } });
    expect(onChange).toHaveBeenCalledWith({ es: 'Hola', en: 'Hello' });
  });

  it('renderiza textarea cuando multiline es true', () => {
    render(
      <LanguageProvider>
        <TranslatableField label="Descripción" value={{ es: 'Texto largo' }} onChange={() => {}} multiline />
      </LanguageProvider>
    );
    expect(screen.getByDisplayValue('Texto largo').tagName).toBe('TEXTAREA');
  });

  it('funciona con value undefined (sección todavía sin contenido)', () => {
    render(
      <LanguageProvider>
        <TranslatableField label="Título" value={undefined} onChange={() => {}} />
      </LanguageProvider>
    );
    expect(screen.getByLabelText('Título')).toHaveValue('');
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `pnpm vitest run tests/ui/translatable-field.test.tsx --project ui`
Expected: FAIL — `Cannot find module '@/components/admin/landing/translatable-field'`

- [ ] **Step 3: Implementación**

```tsx
// src/components/admin/landing/translatable-field.tsx
"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Languages } from "lucide-react";
import { useLanguage } from "@/lib/language-context";
import { t } from "@/lib/translations";

export interface TranslatableTextValue {
  es?: string | null;
  en?: string | null;
  fr?: string | null;
  it?: string | null;
  de?: string | null;
}

type LangKey = "es" | "en" | "fr" | "it" | "de";

interface TranslatableFieldProps {
  label: string;
  value: TranslatableTextValue | undefined;
  onChange: (next: TranslatableTextValue) => void;
  multiline?: boolean;
  maxLength?: number;
}

const OTHER_LANGS: { key: Exclude<LangKey, "es">; label: string }[] = [
  { key: "en", label: "English" },
  { key: "fr", label: "Français" },
  { key: "it", label: "Italiano" },
  { key: "de", label: "Deutsch" },
];

const FIELD_CLASSNAME = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

function renderLangInput(
  id: string,
  currentValue: string,
  multiline: boolean,
  maxLength: number | undefined,
  onInput: (text: string) => void
) {
  if (multiline) {
    return (
      <textarea
        id={id}
        value={currentValue}
        maxLength={maxLength}
        rows={3}
        onChange={(e) => onInput(e.target.value)}
        className={FIELD_CLASSNAME}
      />
    );
  }
  return (
    <input
      id={id}
      type="text"
      value={currentValue}
      maxLength={maxLength}
      onChange={(e) => onInput(e.target.value)}
      className={FIELD_CLASSNAME}
    />
  );
}

export function TranslatableField({ label, value, onChange, multiline = false, maxLength }: Readonly<TranslatableFieldProps>) {
  const { language } = useLanguage();
  const [showTranslations, setShowTranslations] = useState(false);

  function setLang(lang: LangKey, text: string) {
    onChange({ ...value, [lang]: text });
  }

  const esId = `${label}-es`;

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-foreground" htmlFor={esId}>
        {label}
      </label>
      {renderLangInput(esId, value?.es ?? "", multiline, maxLength, (text) => setLang("es", text))}
      <button
        type="button"
        onClick={() => setShowTranslations((v) => !v)}
        className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-primary"
      >
        {showTranslations ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        <Languages className="h-3.5 w-3.5" />
        {t("translationsToggle", language)} ({showTranslations ? t("hideLabel", language) : t("showLabel", language)})
      </button>
      {showTranslations && (
        <div className="grid grid-cols-1 gap-3 border-l-2 border-border pl-4 sm:grid-cols-2">
          {OTHER_LANGS.map(({ key, label: langLabel }) => {
            const fieldId = `${label}-${key}`;
            return (
              <div key={key}>
                <label className="mb-1 block text-xs text-muted-foreground" htmlFor={fieldId}>
                  {langLabel}
                </label>
                {renderLangInput(fieldId, value?.[key] ?? "", multiline, maxLength, (text) => setLang(key, text))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `pnpm vitest run tests/ui/translatable-field.test.tsx --project ui`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/landing/translatable-field.tsx tests/ui/translatable-field.test.tsx
git commit -m "feat(landing): agregar TranslatableField para el admin de secciones"
```

---

### Task 2: Traducciones nuevas

**Files:**
- Modify: `src/lib/translations.ts`

- [ ] **Step 1: Agregar las keys al bloque `es`**

Buscá `sidebarSettings:` dentro del bloque `es: { ... }` y agregá, justo después:

```ts
    sidebarLanding: "Landing",
    landingSeccionGuardar: "Guardar sección",
    landingSeccionGuardarError: "No se pudo guardar la sección",
    landingSeccionAgregarImagen: "Agregar imagen",
```

- [ ] **Step 2: Agregar las keys al bloque `en`**

Buscá `sidebarSettings:` dentro del bloque `en: { ... }` (el SEGUNDO bloque de idioma del archivo) y agregá, justo después:

```ts
    sidebarLanding: "Landing",
    landingSeccionGuardar: "Save section",
    landingSeccionGuardarError: "Could not save the section",
    landingSeccionAgregarImagen: "Add image",
```

- [ ] **Step 3: Verificar tipos**

Run: `pnpm typecheck`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/lib/translations.ts
git commit -m "feat(landing): agregar traducciones del admin de secciones"
```

---

### Task 3: Configuración de campos por tipo + pantalla principal

**Files:**
- Create: `src/components/admin/landing/seccion-campos.ts`
- Create: `src/app/admin/(protected)/landing/page.tsx`

No hay test dedicado para este task — sigue el precedente de `menus-virtuales/page.tsx` (ver nota en "Contexto"). Se verifica con `pnpm build` + chequeo manual en `pnpm dev`.

- [ ] **Step 1: Crear `seccion-campos.ts`**

```ts
// src/components/admin/landing/seccion-campos.ts
import type { LandingSeccionTipo } from "@/core/domain/entities/types";

export type CampoConfig =
  | { key: string; kind: "texto"; label: string; multiline?: boolean }
  | { key: string; kind: "imagen"; label: string }
  | { key: string; kind: "url"; label: string }
  | { key: "imagenes"; kind: "galeria"; label: string };

export const SECCION_CAMPOS: Record<LandingSeccionTipo, CampoConfig[]> = {
  hero: [
    { key: "kicker", kind: "texto", label: "Kicker" },
    { key: "titulo", kind: "texto", label: "Título" },
    { key: "descripcion", kind: "texto", label: "Descripción", multiline: true },
    { key: "imagenUrl", kind: "imagen", label: "Imagen de fondo" },
    { key: "ctaSecundariaTexto", kind: "texto", label: "Texto del botón secundario" },
    { key: "ctaSecundariaUrl", kind: "url", label: "URL del botón secundario" },
    { key: "horario", kind: "texto", label: "Horario" },
  ],
  nosotros: [
    { key: "kicker", kind: "texto", label: "Kicker" },
    { key: "titulo", kind: "texto", label: "Título" },
    { key: "descripcion", kind: "texto", label: "Descripción", multiline: true },
    { key: "imagenUrl", kind: "imagen", label: "Imagen" },
  ],
  cta_carta: [
    { key: "kicker", kind: "texto", label: "Kicker" },
    { key: "titulo", kind: "texto", label: "Título" },
    { key: "descripcion", kind: "texto", label: "Descripción", multiline: true },
    { key: "ctaSecundariaTexto", kind: "texto", label: "Texto del botón secundario" },
    { key: "ctaSecundariaUrl", kind: "url", label: "URL del botón secundario" },
  ],
  testimonio: [
    { key: "texto", kind: "texto", label: "Cita", multiline: true },
    { key: "autor", kind: "texto", label: "Autor / atribución" },
  ],
  galeria: [
    { key: "titulo", kind: "texto", label: "Título" },
    { key: "imagenes", kind: "galeria", label: "Imágenes" },
  ],
  visitanos: [
    { key: "kicker", kind: "texto", label: "Kicker" },
    { key: "titulo", kind: "texto", label: "Título" },
    { key: "horario", kind: "texto", label: "Horario" },
  ],
};
```

Este mapa debe corresponder EXACTAMENTE, campo por campo, a los schemas Zod de `src/core/application/dtos/landing-seccion.dto.ts` (Etapa 2) — antes de continuar, abrí ese archivo y confirmá que cada `key` de acá existe en el schema del mismo tipo, y que no falta ninguno. Los campos `direccion`/`telefono`/`urlMapa` de `visitanos` NO van acá a propósito — se muestran de solo lectura desde `empresa` (Etapa 4, no esta).

- [ ] **Step 2: Crear la pantalla principal**

```tsx
// src/app/admin/(protected)/landing/page.tsx
"use client";

import { useState, useEffect } from "react";
import { Save, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ImageUploader } from "@/components/ui/image-uploader";
import { fetchWithCsrf } from "@/lib/csrf-client";
import { useLanguage } from "@/lib/language-context";
import { t } from "@/lib/translations";
import { TranslatableField, type TranslatableTextValue } from "@/components/admin/landing/translatable-field";
import { SECCION_CAMPOS, type CampoConfig } from "@/components/admin/landing/seccion-campos";
import { LANDING_SECCION_TIPOS, type LandingSeccionTipo } from "@/core/domain/entities/types";

interface LandingSeccionApi {
  id: string;
  empresaId: string;
  tipo: LandingSeccionTipo;
  activo: boolean;
  orden: number;
  contenido: Record<string, unknown>;
}

interface SeccionState {
  activo: boolean;
  orden: number;
  contenido: Record<string, unknown>;
}

const TIPO_LABELS: Record<LandingSeccionTipo, string> = {
  hero: "Hero",
  nosotros: "Nosotros",
  cta_carta: "Carta",
  testimonio: "Testimonio",
  galeria: "Galería",
  visitanos: "Visítanos",
};

function seccionVacia(): SeccionState {
  return { activo: false, orden: 0, contenido: {} };
}

function seccionesIniciales(): Record<LandingSeccionTipo, SeccionState> {
  const init = {} as Record<LandingSeccionTipo, SeccionState>;
  for (const tipo of LANDING_SECCION_TIPOS) init[tipo] = seccionVacia();
  return init;
}

export default function LandingAdminPage() {
  const { language } = useLanguage();
  const [secciones, setSecciones] = useState<Record<LandingSeccionTipo, SeccionState>>(seccionesIniciales);
  const [loading, setLoading] = useState(true);
  const [tipoActivo, setTipoActivo] = useState<LandingSeccionTipo>("hero");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void fetch("/api/admin/landing-secciones")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: LandingSeccionApi[]) => {
        setSecciones((prev) => {
          const next = { ...prev };
          for (const seccion of data) {
            next[seccion.tipo] = { activo: seccion.activo, orden: seccion.orden, contenido: seccion.contenido };
          }
          return next;
        });
      })
      .finally(() => setLoading(false));
  }, []);

  const seccionActual = secciones[tipoActivo];
  const campos = SECCION_CAMPOS[tipoActivo];

  function actualizarCampo(key: string, value: unknown) {
    setSecciones((prev) => ({
      ...prev,
      [tipoActivo]: {
        ...prev[tipoActivo],
        contenido: { ...prev[tipoActivo].contenido, [key]: value },
      },
    }));
  }

  function actualizarActivo(activo: boolean) {
    setSecciones((prev) => ({ ...prev, [tipoActivo]: { ...prev[tipoActivo], activo } }));
  }

  function actualizarOrden(orden: number) {
    setSecciones((prev) => ({ ...prev, [tipoActivo]: { ...prev[tipoActivo], orden } }));
  }

  async function handleGuardar() {
    setSaving(true);
    setError("");
    try {
      const res = await fetchWithCsrf(`/api/admin/landing-secciones/${tipoActivo}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(seccionActual),
      });
      if (!res.ok) {
        setError(t("landingSeccionGuardarError", language));
        return;
      }
      const updated = (await res.json()) as LandingSeccionApi;
      setSecciones((prev) => ({
        ...prev,
        [tipoActivo]: { activo: updated.activo, orden: updated.orden, contenido: updated.contenido },
      }));
    } finally {
      setSaving(false);
    }
  }

  function renderCampo(campo: CampoConfig) {
    const valor = seccionActual.contenido[campo.key];

    if (campo.kind === "texto") {
      return (
        <TranslatableField
          key={campo.key}
          label={campo.label}
          value={valor as TranslatableTextValue | undefined}
          onChange={(next) => actualizarCampo(campo.key, next)}
          multiline={campo.multiline}
        />
      );
    }

    if (campo.kind === "imagen") {
      return (
        <div key={campo.key} className="space-y-2">
          <span className="block text-sm font-medium text-foreground">{campo.label}</span>
          <ImageUploader
            value={(valor as string | null | undefined) ?? ""}
            onChange={(url) => actualizarCampo(campo.key, url)}
            label={campo.label}
          />
        </div>
      );
    }

    if (campo.kind === "url") {
      const fieldId = `campo-${campo.key}`;
      return (
        <div key={campo.key} className="space-y-2">
          <label className="block text-sm font-medium text-foreground" htmlFor={fieldId}>
            {campo.label}
          </label>
          <Input
            id={fieldId}
            type="text"
            value={(valor as string | null | undefined) ?? ""}
            onChange={(e) => actualizarCampo(campo.key, e.target.value)}
          />
        </div>
      );
    }

    const imagenes = (valor as string[] | undefined) ?? [];
    return (
      <div key={campo.key} className="space-y-2">
        <span className="block text-sm font-medium text-foreground">{campo.label}</span>
        <div className="space-y-3">
          {imagenes.map((url, idx) => (
            <div key={idx} className="flex items-start gap-2">
              <ImageUploader
                value={url}
                onChange={(nuevaUrl) => {
                  const next = [...imagenes];
                  next[idx] = nuevaUrl;
                  actualizarCampo("imagenes", next);
                }}
                label={`${campo.label} ${idx + 1}`}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => actualizarCampo("imagenes", imagenes.filter((_, i) => i !== idx))}
              >
                {t("remove", language)}
              </Button>
            </div>
          ))}
          {imagenes.length < 20 && (
            <Button variant="outline" size="sm" onClick={() => actualizarCampo("imagenes", [...imagenes, ""])}>
              + {t("landingSeccionAgregarImagen", language)}
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6 p-6">
      <div className="flex flex-wrap gap-2 border-b border-border pb-3">
        {LANDING_SECCION_TIPOS.map((tipo) => (
          <button
            key={tipo}
            type="button"
            onClick={() => setTipoActivo(tipo)}
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${
              tipoActivo === tipo ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/50"
            }`}
          >
            {TIPO_LABELS[tipo]}
            {secciones[tipo].activo && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex items-center gap-6">
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={seccionActual.activo}
            onChange={(e) => actualizarActivo(e.target.checked)}
            className="h-4 w-4 rounded border-border text-primary accent-primary"
          />
          <span className="text-sm text-foreground">{t("active", language)}</span>
        </label>
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground" htmlFor="landing-seccion-orden">
            {t("orderLabel", language)}
          </label>
          <Input
            id="landing-seccion-orden"
            type="number"
            min={0}
            max={100}
            value={seccionActual.orden}
            onChange={(e) => actualizarOrden(Number.parseInt(e.target.value, 10) || 0)}
            className="w-20"
          />
        </div>
      </div>

      <div className="space-y-6">{campos.map(renderCampo)}</div>

      <Button onClick={handleGuardar} disabled={saving} className="gap-2">
        <Save className="h-4 w-4" /> {t("landingSeccionGuardar", language)}
      </Button>
    </div>
  );
}
```

- [ ] **Step 3: Verificar lint y build**

Run: `pnpm lint && pnpm build`
Expected: sin errores. Confirmá que `/admin/landing` aparece en la tabla de rutas del build.

- [ ] **Step 4: Chequeo manual con el servidor de desarrollo (si tu entorno lo permite)**

Si tenés acceso a navegador: `pnpm dev`, entrar como admin de un tenant de prueba, ir a `/admin/landing`, cambiar entre las 6 pestañas, tocar un campo de texto, activar el checkbox "Activo", click en "Guardar sección", refrescar la página y confirmar que el valor persistió. Si no tenés navegador disponible en este entorno, decilo explícitamente como limitación en tu reporte — la verificación obligatoria es `pnpm build`.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/landing/seccion-campos.ts "src/app/admin/(protected)/landing/page.tsx"
git commit -m "feat(landing): agregar pantalla de admin para secciones de landing"
```

---

### Task 4: Entrada de navegación en el sidebar

**Files:**
- Modify: `src/app/admin/(protected)/admin-sidebar.tsx`

## Context

Las tasks anteriores (1-3) ya crearon `TranslatableField`, las traducciones necesarias, y la pantalla `/admin/landing` en sí — esta task solo la conecta al menú de navegación para que sea alcanzable desde la UI, sin la cual la pantalla existiría pero nadie podría llegar a ella con un click. `src/app/admin/(protected)/admin-sidebar.tsx` tiene un array `NAV_ENTRIES` data-driven (mezcla de `{type: 'item', ...}` y `{type: 'group', ...}`) que ya lista todas las secciones existentes del admin (Catálogo, Pedidos, Clientes, Mesas, Stock, Compras, Analítica, Configuración, etc.) — no toques nada de esa estructura salvo agregar la línea nueva en el lugar indicado.

- [ ] **Step 1: Agregar la entrada**

En el array `NAV_ENTRIES`, agregá una entrada de tipo `item` justo ANTES de la entrada de `sidebarSettings` (Configuración, la última del array):

```ts
  { type: 'item', def: { href: '/admin/landing', labelKey: 'sidebarLanding', icon: LayoutTemplate } },
  { type: 'item', def: { href: '/admin/configuracion', labelKey: 'sidebarSettings', icon: Settings } },
```

(reemplaza la línea existente de `sidebarSettings` agregando la línea de `sidebarLanding` inmediatamente antes — no dupliques la de `sidebarSettings`).

Vas a necesitar importar el ícono `LayoutTemplate` desde `lucide-react` — agregalo al import existente de `lucide-react` al principio del archivo (buscá el import que ya trae `LayoutDashboard`, `Settings`, etc. y sumá `LayoutTemplate` a esa misma línea, no crees un import nuevo).

- [ ] **Step 2: Verificar lint y build**

Run: `pnpm lint && pnpm build`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add "src/app/admin/(protected)/admin-sidebar.tsx"
git commit -m "feat(landing): agregar Landing al menu del admin"
```

---

### Task 5: Verificación final

**Files:** ninguno nuevo — corrida completa de la suite.

- [ ] **Step 1: Suite completa**

Run: `pnpm test`
Expected: PASS — incluye los 7 tests nuevos de `translatable-field.test.tsx` más el resto de la suite (724 + 7 = 731), nada roto.

- [ ] **Step 2: Lint + build final**

Run: `pnpm lint && pnpm build`
Expected: sin errores. Confirmá que `/admin/landing` aparece en la tabla de rutas.

- [ ] **Step 3: Reporte**

Confirmar en el chat con el usuario:
- Qué quedó armado: pantalla `/admin/landing` alcanzable desde el sidebar, con las 6 secciones editables contra la API real de la Etapa 2 (ya en producción).
- Que la landing pública (`/`) **todavía no lee esta tabla** — sigue mostrando el shell estático de la Etapa 1 hasta la Etapa 4. O sea: un admin puede cargar contenido en `/admin/landing` y guardarlo con éxito, pero no lo va a ver reflejado en `/` todavía.
- Que el checklist manual del Task 3 (navegador) se hizo o no, y por qué.

---

## Fuera de alcance de esta etapa

- Renderizado público data-driven de las secciones (Etapa 4) — la landing pública sigue usando el shell estático.
- Switches rápidos en superadmin (Etapa 5).
- Reordenamiento drag-and-drop del campo `orden` (queda como input numérico simple, ya documentado como decisión en el spec).
- Campos de solo lectura de `visitanos` (dirección/teléfono/mapa desde `empresa`) — se muestran recién cuando exista el renderizado público que los consume.
