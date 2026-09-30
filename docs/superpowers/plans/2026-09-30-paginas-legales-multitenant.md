# Páginas legales multi-tenant — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cinco páginas legales públicas (`/aviso-legal`, `/privacidad`, `/condiciones`, `/envios-y-pagos`, `/devoluciones`) generadas por tenant a partir de datos de `empresas` + una tabla nueva `empresa_legal`, editable desde `/admin/legal`, con suelos legales validados.

**Architecture:** Plantilla en código (componentes `*Contenido` puros que reciben un `LegalContext` ya resuelto) + campos estructurados por tenant. Toda decisión de "¿aplica?" vive en funciones puras de `src/lib/legal/`, compartidas por páginas, footer y sitemap. Capa `Repo → EmpresaLegalUseCase → API/páginas` con `Result<T, AppError>`.

**Tech Stack:** Next.js (App Router, server components), Supabase (Postgres + RLS), Zod v4, Vitest (proyectos `unit` node y `ui` jsdom), Testing Library, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-09-30-paginas-legales-multitenant-design.md`

## Reglas del repo que aplican a TODAS las tareas

- Props de componentes: `Readonly<Props>` (S6759). Sin ternarios anidados (S3358). Condiciones en positivo (S7735). Complejidad cognitiva ≤ 15.
- Nunca `any`. Nunca `dangerouslySetInnerHTML` en esta feature.
- Texto de UI de admin/footer vía `t()`; bloque `es` en **castellano de España con tuteo** (nunca voseo). Las páginas legales públicas son solo castellano (texto literal en el componente, también con tuteo/usted — usar "usted" como la `/privacidad` actual).
- Colores solo con tokens (`text-foreground`, `border-foreground/10`, `text-muted-foreground`…). Titulares públicos: Playfair 400 romana (`font-serif font-normal`), sin cursiva.
- Tras cada tarea: `pnpm vitest run <tests de la tarea>` y `pnpm lint`. El hook de pre-commit typecheckea TODO el repo: si una tarea deja tipos rotos, agrupar con la siguiente en el mismo commit; **nunca `--no-verify`**.
- Commits: conventional commits en castellano, sin líneas de atribución a IA.
- **Trampa conocida:** `modalidades_entrega.tiempo_min_minutos/tiempo_max_minutos` guardan **HORAS** pese al nombre (ver `formatRangoHorasModalidad` en `src/lib/modalidad-entrega-iconos.ts`). Reutilizar ese formateador, no convertir minutos.

## Mapa de ficheros

| Fichero | Responsabilidad |
|---|---|
| `src/core/domain/legal/constantes.ts` | Suelos legales, supuestos art. 103, defaults |
| `src/core/domain/entities/empresa-legal.ts` | Tipos `EmpresaLegal`, `GarantiaFila`, `ExclusionesDesistimiento`, `LegalContext` |
| `src/core/domain/repositories/IEmpresaLegalRepository.ts` | Interfaz repo + `DatosEmpresaLegal` |
| `src/core/application/dtos/empresa-legal.dto.ts` | Zod con suelos (escritura y lectura de JSONB) |
| `src/core/application/use-cases/empresa-legal.use-case.ts` | `get`, `update`, `getContext` |
| `src/core/infrastructure/database/SupabaseEmpresaLegalRepository.ts` | Lectura/upsert + datos de empresa |
| `src/core/infrastructure/database/index.ts` | Factory `getEmpresaLegalUseCase` |
| `supabase/migrations/20260930000001_empresa_legal.sql` | Tabla + RLS + GRANTs |
| `src/lib/legal/paginas-legales.ts` | Qué páginas aplican |
| `src/lib/legal/subencargados.ts` | Subencargados según flags |
| `src/lib/legal/categorias-datos.ts` | Datos personales tratados según flags |
| `src/lib/legal/garantias.ts` | Normalización + formato de garantías |
| `src/lib/legal/cargar-contexto.ts` | Server helper dominio → `LegalContext` o `notFound()` |
| `src/app/api/admin/legal/route.ts` | GET/PUT admin |
| `src/components/legal/legal-layout.tsx` | `LegalPage`, `Section`, `InfoTable`, `TextoAdicional` |
| `src/components/legal/*-contenido.tsx` | Contenido puro de cada página |
| `src/app/{aviso-legal,condiciones,envios-y-pagos,devoluciones}/page.tsx` | Wrappers server |
| `src/app/privacidad/page.tsx` | Se reescribe como wrapper |
| `src/components/site-footer.tsx` | Columna "Legal" |
| `src/app/sitemap.ts`, `src/app/robots.ts`, `src/lib/seo/llms-txt.ts` | SEO |
| `src/app/admin/(protected)/legal/page.tsx` | Página admin |
| `src/components/admin/legal/LegalSettingsForm.tsx` | Formulario por pestañas |
| `src/components/admin/legal/GarantiasEditor.tsx` | Editor de filas de garantía |
| `src/app/admin/(protected)/admin-sidebar.tsx` | Entrada de menú |
| `src/lib/translations.ts` | Claves nuevas |
| `docs/context/paginas-legales.md`, `CLAUDE.md` | Documentación |

---

### Task 1: Dominio — constantes y tipos

**Files:**
- Create: `src/core/domain/legal/constantes.ts`
- Create: `src/core/domain/entities/empresa-legal.ts`

Sin test propio: son tipos y constantes; los cubren los tests de las tareas 2–5.

- [ ] **Step 1: Crear constantes**

```ts
// src/core/domain/legal/constantes.ts
/**
 * Suelos legales de las páginas de venta (TRLGDCU, RDL 1/2007 tras RDL 7/2021).
 * Todo valor configurable por el tenant se valida contra estos mínimos: un
 * tenant puede AMPLIAR derechos del consumidor, nunca recortarlos.
 */
export const MIN_DESISTIMIENTO_DIAS = 14; // art. 104
export const MAX_DESISTIMIENTO_DIAS = 365;
export const GARANTIA_NUEVO_MESES = 36; // art. 120 — bienes nuevos
export const MIN_SEGUNDA_MANO_MESES = 12; // art. 120.1 — pactable, nunca < 1 año
export const PLAZO_REEMBOLSO_DIAS = 14; // art. 107

/** Supuestos de exclusión del derecho de desistimiento aplicables a bienes (art. 103 TRLGDCU). */
export const SUPUESTOS_ART_103 = [
  { codigo: 'precio_mercado_financiero', letra: 'b', etiqueta: 'Bienes cuyo precio dependa de fluctuaciones del mercado financiero' },
  { codigo: 'personalizados', letra: 'c', etiqueta: 'Bienes confeccionados según las especificaciones del consumidor o claramente personalizados' },
  { codigo: 'perecederos', letra: 'd', etiqueta: 'Bienes que puedan deteriorarse o caducar con rapidez' },
  { codigo: 'precintados_higiene', letra: 'e', etiqueta: 'Bienes precintados no aptos para devolución por razones de salud o higiene que hayan sido desprecintados' },
  { codigo: 'mezclados', letra: 'f', etiqueta: 'Bienes que tras la entrega se hayan mezclado de forma indisociable con otros' },
  { codigo: 'bebidas_alcoholicas', letra: 'g', etiqueta: 'Bebidas alcohólicas cuyo precio se acordó al contratar y se entregan pasados 30 días' },
  { codigo: 'soporte_precintado', letra: 'i', etiqueta: 'Grabaciones de audio o vídeo o programas informáticos precintados que hayan sido desprecintados' },
  { codigo: 'prensa', letra: 'j', etiqueta: 'Prensa diaria, publicaciones periódicas o revistas (salvo suscripciones)' },
  { codigo: 'contenido_digital', letra: 'm', etiqueta: 'Contenido digital sin soporte material cuya ejecución haya comenzado con consentimiento del consumidor' },
] as const;

export type CodigoArt103 = (typeof SUPUESTOS_ART_103)[number]['codigo'];

export const CODIGOS_ART_103 = SUPUESTOS_ART_103.map((s) => s.codigo) as [CodigoArt103, ...CodigoArt103[]];

export function etiquetaArt103(codigo: CodigoArt103): string {
  const s = SUPUESTOS_ART_103.find((x) => x.codigo === codigo);
  return s ? `${s.etiqueta} (art. 103.${s.letra})` : codigo;
}
```

- [ ] **Step 2: Crear tipos**

```ts
// src/core/domain/entities/empresa-legal.ts
import type { CodigoArt103 } from '@/core/domain/legal/constantes';
import { MIN_DESISTIMIENTO_DIAS } from '@/core/domain/legal/constantes';

export type EstadoProducto = 'nuevo' | 'segunda_mano';
export type GastosDevolucion = 'cliente' | 'empresa';

/** Se guarda tal cual (camelCase) dentro del JSONB `empresa_legal.garantias`. */
export interface GarantiaFila {
  ambito: string;
  estado: EstadoProducto;
  mesesLegales: number;
  mesesComercialesExtra: number;
}

export interface ExclusionesDesistimiento {
  supuestos: CodigoArt103[];
  otras: string | null;
}

export interface EmpresaLegal {
  registroMercantil: string | null;
  emailLegal: string | null;
  direccionDevoluciones: string | null;
  plazoDesistimientoDias: number;
  gastosDevolucion: GastosDevolucion;
  plazoPreparacionDias: number | null;
  plazoAvisoDanosHoras: number | null;
  garantias: GarantiaFila[];
  exclusionesDesistimiento: ExclusionesDesistimiento;
  adicionalAvisoLegal: string | null;
  adicionalCondiciones: string | null;
  adicionalEnvios: string | null;
  adicionalDevoluciones: string | null;
}

/** Lo que tiene un tenant que no ha rellenado nada: las páginas funcionan igual. */
export const EMPRESA_LEGAL_POR_DEFECTO: EmpresaLegal = {
  registroMercantil: null,
  emailLegal: null,
  direccionDevoluciones: null,
  plazoDesistimientoDias: MIN_DESISTIMIENTO_DIAS,
  gastosDevolucion: 'cliente',
  plazoPreparacionDias: null,
  plazoAvisoDanosHoras: null,
  garantias: [],
  exclusionesDesistimiento: { supuestos: [], otras: null },
  adicionalAvisoLegal: null,
  adicionalCondiciones: null,
  adicionalEnvios: null,
  adicionalDevoluciones: null,
};

export interface FlagsLegales {
  deliveryHabilitado: boolean;
  envioDomicilioHabilitado: boolean;
  descuentoBienvenidaActivo: boolean;
  pagoTarjetaActivo: boolean;
}

export interface ModalidadDomicilioLegal {
  nombre: string;
  precioCents: number;
  /** HORAS, pese al nombre de la columna (ver plan). */
  tiempoMin: number | null;
  tiempoMax: number | null;
}

/** Todo lo que necesita una página legal, con los fallbacks YA aplicados. */
export interface LegalContext {
  empresaId: string;
  tipo: 'tienda' | 'restaurante' | null;
  moneda: string;
  tipoImpuesto: 'iva' | 'igic';
  titular: {
    nombre: string;
    nif: string | null;
    direccion: string | null;
    email: string | null;
    telefono: string | null;
    registroMercantil: string | null;
  };
  flags: FlagsLegales;
  direccionDevoluciones: string | null;
  legal: EmpresaLegal;
  modalidadesDomicilio: ModalidadDomicilioLegal[];
}
```

- [ ] **Step 3: Lint + typecheck**

Run: `pnpm lint && pnpm typecheck`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/core/domain/legal/constantes.ts src/core/domain/entities/empresa-legal.ts
git commit -m "feat(legal): tipos de dominio y suelos legales de páginas de venta"
```

---

### Task 2: DTO Zod con suelos legales

**Files:**
- Create: `src/core/application/dtos/empresa-legal.dto.ts`
- Test: `tests/compliance/legal-empresa-legal-dto.test.ts`

- [ ] **Step 1: Test que falla**

```ts
// tests/compliance/legal-empresa-legal-dto.test.ts
import { describe, it, expect } from 'vitest';
import {
  updateEmpresaLegalSchema,
  parseGarantiasGuardadas,
  parseExclusionesGuardadas,
} from '@/core/application/dtos/empresa-legal.dto';

const valido = {
  registroMercantil: 'RM Tenerife, tomo 2690, folio 193',
  emailLegal: '',
  direccionDevoluciones: '',
  plazoDesistimientoDias: 14,
  gastosDevolucion: 'cliente',
  plazoPreparacionDias: 2,
  plazoAvisoDanosHoras: 24,
  garantias: [{ ambito: 'Todos los productos', estado: 'nuevo', mesesLegales: 36, mesesComercialesExtra: 0 }],
  exclusionesDesistimiento: { supuestos: ['personalizados'], otras: '' },
  adicionalAvisoLegal: '',
  adicionalCondiciones: '',
  adicionalEnvios: '',
  adicionalDevoluciones: '',
};

describe('updateEmpresaLegalSchema — suelos legales', () => {
  it('acepta el caso válido y convierte strings vacíos en null', () => {
    const r = updateEmpresaLegalSchema.safeParse(valido);
    expect(r.success).toBe(true);
    expect(r.data?.emailLegal).toBeNull();
    expect(r.data?.exclusionesDesistimiento.otras).toBeNull();
  });

  it('rechaza 13 días de desistimiento y acepta 14 exactos', () => {
    expect(updateEmpresaLegalSchema.safeParse({ ...valido, plazoDesistimientoDias: 13 }).success).toBe(false);
    expect(updateEmpresaLegalSchema.safeParse({ ...valido, plazoDesistimientoDias: 14 }).success).toBe(true);
  });

  it('rechaza garantía de producto nuevo distinta de 36 meses', () => {
    const r = updateEmpresaLegalSchema.safeParse({
      ...valido,
      garantias: [{ ambito: 'Baterías', estado: 'nuevo', mesesLegales: 24, mesesComercialesExtra: 0 }],
    });
    expect(r.success).toBe(false);
  });

  it('rechaza segunda mano con 11 meses y acepta 12', () => {
    const fila = { ambito: 'Reacondicionados', estado: 'segunda_mano', mesesComercialesExtra: 0 };
    expect(updateEmpresaLegalSchema.safeParse({ ...valido, garantias: [{ ...fila, mesesLegales: 11 }] }).success).toBe(false);
    expect(updateEmpresaLegalSchema.safeParse({ ...valido, garantias: [{ ...fila, mesesLegales: 12 }] }).success).toBe(true);
  });

  it('rechaza un supuesto de exclusión que no está en el art. 103', () => {
    const r = updateEmpresaLegalSchema.safeParse({
      ...valido,
      exclusionesDesistimiento: { supuestos: ['lo_que_yo_diga'], otras: null },
    });
    expect(r.success).toBe(false);
  });

  it('rechaza textos adicionales de más de 2000 caracteres', () => {
    expect(updateEmpresaLegalSchema.safeParse({ ...valido, adicionalCondiciones: 'x'.repeat(2001) }).success).toBe(false);
  });

  it('rechaza un email legal mal formado', () => {
    expect(updateEmpresaLegalSchema.safeParse({ ...valido, emailLegal: 'no-es-email' }).success).toBe(false);
  });

  it('descarta claves desconocidas (no se puede colar empresaId)', () => {
    const r = updateEmpresaLegalSchema.safeParse({ ...valido, empresaId: 'otra' });
    expect(r.success).toBe(true);
    expect(r.data).not.toHaveProperty('empresaId');
  });
});

describe('lectura defensiva del JSONB guardado', () => {
  it('JSONB corrupto de garantías → lista vacía', () => {
    expect(parseGarantiasGuardadas('basura')).toEqual([]);
    expect(parseGarantiasGuardadas([{ ambito: 1 }])).toEqual([]);
  });

  it('JSONB corrupto de exclusiones → sin exclusiones', () => {
    expect(parseExclusionesGuardadas(null)).toEqual({ supuestos: [], otras: null });
  });

  it('JSONB válido se devuelve tal cual', () => {
    const g = [{ ambito: 'Todo', estado: 'nuevo', mesesLegales: 36, mesesComercialesExtra: 12 }];
    expect(parseGarantiasGuardadas(g)).toEqual(g);
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `pnpm vitest run tests/compliance/legal-empresa-legal-dto.test.ts`
Expected: FAIL — no se resuelve `@/core/application/dtos/empresa-legal.dto`.

- [ ] **Step 3: Implementar**

```ts
// src/core/application/dtos/empresa-legal.dto.ts
import { z } from 'zod';
import {
  CODIGOS_ART_103,
  GARANTIA_NUEVO_MESES,
  MAX_DESISTIMIENTO_DIAS,
  MIN_DESISTIMIENTO_DIAS,
  MIN_SEGUNDA_MANO_MESES,
} from '@/core/domain/legal/constantes';
import type { ExclusionesDesistimiento, GarantiaFila } from '@/core/domain/entities/empresa-legal';

/** String opcional: '' y espacios → null. */
function textoOpcional(max: number) {
  return z.string().trim().max(max).nullable().transform((v) => (v ? v : null));
}

const emailOpcional = z
  .union([z.literal(''), z.email().max(200)])
  .nullable()
  .transform((v) => (v ? v : null));

export const garantiaFilaSchema = z
  .object({
    ambito: z.string().trim().min(1, 'Indica a qué productos aplica').max(120),
    estado: z.enum(['nuevo', 'segunda_mano']),
    mesesLegales: z.number().int().min(MIN_SEGUNDA_MANO_MESES, 'La garantía mínima de segunda mano es de 1 año').max(120),
    mesesComercialesExtra: z.number().int().min(0).max(240),
  })
  .refine((f) => f.estado === 'segunda_mano' || f.mesesLegales === GARANTIA_NUEVO_MESES, {
    message: 'La garantía legal de un producto nuevo es de 3 años',
    path: ['mesesLegales'],
  });

export const garantiasSchema = z.array(garantiaFilaSchema).max(20);

export const exclusionesSchema = z.object({
  supuestos: z.array(z.enum(CODIGOS_ART_103)).max(CODIGOS_ART_103.length),
  otras: textoOpcional(500),
});

export const updateEmpresaLegalSchema = z.object({
  registroMercantil: textoOpcional(300),
  emailLegal: emailOpcional,
  direccionDevoluciones: textoOpcional(300),
  plazoDesistimientoDias: z
    .number()
    .int()
    .min(MIN_DESISTIMIENTO_DIAS, 'El plazo de desistimiento no puede ser inferior a 14 días')
    .max(MAX_DESISTIMIENTO_DIAS),
  gastosDevolucion: z.enum(['cliente', 'empresa']),
  plazoPreparacionDias: z.number().int().min(0).max(60).nullable(),
  plazoAvisoDanosHoras: z.number().int().min(1).max(720).nullable(),
  garantias: garantiasSchema,
  exclusionesDesistimiento: exclusionesSchema,
  adicionalAvisoLegal: textoOpcional(2000),
  adicionalCondiciones: textoOpcional(2000),
  adicionalEnvios: textoOpcional(2000),
  adicionalDevoluciones: textoOpcional(2000),
});

export type UpdateEmpresaLegalDTO = z.infer<typeof updateEmpresaLegalSchema>;

/** Lectura defensiva: un JSONB corrupto NO rompe la página pública, cae al default. */
export function parseGarantiasGuardadas(raw: unknown): GarantiaFila[] {
  const r = garantiasSchema.safeParse(raw);
  return r.success ? r.data : [];
}

export function parseExclusionesGuardadas(raw: unknown): ExclusionesDesistimiento {
  const r = exclusionesSchema.safeParse(raw);
  return r.success ? r.data : { supuestos: [], otras: null };
}
```

- [ ] **Step 4: Verificar que pasa**

Run: `pnpm vitest run tests/compliance/legal-empresa-legal-dto.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/application/dtos/empresa-legal.dto.ts tests/compliance/legal-empresa-legal-dto.test.ts
git commit -m "feat(legal): DTO de datos legales con suelos del TRLGDCU"
```

---

### Task 3: Garantías visibles

**Files:**
- Create: `src/lib/legal/garantias.ts`
- Test: `tests/compliance/legal-garantias.test.ts`

- [ ] **Step 1: Test que falla**

```ts
// tests/compliance/legal-garantias.test.ts
import { describe, it, expect } from 'vitest';
import { garantiasVisibles, formatMeses } from '@/lib/legal/garantias';

describe('garantiasVisibles', () => {
  it('lista vacía → fila por defecto de 3 años para todos los productos', () => {
    expect(garantiasVisibles([])).toEqual([
      { ambito: 'Todos los productos', estado: 'nuevo', mesesLegales: 36, mesesComercialesExtra: 0 },
    ]);
  });

  it('fuerza 36 meses en producto nuevo aunque el dato guardado diga otra cosa', () => {
    const [f] = garantiasVisibles([{ ambito: 'Baterías', estado: 'nuevo', mesesLegales: 24, mesesComercialesExtra: 12 }]);
    expect(f.mesesLegales).toBe(36);
    expect(f.mesesComercialesExtra).toBe(12);
  });

  it('sube a 12 meses una segunda mano guardada por debajo del suelo', () => {
    const [f] = garantiasVisibles([{ ambito: 'Usados', estado: 'segunda_mano', mesesLegales: 6, mesesComercialesExtra: 0 }]);
    expect(f.mesesLegales).toBe(12);
  });

  it('respeta segunda mano por encima del suelo', () => {
    const [f] = garantiasVisibles([{ ambito: 'Usados', estado: 'segunda_mano', mesesLegales: 18, mesesComercialesExtra: 0 }]);
    expect(f.mesesLegales).toBe(18);
  });
});

describe('formatMeses', () => {
  it.each([
    [36, '3 años'],
    [12, '1 año'],
    [18, '18 meses'],
    [1, '1 mes'],
    [0, '—'],
  ])('%i → %s', (meses, esperado) => {
    expect(formatMeses(meses)).toBe(esperado);
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `pnpm vitest run tests/compliance/legal-garantias.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar**

```ts
// src/lib/legal/garantias.ts
import { GARANTIA_NUEVO_MESES, MIN_SEGUNDA_MANO_MESES } from '@/core/domain/legal/constantes';
import type { GarantiaFila } from '@/core/domain/entities/empresa-legal';

const FILA_POR_DEFECTO: GarantiaFila = {
  ambito: 'Todos los productos',
  estado: 'nuevo',
  mesesLegales: GARANTIA_NUEVO_MESES,
  mesesComercialesExtra: 0,
};

function normalizar(fila: GarantiaFila): GarantiaFila {
  if (fila.estado === 'nuevo') return { ...fila, mesesLegales: GARANTIA_NUEVO_MESES };
  return { ...fila, mesesLegales: Math.max(fila.mesesLegales, MIN_SEGUNDA_MANO_MESES) };
}

/**
 * Filas que pinta la página de devoluciones. Normaliza de nuevo aunque el DTO
 * ya valide: una fila escrita antes de un cambio de ley o a mano en la BD no
 * debe llegar nunca al consumidor por debajo del mínimo legal.
 */
export function garantiasVisibles(filas: readonly GarantiaFila[]): GarantiaFila[] {
  if (filas.length === 0) return [FILA_POR_DEFECTO];
  return filas.map(normalizar);
}

export function formatMeses(meses: number): string {
  if (meses <= 0) return '—';
  if (meses % 12 === 0) {
    const anios = meses / 12;
    return anios === 1 ? '1 año' : `${anios} años`;
  }
  return meses === 1 ? '1 mes' : `${meses} meses`;
}
```

- [ ] **Step 4: Verificar que pasa**

Run: `pnpm vitest run tests/compliance/legal-garantias.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/legal/garantias.ts tests/compliance/legal-garantias.test.ts
git commit -m "feat(legal): normalización de garantías con suelo legal"
```

---

### Task 4: Qué páginas aplican a cada tenant

**Files:**
- Create: `src/lib/legal/paginas-legales.ts`
- Modify: `src/lib/translations.ts` (claves de etiqueta del footer, 5 idiomas)
- Test: `tests/compliance/legal-paginas-legales.test.ts`

- [ ] **Step 1: Test que falla**

```ts
// tests/compliance/legal-paginas-legales.test.ts
import { describe, it, expect } from 'vitest';
import { aplicaPagina, paginasLegalesDe, type FlagsPaginas } from '@/lib/legal/paginas-legales';

const restaurante: FlagsPaginas = { tipo: 'restaurante', deliveryHabilitado: false, envioDomicilioHabilitado: false };
const tienda: FlagsPaginas = { tipo: 'tienda', deliveryHabilitado: false, envioDomicilioHabilitado: false };

const slugs = (f: FlagsPaginas) => paginasLegalesDe(f).map((p) => p.slug);

describe('paginasLegalesDe', () => {
  it('restaurante sin reparto: aviso legal, privacidad y condiciones', () => {
    expect(slugs(restaurante)).toEqual(['aviso-legal', 'privacidad', 'condiciones']);
  });

  it('restaurante con Glovo: NO gana envíos ni devoluciones (perecederos, art. 103.d)', () => {
    expect(slugs({ ...restaurante, deliveryHabilitado: true })).toEqual(['aviso-legal', 'privacidad', 'condiciones']);
  });

  it('restaurante con envioDomicilio a true por error: sigue sin envíos', () => {
    expect(slugs({ ...restaurante, envioDomicilioHabilitado: true })).not.toContain('envios-y-pagos');
  });

  it('tienda sin envío: devoluciones sí, envíos no', () => {
    expect(slugs(tienda)).toEqual(['aviso-legal', 'privacidad', 'condiciones', 'devoluciones']);
  });

  it('tienda con envío: las cinco, en orden', () => {
    expect(slugs({ ...tienda, envioDomicilioHabilitado: true })).toEqual([
      'aviso-legal', 'privacidad', 'condiciones', 'envios-y-pagos', 'devoluciones',
    ]);
  });

  it('tipo null (empresa mal configurada): solo las obligatorias', () => {
    expect(slugs({ ...tienda, tipo: null })).toEqual(['aviso-legal', 'privacidad', 'condiciones']);
  });

  it('cada página expone su href', () => {
    expect(paginasLegalesDe(tienda).every((p) => p.href === `/${p.slug}`)).toBe(true);
  });
});

describe('aplicaPagina', () => {
  it('coincide con paginasLegalesDe', () => {
    expect(aplicaPagina(restaurante, 'devoluciones')).toBe(false);
    expect(aplicaPagina(tienda, 'devoluciones')).toBe(true);
    expect(aplicaPagina(restaurante, 'aviso-legal')).toBe(true);
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `pnpm vitest run tests/compliance/legal-paginas-legales.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Añadir claves de traducción**

En `src/lib/translations.ts`, junto a `footerPrivacy` de cada bloque, añadir:

| Clave | es | en | fr | it | de |
|---|---|---|---|---|---|
| `footerLegalTitle` | `Legal` | `Legal` | `Mentions légales` | `Note legali` | `Rechtliches` |
| `footerLegalNotice` | `Aviso legal` | `Legal notice` | `Mentions légales` | `Note legali` | `Impressum` |
| `footerTerms` | `Condiciones de compra` | `Terms of purchase` | `Conditions d'achat` | `Condizioni di acquisto` | `Kaufbedingungen` |
| `footerShipping` | `Envíos y pagos` | `Shipping and payment` | `Livraison et paiement` | `Spedizioni e pagamenti` | `Versand und Zahlung` |
| `footerReturns` | `Devoluciones y garantía` | `Returns and warranty` | `Retours et garantie` | `Resi e garanzia` | `Rückgabe und Garantie` |

(Ejemplo en el bloque `es`: `footerLegalTitle: "Legal",` justo debajo de `footerPrivacy: "Política de privacidad",`.)

- [ ] **Step 4: Implementar**

```ts
// src/lib/legal/paginas-legales.ts
import type { t } from '@/lib/translations';

export type SlugLegal = 'aviso-legal' | 'privacidad' | 'condiciones' | 'envios-y-pagos' | 'devoluciones';

type ClaveTraduccion = Parameters<typeof t>[0];

export interface PaginaLegal {
  readonly slug: SlugLegal;
  readonly href: `/${SlugLegal}`;
  readonly labelKey: ClaveTraduccion;
}

/** Subconjunto de EmpresaPublic: el footer (cliente) y el servidor lo tienen. */
export interface FlagsPaginas {
  readonly tipo: string | null;
  readonly deliveryHabilitado: boolean;
  readonly envioDomicilioHabilitado: boolean;
}

interface Regla {
  readonly slug: SlugLegal;
  readonly labelKey: ClaveTraduccion;
  readonly aplica: (f: FlagsPaginas) => boolean;
}

const siempre = () => true;
const esTienda = (f: FlagsPaginas) => f.tipo === 'tienda';

/**
 * El ORDEN de esta tabla es el orden del footer y del sitemap.
 * Restaurante nunca tiene envíos/devoluciones: vende perecederos (art. 103.d
 * TRLGDCU) y su reparto (Glovo) se explica dentro de /condiciones.
 */
const REGLAS: readonly Regla[] = [
  { slug: 'aviso-legal', labelKey: 'footerLegalNotice', aplica: siempre },
  { slug: 'privacidad', labelKey: 'footerPrivacy', aplica: siempre },
  { slug: 'condiciones', labelKey: 'footerTerms', aplica: siempre },
  { slug: 'envios-y-pagos', labelKey: 'footerShipping', aplica: (f) => esTienda(f) && f.envioDomicilioHabilitado },
  { slug: 'devoluciones', labelKey: 'footerReturns', aplica: esTienda },
];

export function paginasLegalesDe(flags: FlagsPaginas): PaginaLegal[] {
  return REGLAS.filter((r) => r.aplica(flags)).map((r) => ({ slug: r.slug, href: `/${r.slug}` as const, labelKey: r.labelKey }));
}

export function aplicaPagina(flags: FlagsPaginas, slug: SlugLegal): boolean {
  return REGLAS.some((r) => r.slug === slug && r.aplica(flags));
}
```

- [ ] **Step 5: Verificar que pasa**

Run: `pnpm vitest run tests/compliance/legal-paginas-legales.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/legal/paginas-legales.ts src/lib/translations.ts tests/compliance/legal-paginas-legales.test.ts
git commit -m "feat(legal): reglas de qué páginas legales aplican a cada tenant"
```

---

### Task 5: Subencargados y categorías de datos

**Files:**
- Create: `src/lib/legal/subencargados.ts`
- Create: `src/lib/legal/categorias-datos.ts`
- Test: `tests/compliance/legal-subencargados.test.ts`

- [ ] **Step 1: Test que falla**

```ts
// tests/compliance/legal-subencargados.test.ts
import { describe, it, expect } from 'vitest';
import { subencargadosDe } from '@/lib/legal/subencargados';
import { categoriasDatosDe } from '@/lib/legal/categorias-datos';
import type { FlagsLegales } from '@/core/domain/entities/empresa-legal';

const nada: FlagsLegales = {
  deliveryHabilitado: false,
  envioDomicilioHabilitado: false,
  descuentoBienvenidaActivo: false,
  pagoTarjetaActivo: false,
};

const proveedores = (f: FlagsLegales) => subencargadosDe(f).map((s) => s.proveedor);

describe('subencargadosDe', () => {
  it('sin nada activo: Supabase, Vercel, Brevo y Sentry', () => {
    expect(proveedores(nada)).toEqual(['Supabase (Irlanda)', 'Vercel Inc.', 'Brevo (Francia)', 'Sentry (EE.UU.)']);
  });

  it('Redsys solo con pago con tarjeta', () => {
    expect(proveedores(nada)).not.toContain('Redsys (España)');
    expect(proveedores({ ...nada, pagoTarjetaActivo: true })).toContain('Redsys (España)');
  });

  it('Glovo solo con reparto de restaurante', () => {
    expect(proveedores(nada)).not.toContain('Glovo App S.L. (España)');
    expect(proveedores({ ...nada, deliveryHabilitado: true })).toContain('Glovo App S.L. (España)');
  });

  it('Brevo: finalidad mínima es la confirmación de pedidos', () => {
    const brevo = subencargadosDe(nada).find((s) => s.proveedor.startsWith('Brevo'));
    expect(brevo?.finalidad).toBe('Envío de emails de confirmación de pedidos');
  });

  it('Brevo: añade seguimiento de envíos y promociones según flags', () => {
    const brevo = subencargadosDe({ ...nada, envioDomicilioHabilitado: true, descuentoBienvenidaActivo: true })
      .find((s) => s.proveedor.startsWith('Brevo'));
    expect(brevo?.finalidad).toBe('Envío de emails de confirmación de pedidos, seguimiento de envíos y promociones');
  });

  it('Brevo: dos finalidades se unen con "y"', () => {
    const brevo = subencargadosDe({ ...nada, descuentoBienvenidaActivo: true }).find((s) => s.proveedor.startsWith('Brevo'));
    expect(brevo?.finalidad).toBe('Envío de emails de confirmación de pedidos y promociones');
  });
});

describe('categoriasDatosDe', () => {
  const titulos = (f: FlagsLegales) => categoriasDatosDe(f).map((c) => c.titulo);

  it('sin entrega a domicilio no declara dirección', () => {
    expect(titulos(nada)).not.toContain('Datos de dirección');
  });

  it('con reparto o con envío declara la dirección', () => {
    expect(titulos({ ...nada, deliveryHabilitado: true })).toContain('Datos de dirección');
    expect(titulos({ ...nada, envioDomicilioHabilitado: true })).toContain('Datos de dirección');
  });

  it('siempre declara identificativos, contacto y económicos', () => {
    expect(titulos(nada)).toEqual(['Datos identificativos', 'Datos de contacto', 'Datos económicos']);
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `pnpm vitest run tests/compliance/legal-subencargados.test.ts`
Expected: FAIL — módulos inexistentes.

- [ ] **Step 3: Implementar `subencargados.ts`**

```ts
// src/lib/legal/subencargados.ts
import type { FlagsLegales } from '@/core/domain/entities/empresa-legal';

export interface Subencargado {
  readonly proveedor: string;
  readonly finalidad: string;
  readonly pais: string;
}

/** "a" · "a y b" · "a, b y c" */
function listaEnCastellano(partes: readonly string[]): string {
  if (partes.length <= 1) return partes.join('');
  return `${partes.slice(0, -1).join(', ')} y ${partes.at(-1)}`;
}

/**
 * Brevo lo usa la plataforma para TODOS los tenants (confirmación de pedido),
 * y además para el email de seguimiento de envío (tienda) y el del descuento
 * de bienvenida. Ver enviar-confirmacion-pedido.use-case.ts,
 * api/admin/pedidos/[pedidoId]/seguimiento/route.ts y descuento.use-case.ts.
 */
function finalidadBrevo(f: FlagsLegales): string {
  const partes = ['confirmación de pedidos'];
  if (f.envioDomicilioHabilitado) partes.push('seguimiento de envíos');
  if (f.descuentoBienvenidaActivo) partes.push('promociones');
  return `Envío de emails de ${listaEnCastellano(partes)}`;
}

export function subencargadosDe(f: FlagsLegales): Subencargado[] {
  const lista: Subencargado[] = [
    { proveedor: 'Supabase (Irlanda)', finalidad: 'Base de datos y almacenamiento', pais: 'UE' },
    { proveedor: 'Vercel Inc.', finalidad: 'Infraestructura de hosting', pais: 'UE/EE.UU. (SCCs)' },
    { proveedor: 'Brevo (Francia)', finalidad: finalidadBrevo(f), pais: 'UE' },
  ];
  if (f.pagoTarjetaActivo) {
    lista.push({ proveedor: 'Redsys (España)', finalidad: 'Procesamiento de pagos con tarjeta', pais: 'UE' });
  }
  if (f.deliveryHabilitado) {
    lista.push({ proveedor: 'Glovo App S.L. (España)', finalidad: 'Reparto a domicilio de pedidos', pais: 'UE' });
  }
  lista.push({ proveedor: 'Sentry (EE.UU.)', finalidad: 'Monitorización de errores técnicos', pais: 'EE.UU. (SCCs)' });
  return lista;
}
```

- [ ] **Step 4: Implementar `categorias-datos.ts`**

```ts
// src/lib/legal/categorias-datos.ts
import type { FlagsLegales } from '@/core/domain/entities/empresa-legal';

export interface CategoriaDatos {
  readonly titulo: string;
  readonly descripcion: string;
}

export function categoriasDatosDe(f: FlagsLegales): CategoriaDatos[] {
  const lista: CategoriaDatos[] = [
    { titulo: 'Datos identificativos', descripcion: 'nombre y apellidos.' },
    { titulo: 'Datos de contacto', descripcion: 'teléfono y correo electrónico.' },
  ];
  if (f.deliveryHabilitado || f.envioDomicilioHabilitado) {
    lista.push({ titulo: 'Datos de dirección', descripcion: 'dirección de entrega, solo para pedidos con entrega a domicilio.' });
  }
  lista.push({ titulo: 'Datos económicos', descripcion: 'importe del pedido. No se almacenan datos de tarjeta de crédito.' });
  return lista;
}
```

- [ ] **Step 5: Verificar que pasa**

Run: `pnpm vitest run tests/compliance/legal-subencargados.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/legal/subencargados.ts src/lib/legal/categorias-datos.ts tests/compliance/legal-subencargados.test.ts
git commit -m "feat(legal): subencargados y categorías de datos según funciones activas"
```

---

### Task 6: Migración `empresa_legal`

**Files:**
- Create: `supabase/migrations/20260930000001_empresa_legal.sql`

- [ ] **Step 1: Escribir la migración**

```sql
-- Datos legales por tenant para las páginas /aviso-legal, /condiciones,
-- /envios-y-pagos y /devoluciones. 1:1 con empresas. Sin fila = defaults
-- (las páginas funcionan aunque el admin no haya rellenado nada).
-- Los CHECK replican los suelos del TRLGDCU que también valida Zod: la BD es
-- la última barrera si alguien escribe fuera de la API.

CREATE TABLE public.empresa_legal (
  empresa_id UUID PRIMARY KEY REFERENCES public.empresas(id) ON DELETE CASCADE,
  registro_mercantil TEXT CHECK (char_length(registro_mercantil) <= 300),
  email_legal TEXT CHECK (char_length(email_legal) <= 200),
  direccion_devoluciones TEXT CHECK (char_length(direccion_devoluciones) <= 300),
  plazo_desistimiento_dias INT NOT NULL DEFAULT 14 CHECK (plazo_desistimiento_dias BETWEEN 14 AND 365),
  gastos_devolucion TEXT NOT NULL DEFAULT 'cliente' CHECK (gastos_devolucion IN ('cliente', 'empresa')),
  plazo_preparacion_dias INT CHECK (plazo_preparacion_dias BETWEEN 0 AND 60),
  plazo_aviso_danos_horas INT CHECK (plazo_aviso_danos_horas BETWEEN 1 AND 720),
  garantias JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(garantias) = 'array'),
  exclusiones_desistimiento JSONB NOT NULL DEFAULT '{"supuestos":[],"otras":null}'::jsonb
    CHECK (jsonb_typeof(exclusiones_desistimiento) = 'object'),
  adicional_aviso_legal TEXT CHECK (char_length(adicional_aviso_legal) <= 2000),
  adicional_condiciones TEXT CHECK (char_length(adicional_condiciones) <= 2000),
  adicional_envios TEXT CHECK (char_length(adicional_envios) <= 2000),
  adicional_devoluciones TEXT CHECK (char_length(adicional_devoluciones) <= 2000),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.empresa_legal ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No direct anon access to empresa_legal"
  ON public.empresa_legal AS RESTRICTIVE FOR ALL TO anon
  USING (false) WITH CHECK (false);

CREATE POLICY "Admin ve empresa_legal"
  ON public.empresa_legal FOR SELECT TO authenticated
  USING (empresa_id = (SELECT get_mi_empresa_id()));

CREATE POLICY "Admin inserta empresa_legal"
  ON public.empresa_legal FOR INSERT TO authenticated
  WITH CHECK (empresa_id = (SELECT get_mi_empresa_id()));

CREATE POLICY "Admin actualiza empresa_legal"
  ON public.empresa_legal FOR UPDATE TO authenticated
  USING (empresa_id = (SELECT get_mi_empresa_id()))
  WITH CHECK (empresa_id = (SELECT get_mi_empresa_id()));

CREATE POLICY "Admin borra empresa_legal"
  ON public.empresa_legal FOR DELETE TO authenticated
  USING (empresa_id = (SELECT get_mi_empresa_id()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.empresa_legal TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.empresa_legal TO authenticated;
```

- [ ] **Step 2: Aplicar (única vía permitida)**

Run: `supabase db push --linked`
Expected: aplica `20260930000001_empresa_legal.sql` sin errores.

⚠️ El proyecto linkeado es PRODUCCIÓN (tenants reales). Pedir confirmación explícita al usuario antes de este paso.

- [ ] **Step 3: Smoke obligatorio**

Run: `supabase migration list` (fila `20260930000001` con Local == Remote) y `pnpm db:smoke`
Expected: ambos OK.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260930000001_empresa_legal.sql
git commit -m "feat(legal): tabla empresa_legal con RLS y suelos legales en BD"
```

---

### Task 7: Repositorio + factory

**Files:**
- Create: `src/core/domain/repositories/IEmpresaLegalRepository.ts`
- Create: `src/core/infrastructure/database/SupabaseEmpresaLegalRepository.ts`
- Modify: `src/core/infrastructure/database/index.ts` (imports + factory tras `getModalidadEntregaUseCase`, ~línea 158)

Se compromete junto con la Task 8 (el factory importa el use case). Sin test propio: es I/O contra Supabase; la lógica que importa (lectura defensiva del JSONB) ya está probada en la Task 2.

- [ ] **Step 1: Interfaz**

```ts
// src/core/domain/repositories/IEmpresaLegalRepository.ts
import type { Result } from '@/core/domain/entities/types';
import type { EmpresaLegal } from '@/core/domain/entities/empresa-legal';

/** Lo que las páginas legales necesitan de `empresas`. Nunca incluye secretos. */
export interface DatosEmpresaLegal {
  nombre: string;
  razonSocial: string | null;
  nif: string | null;
  direccion: string | null;
  telefono: string | null;
  emailNotification: string | null;
  tipo: 'tienda' | 'restaurante' | null;
  moneda: string;
  tipoImpuesto: 'iva' | 'igic';
  deliveryHabilitado: boolean;
  envioDomicilioHabilitado: boolean;
  descuentoBienvenidaActivo: boolean;
  /** Derivado de `redsys_merchant_code IS NOT NULL`; el código nunca sale del repo. */
  pagoTarjetaActivo: boolean;
}

export interface IEmpresaLegalRepository {
  findByEmpresa(empresaId: string): Promise<Result<EmpresaLegal | null>>;
  upsert(empresaId: string, data: EmpresaLegal): Promise<Result<EmpresaLegal>>;
  findDatosEmpresa(empresaId: string): Promise<Result<DatosEmpresaLegal | null>>;
}
```

- [ ] **Step 2: Implementación Supabase**

```ts
// src/core/infrastructure/database/SupabaseEmpresaLegalRepository.ts
import { SupabaseClient } from '@supabase/supabase-js';
import type { DatosEmpresaLegal, IEmpresaLegalRepository } from '@/core/domain/repositories/IEmpresaLegalRepository';
import type { EmpresaLegal } from '@/core/domain/entities/empresa-legal';
import type { Result } from '@/core/domain/entities/types';
import { parseExclusionesGuardadas, parseGarantiasGuardadas } from '@/core/application/dtos/empresa-legal.dto';
import { logger } from '../logging/logger';

const COLUMNAS_EMPRESA =
  'nombre, razon_social, nif, direccion, telefono_whatsapp, email_notification, tipo, moneda, tipo_impuesto, delivery_habilitado, envio_domicilio_habilitado, descuento_bienvenida_activo, redsys_merchant_code';

const ES_TRANSITORIO = /timeout|gateway/i;

function mapLegal(row: Record<string, unknown>): EmpresaLegal {
  return {
    registroMercantil: (row.registro_mercantil as string | null) ?? null,
    emailLegal: (row.email_legal as string | null) ?? null,
    direccionDevoluciones: (row.direccion_devoluciones as string | null) ?? null,
    plazoDesistimientoDias: row.plazo_desistimiento_dias as number,
    gastosDevolucion: row.gastos_devolucion === 'empresa' ? 'empresa' : 'cliente',
    plazoPreparacionDias: (row.plazo_preparacion_dias as number | null) ?? null,
    plazoAvisoDanosHoras: (row.plazo_aviso_danos_horas as number | null) ?? null,
    garantias: parseGarantiasGuardadas(row.garantias),
    exclusionesDesistimiento: parseExclusionesGuardadas(row.exclusiones_desistimiento),
    adicionalAvisoLegal: (row.adicional_aviso_legal as string | null) ?? null,
    adicionalCondiciones: (row.adicional_condiciones as string | null) ?? null,
    adicionalEnvios: (row.adicional_envios as string | null) ?? null,
    adicionalDevoluciones: (row.adicional_devoluciones as string | null) ?? null,
  };
}

function toRow(empresaId: string, d: EmpresaLegal): Record<string, unknown> {
  return {
    empresa_id: empresaId,
    registro_mercantil: d.registroMercantil,
    email_legal: d.emailLegal,
    direccion_devoluciones: d.direccionDevoluciones,
    plazo_desistimiento_dias: d.plazoDesistimientoDias,
    gastos_devolucion: d.gastosDevolucion,
    plazo_preparacion_dias: d.plazoPreparacionDias,
    plazo_aviso_danos_horas: d.plazoAvisoDanosHoras,
    garantias: d.garantias,
    exclusiones_desistimiento: d.exclusionesDesistimiento,
    adicional_aviso_legal: d.adicionalAvisoLegal,
    adicional_condiciones: d.adicionalCondiciones,
    adicional_envios: d.adicionalEnvios,
    adicional_devoluciones: d.adicionalDevoluciones,
    updated_at: new Date().toISOString(),
  };
}

function mapDatosEmpresa(row: Record<string, unknown>): DatosEmpresaLegal {
  const tipo = row.tipo === 'tienda' || row.tipo === 'restaurante' ? row.tipo : null;
  return {
    nombre: row.nombre as string,
    razonSocial: (row.razon_social as string | null) ?? null,
    nif: (row.nif as string | null) ?? null,
    direccion: (row.direccion as string | null) ?? null,
    telefono: (row.telefono_whatsapp as string | null) ?? null,
    emailNotification: (row.email_notification as string | null) ?? null,
    tipo,
    moneda: (row.moneda as string | null) ?? 'EUR',
    tipoImpuesto: row.tipo_impuesto === 'igic' ? 'igic' : 'iva',
    deliveryHabilitado: Boolean(row.delivery_habilitado),
    envioDomicilioHabilitado: Boolean(row.envio_domicilio_habilitado),
    descuentoBienvenidaActivo: Boolean(row.descuento_bienvenida_activo),
    pagoTarjetaActivo: Boolean(row.redsys_merchant_code),
  };
}

function errorDb(method: string, message: string): Result<never> {
  return { success: false, error: { code: 'DB_ERROR', message, module: 'repository', method } };
}

export class SupabaseEmpresaLegalRepository implements IEmpresaLegalRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  private async selectLegal(empresaId: string) {
    return this.supabase.from('empresa_legal').select('*').eq('empresa_id', empresaId).maybeSingle();
  }

  async findByEmpresa(empresaId: string): Promise<Result<EmpresaLegal | null>> {
    const method = 'SupabaseEmpresaLegalRepository.findByEmpresa';
    try {
      // SELECT puro: seguro de reintentar una vez ante el ruido de PostgREST.
      let { data, error } = await this.selectLegal(empresaId);
      if (error && ES_TRANSITORIO.test(error.message)) ({ data, error } = await this.selectLegal(empresaId));
      if (error) {
        await logger.logAndReturnError('DB_SELECT_ERROR', error.message, 'repository', method, { empresaId, details: { code: error.code } });
        return errorDb(method, 'Error al obtener los datos legales');
      }
      return { success: true, data: data ? mapLegal(data) : null };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'repository', method, { empresaId }) };
    }
  }

  async upsert(empresaId: string, d: EmpresaLegal): Promise<Result<EmpresaLegal>> {
    const method = 'SupabaseEmpresaLegalRepository.upsert';
    try {
      const { data, error } = await this.supabase
        .from('empresa_legal')
        .upsert(toRow(empresaId, d), { onConflict: 'empresa_id' })
        .select('*')
        .single();
      if (error) {
        await logger.logAndReturnError('DB_UPDATE_ERROR', error.message, 'repository', method, { empresaId, details: { code: error.code } });
        return errorDb(method, 'Error al guardar los datos legales');
      }
      return { success: true, data: mapLegal(data) };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'repository', method, { empresaId }) };
    }
  }

  async findDatosEmpresa(empresaId: string): Promise<Result<DatosEmpresaLegal | null>> {
    const method = 'SupabaseEmpresaLegalRepository.findDatosEmpresa';
    try {
      const { data, error } = await this.supabase.from('empresas').select(COLUMNAS_EMPRESA).eq('id', empresaId).maybeSingle();
      if (error) {
        await logger.logAndReturnError('DB_SELECT_ERROR', error.message, 'repository', method, { empresaId, details: { code: error.code } });
        return errorDb(method, 'Error al obtener la empresa');
      }
      return { success: true, data: data ? mapDatosEmpresa(data as Record<string, unknown>) : null };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'repository', method, { empresaId }) };
    }
  }
}
```

Nota: si `logger.logAndReturnError` no acepta el código `'DB_UPDATE_ERROR'`, usar el que use `SupabaseModalidadEntregaRepository.update` (mirar ese fichero y copiarlo).

- [ ] **Step 3: Factory en `index.ts`**

Añadir junto a los imports de modalidades:

```ts
import { SupabaseEmpresaLegalRepository } from './SupabaseEmpresaLegalRepository';
import { EmpresaLegalUseCase } from '@/core/application/use-cases/empresa-legal.use-case';
```

Y tras `getModalidadEntregaUseCase()`:

```ts
let _empresaLegalUseCase: EmpresaLegalUseCase | undefined;
export function getEmpresaLegalUseCase(): EmpresaLegalUseCase {
  // service_role: la lectura pública de páginas legales va por servidor
  // (anon está denegado por RLS), igual que modalidades_entrega.
  _empresaLegalUseCase ??= new EmpresaLegalUseCase(
    new SupabaseEmpresaLegalRepository(getSupabaseClient()),
    new SupabaseModalidadEntregaRepository(getSupabaseClient())
  );
  return _empresaLegalUseCase;
}
```

(Commit en la Task 8.)

---

### Task 8: Use case (`get`, `update`, `getContext`)

**Files:**
- Create: `src/core/application/use-cases/empresa-legal.use-case.ts`
- Test: `tests/core/legal/get-legal-context.test.ts`

- [ ] **Step 1: Test que falla**

```ts
// tests/core/legal/get-legal-context.test.ts
import { describe, it, expect, vi } from 'vitest';
import { EmpresaLegalUseCase } from '@/core/application/use-cases/empresa-legal.use-case';
import type { IEmpresaLegalRepository, DatosEmpresaLegal } from '@/core/domain/repositories/IEmpresaLegalRepository';
import type { IModalidadEntregaRepository } from '@/core/domain/repositories/IModalidadEntregaRepository';
import { EMPRESA_LEGAL_POR_DEFECTO } from '@/core/domain/entities/empresa-legal';
import type { ModalidadEntrega } from '@/core/domain/entities/types';

const datos: DatosEmpresaLegal = {
  nombre: 'La Tienda', razonSocial: null, nif: 'B00000000', direccion: 'Calle Mayor 1',
  telefono: '600000000', emailNotification: 'hola@latienda.test', tipo: 'tienda', moneda: 'EUR',
  tipoImpuesto: 'igic', deliveryHabilitado: false, envioDomicilioHabilitado: true,
  descuentoBienvenidaActivo: false, pagoTarjetaActivo: true,
};

const modalidad = (over: Partial<ModalidadEntrega>): ModalidadEntrega => ({
  id: 'm', empresaId: 'e1', tipo: 'domicilio', icono: 'package', nombre: 'Tenerife',
  precioCents: 1500, tiempoMinMinutos: 24, tiempoMaxMinutos: 48, activo: true, orden: 0, ...over,
});

function repos(over: { legal?: Partial<IEmpresaLegalRepository>; modalidades?: ModalidadEntrega[] } = {}) {
  const legal: IEmpresaLegalRepository = {
    findByEmpresa: vi.fn().mockResolvedValue({ success: true, data: null }),
    upsert: vi.fn(),
    findDatosEmpresa: vi.fn().mockResolvedValue({ success: true, data: datos }),
    ...over.legal,
  };
  const modalidadesRepo = {
    findActivasPublicas: vi.fn().mockResolvedValue({ success: true, data: over.modalidades ?? [] }),
  } as unknown as IModalidadEntregaRepository;
  return new EmpresaLegalUseCase(legal, modalidadesRepo);
}

describe('EmpresaLegalUseCase.getContext', () => {
  it('sin fila legal → defaults y fallbacks de empresa', async () => {
    const r = await repos().getContext('e1');
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.legal).toEqual(EMPRESA_LEGAL_POR_DEFECTO);
    expect(r.data.titular.nombre).toBe('La Tienda'); // razonSocial null → nombre
    expect(r.data.titular.email).toBe('hola@latienda.test'); // emailLegal null → emailNotification
    expect(r.data.direccionDevoluciones).toBe('Calle Mayor 1'); // null → direccion
    expect(r.data.tipoImpuesto).toBe('igic');
    expect(r.data.flags.pagoTarjetaActivo).toBe(true);
  });

  it('los datos legales propios prevalecen sobre los de empresa', async () => {
    const r = await repos({
      legal: {
        findByEmpresa: vi.fn().mockResolvedValue({
          success: true,
          data: { ...EMPRESA_LEGAL_POR_DEFECTO, emailLegal: 'legal@x.test', direccionDevoluciones: 'Almacén 3', registroMercantil: 'RM TF' },
        }),
        findDatosEmpresa: vi.fn().mockResolvedValue({ success: true, data: { ...datos, razonSocial: 'Tienda S.L.' } }),
      },
    }).getContext('e1');
    if (!r.success) throw new Error('esperaba éxito');
    expect(r.data.titular).toMatchObject({ nombre: 'Tienda S.L.', email: 'legal@x.test', registroMercantil: 'RM TF' });
    expect(r.data.direccionDevoluciones).toBe('Almacén 3');
  });

  it('solo incluye modalidades de domicilio, en su orden', async () => {
    const r = await repos({
      modalidades: [modalidad({ nombre: 'Recogida', tipo: 'recogida' }), modalidad({ nombre: 'Las Palmas', precioCents: 2500 })],
    }).getContext('e1');
    if (!r.success) throw new Error('esperaba éxito');
    expect(r.data.modalidadesDomicilio).toEqual([{ nombre: 'Las Palmas', precioCents: 2500, tiempoMin: 24, tiempoMax: 48 }]);
  });

  it('si fallan las modalidades, la página sigue (lista vacía)', async () => {
    const r = await new EmpresaLegalUseCase(
      { findByEmpresa: vi.fn().mockResolvedValue({ success: true, data: null }), upsert: vi.fn(), findDatosEmpresa: vi.fn().mockResolvedValue({ success: true, data: datos }) },
      { findActivasPublicas: vi.fn().mockResolvedValue({ success: false, error: { code: 'DB_ERROR', message: 'x' } }) } as unknown as IModalidadEntregaRepository,
    ).getContext('e1');
    if (!r.success) throw new Error('esperaba éxito');
    expect(r.data.modalidadesDomicilio).toEqual([]);
  });

  it('empresa inexistente → NOT_FOUND', async () => {
    const r = await repos({ legal: { findDatosEmpresa: vi.fn().mockResolvedValue({ success: true, data: null }) } }).getContext('e1');
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(r.error.code).toBe('NOT_FOUND');
  });

  it('error leyendo datos legales se propaga', async () => {
    const r = await repos({
      legal: { findByEmpresa: vi.fn().mockResolvedValue({ success: false, error: { code: 'DB_ERROR', message: 'x' } }) },
    }).getContext('e1');
    expect(r.success).toBe(false);
  });
});

describe('EmpresaLegalUseCase.get', () => {
  it('sin fila devuelve los defaults (el formulario arranca relleno)', async () => {
    const r = await repos().get('e1');
    expect(r).toEqual({ success: true, data: EMPRESA_LEGAL_POR_DEFECTO });
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `pnpm vitest run tests/core/legal/get-legal-context.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar**

Primero confirmar el código de "no encontrado": `rg -n "NOT_FOUND" src/core/domain/constants/api-errors.ts src/core/infrastructure/api/helpers.ts`. Si `handleResult` mapea otro código a 404, usar ese en lugar de `'NOT_FOUND'` (y ajustar el test).

```ts
// src/core/application/use-cases/empresa-legal.use-case.ts
import type { IEmpresaLegalRepository, DatosEmpresaLegal } from '@/core/domain/repositories/IEmpresaLegalRepository';
import type { IModalidadEntregaRepository } from '@/core/domain/repositories/IModalidadEntregaRepository';
import type { Result } from '@/core/domain/entities/types';
import {
  EMPRESA_LEGAL_POR_DEFECTO,
  type EmpresaLegal,
  type LegalContext,
  type ModalidadDomicilioLegal,
} from '@/core/domain/entities/empresa-legal';
import type { UpdateEmpresaLegalDTO } from '@/core/application/dtos/empresa-legal.dto';
import { logger } from '@/core/infrastructure/logging/logger';

function propagar<T>(r: { success: false; error: { code: string; message: string } }, method: string): Result<T> {
  return { success: false, error: { code: r.error.code, message: r.error.message, module: 'use-case', method } };
}

function construirContexto(
  empresaId: string,
  d: DatosEmpresaLegal,
  legal: EmpresaLegal,
  modalidadesDomicilio: ModalidadDomicilioLegal[]
): LegalContext {
  return {
    empresaId,
    tipo: d.tipo,
    moneda: d.moneda,
    tipoImpuesto: d.tipoImpuesto,
    titular: {
      nombre: d.razonSocial ?? d.nombre,
      nif: d.nif,
      direccion: d.direccion,
      email: legal.emailLegal ?? d.emailNotification,
      telefono: d.telefono,
      registroMercantil: legal.registroMercantil,
    },
    flags: {
      deliveryHabilitado: d.deliveryHabilitado,
      envioDomicilioHabilitado: d.envioDomicilioHabilitado,
      descuentoBienvenidaActivo: d.descuentoBienvenidaActivo,
      pagoTarjetaActivo: d.pagoTarjetaActivo,
    },
    direccionDevoluciones: legal.direccionDevoluciones ?? d.direccion,
    legal,
    modalidadesDomicilio,
  };
}

export class EmpresaLegalUseCase {
  constructor(
    private readonly repo: IEmpresaLegalRepository,
    private readonly modalidades: IModalidadEntregaRepository
  ) {}

  async get(empresaId: string): Promise<Result<EmpresaLegal>> {
    const method = 'EmpresaLegalUseCase.get';
    try {
      const r = await this.repo.findByEmpresa(empresaId);
      if (!r.success) return propagar(r, method);
      return { success: true, data: r.data ?? EMPRESA_LEGAL_POR_DEFECTO };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'use-case', method, { empresaId }) };
    }
  }

  async update(empresaId: string, dto: UpdateEmpresaLegalDTO): Promise<Result<EmpresaLegal>> {
    const method = 'EmpresaLegalUseCase.update';
    try {
      const r = await this.repo.upsert(empresaId, dto);
      if (!r.success) return propagar(r, method);
      return { success: true, data: r.data };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'use-case', method, { empresaId }) };
    }
  }

  private async modalidadesDomicilio(empresaId: string): Promise<ModalidadDomicilioLegal[]> {
    const r = await this.modalidades.findActivasPublicas(empresaId);
    // Sin modalidades la página de envíos sigue siendo válida (sin tabla):
    // no tumbamos /envios-y-pagos por un fallo transitorio de esta lectura.
    if (!r.success) return [];
    return r.data
      .filter((m) => m.tipo === 'domicilio')
      .map((m) => ({ nombre: m.nombre, precioCents: m.precioCents, tiempoMin: m.tiempoMinMinutos, tiempoMax: m.tiempoMaxMinutos }));
  }

  async getContext(empresaId: string): Promise<Result<LegalContext>> {
    const method = 'EmpresaLegalUseCase.getContext';
    try {
      const [datos, legal, modalidades] = await Promise.all([
        this.repo.findDatosEmpresa(empresaId),
        this.repo.findByEmpresa(empresaId),
        this.modalidadesDomicilio(empresaId),
      ]);
      if (!datos.success) return propagar(datos, method);
      if (!legal.success) return propagar(legal, method);
      if (datos.data === null) {
        return { success: false, error: { code: 'NOT_FOUND', message: 'Empresa no encontrada', module: 'use-case', method } };
      }
      return { success: true, data: construirContexto(empresaId, datos.data, legal.data ?? EMPRESA_LEGAL_POR_DEFECTO, modalidades) };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'use-case', method, { empresaId }) };
    }
  }
}
```

- [ ] **Step 4: Verificar que pasa**

Run: `pnpm vitest run tests/core/legal/get-legal-context.test.ts`
Expected: PASS.

- [ ] **Step 5: Lint + commit (incluye Task 7)**

```bash
pnpm lint
git add src/core/domain/repositories/IEmpresaLegalRepository.ts src/core/infrastructure/database/SupabaseEmpresaLegalRepository.ts src/core/infrastructure/database/index.ts src/core/application/use-cases/empresa-legal.use-case.ts tests/core/legal/get-legal-context.test.ts
git commit -m "feat(legal): repositorio y caso de uso de datos legales con fallbacks de empresa"
```

---

### Task 9: API admin `GET/PUT /api/admin/legal`

**Files:**
- Create: `src/app/api/admin/legal/route.ts`

Sin test de ruta (el repo no los tiene; la validación la cubre la Task 2). `resolveAdminContextWithEmpresa` ya aplica rate limit, auth, `requireRole(['admin','superadmin'])` y `?empresaId` para superadmin; el proxy valida CSRF en mutaciones admin.

- [ ] **Step 1: Implementar**

```ts
// src/app/api/admin/legal/route.ts
import { NextRequest } from 'next/server';
import { getEmpresaLegalUseCase } from '@/core/infrastructure/database';
import { updateEmpresaLegalSchema } from '@/core/application/dtos/empresa-legal.dto';
import { resolveAdminContextWithEmpresa, handleResult, validationErrorResponse } from '@/core/infrastructure/api/helpers';

export async function GET(request: NextRequest) {
  const ctx = await resolveAdminContextWithEmpresa(request);
  if (ctx.error) return ctx.error;
  return handleResult(await getEmpresaLegalUseCase().get(ctx.empresaId));
}

export async function PUT(request: NextRequest) {
  const ctx = await resolveAdminContextWithEmpresa(request);
  if (ctx.error) return ctx.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return validationErrorResponse('Invalid request body');
  }

  const parsed = updateEmpresaLegalSchema.safeParse(body);
  if (!parsed.success) return validationErrorResponse(parsed.error.issues[0].message);

  return handleResult(await getEmpresaLegalUseCase().update(ctx.empresaId, parsed.data));
}
```

- [ ] **Step 2: Lint + commit**

```bash
pnpm lint
git add src/app/api/admin/legal/route.ts
git commit -m "feat(legal): API admin para leer y guardar datos legales"
```

---

### Task 10: Layout legal compartido + helper de carga + privacidad dinámica

**Files:**
- Create: `src/components/legal/legal-layout.tsx`
- Create: `src/lib/legal/cargar-contexto.ts`
- Create: `src/components/legal/privacidad-contenido.tsx`
- Modify: `src/app/privacidad/page.tsx` (reescritura completa)
- Test: `tests/ui/legal-privacidad.test.tsx`

- [ ] **Step 1: Test que falla**

```tsx
// tests/ui/legal-privacidad.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PrivacidadContenido } from '@/components/legal/privacidad-contenido';
import { contextoDePrueba } from './legal-fixtures';

describe('PrivacidadContenido', () => {
  it('sin reparto no lista Glovo ni declara dirección', () => {
    render(<PrivacidadContenido ctx={contextoDePrueba()} />);
    expect(screen.queryByText(/Glovo/)).not.toBeInTheDocument();
    expect(screen.queryByText('Datos de dirección:')).not.toBeInTheDocument();
  });

  it('con reparto lista Glovo y declara dirección', () => {
    render(<PrivacidadContenido ctx={contextoDePrueba({ flags: { deliveryHabilitado: true } })} />);
    expect(screen.getByText('Glovo App S.L. (España)')).toBeInTheDocument();
    expect(screen.getByText('Datos de dirección:')).toBeInTheDocument();
  });

  it('muestra el titular resuelto', () => {
    render(<PrivacidadContenido ctx={contextoDePrueba()} />);
    expect(screen.getByText('Tienda de Prueba S.L.')).toBeInTheDocument();
  });
});
```

Y el fixture compartido por los tests UI legales:

```ts
// tests/ui/legal-fixtures.ts
import { EMPRESA_LEGAL_POR_DEFECTO, type LegalContext, type FlagsLegales, type EmpresaLegal } from '@/core/domain/entities/empresa-legal';

interface Overrides extends Partial<Omit<LegalContext, 'flags' | 'legal'>> {
  flags?: Partial<FlagsLegales>;
  legal?: Partial<EmpresaLegal>;
}

export function contextoDePrueba(o: Overrides = {}): LegalContext {
  const { flags, legal, ...resto } = o;
  return {
    empresaId: 'e1',
    tipo: 'tienda',
    moneda: 'EUR',
    tipoImpuesto: 'iva',
    titular: {
      nombre: 'Tienda de Prueba S.L.', nif: 'B00000000', direccion: 'Calle Mayor 1, 38300 La Orotava',
      email: 'legal@tienda.test', telefono: '922000000', registroMercantil: null,
    },
    direccionDevoluciones: 'Calle Mayor 1, 38300 La Orotava',
    modalidadesDomicilio: [],
    ...resto,
    flags: { deliveryHabilitado: false, envioDomicilioHabilitado: false, descuentoBienvenidaActivo: false, pagoTarjetaActivo: false, ...flags },
    legal: { ...EMPRESA_LEGAL_POR_DEFECTO, ...legal },
  };
}
```

Nota: `tests/ui/legal-fixtures.ts` es `.ts` dentro de `tests/ui/` — el proyecto `unit` incluye `tests/**/*.test.ts`, no le afecta porque no termina en `.test.ts`.

- [ ] **Step 2: Verificar que falla**

Run: `pnpm vitest run --project ui tests/ui/legal-privacidad.test.tsx`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Layout compartido**

```tsx
// src/components/legal/legal-layout.tsx
import Link from 'next/link';
import type { ReactNode } from 'react';

export const ACTUALIZACION_TEXTOS_LEGALES = '2026-09-30';

export function LegalPage({ titulo, children }: Readonly<{ titulo: string; children: ReactNode }>) {
  return (
    <main id="main-content" className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-4 py-10 flex flex-col gap-8">
        <div className="flex items-start justify-between gap-4 border-b border-foreground/15 pb-6">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1">Información legal</p>
            <h1 className="font-serif font-normal text-3xl">{titulo}</h1>
            <p className="text-sm text-muted-foreground mt-1">Última actualización: {ACTUALIZACION_TEXTOS_LEGALES}</p>
          </div>
          <Link href="/" className="shrink-0 inline-flex min-h-[44px] items-center text-sm text-muted-foreground hover:text-foreground underline">
            ← Volver
          </Link>
        </div>
        {children}
      </div>
    </main>
  );
}

export function Section({ titulo, children }: Readonly<{ titulo: string; children: ReactNode }>) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-serif font-normal text-xl text-foreground border-b border-foreground/10 pb-2">{titulo}</h2>
      <div className="flex flex-col gap-2 text-sm text-foreground leading-relaxed">{children}</div>
    </section>
  );
}

export function InfoTable({ rows }: Readonly<{ rows: ([string, string] | null)[] }>) {
  const validRows = rows.filter((r): r is [string, string] => r !== null);
  if (validRows.length === 0) return null;
  return (
    <dl className="rounded-[3px] border border-foreground/10 p-3 flex flex-col gap-1.5 text-sm">
      {validRows.map(([label, value]) => (
        <div key={label} className="flex flex-col sm:flex-row sm:gap-2">
          <dt className="text-muted-foreground shrink-0 sm:w-44">{label}:</dt>
          <dd className="font-medium break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Texto libre del tenant: SIEMPRE texto plano (React escapa); nunca HTML. */
export function TextoAdicional({ texto }: Readonly<{ texto: string | null }>) {
  if (texto === null) return null;
  return (
    <Section titulo="Condiciones adicionales">
      <p className="whitespace-pre-line">{texto}</p>
    </Section>
  );
}

export function TablaSimple({ cabeceras, filas }: Readonly<{ cabeceras: readonly string[]; filas: readonly (readonly string[])[] }>) {
  return (
    <div className="overflow-x-auto rounded-[3px] border border-foreground/10">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-foreground/10">
            {cabeceras.map((c) => (
              <th key={c} scope="col" className="text-left p-2 font-semibold">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-foreground/10">
          {filas.map((fila) => (
            <tr key={fila.join('|')}>
              {fila.map((celda, i) => (
                <td key={`${cabeceras[i]}-${celda}`} className="p-2">{celda}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: Helper de carga (server)**

```ts
// src/lib/legal/cargar-contexto.ts
import { notFound } from 'next/navigation';
import { getDomainFromHeaders } from '@/lib/domain-utils';
import { resolverEmpresaPublica } from '@/lib/server-services';
import { getEmpresaLegalUseCase } from '@/core/infrastructure/database';
import type { LegalContext } from '@/core/domain/entities/empresa-legal';
import { aplicaPagina, type SlugLegal } from './paginas-legales';

/**
 * Dominio → LegalContext. 404 si el dominio no es de ningún tenant o si la
 * página no aplica a este tenant (p. ej. /devoluciones en un restaurante).
 * Un error de BD se LANZA para que lo recoja error.tsx (no un 404 falso).
 */
export async function cargarContextoLegal(slug: SlugLegal): Promise<LegalContext> {
  const domain = await getDomainFromHeaders();
  const { empresa } = await resolverEmpresaPublica(domain ?? '');
  if (!empresa) notFound();
  if (!aplicaPagina(empresa, slug)) notFound();

  const r = await getEmpresaLegalUseCase().getContext(empresa.id);
  if (!r.success) {
    if (r.error.code === 'NOT_FOUND') notFound();
    throw new Error(`No se pudo cargar el contexto legal: ${r.error.code}`);
  }
  return r.data;
}
```

- [ ] **Step 5: Contenido de privacidad**

Mover el cuerpo actual de `src/app/privacidad/page.tsx` a un componente puro, sustituyendo lo fijo por lo calculado:

```tsx
// src/components/legal/privacidad-contenido.tsx
import type { LegalContext } from '@/core/domain/entities/empresa-legal';
import { FABRICANTE } from '@/lib/fabricante';
import { subencargadosDe } from '@/lib/legal/subencargados';
import { categoriasDatosDe } from '@/lib/legal/categorias-datos';
import { InfoTable, Section, TablaSimple } from './legal-layout';

const DERECHOS = [
  ['Acceso (Art. 15)', 'Saber qué datos suyos tratamos.'],
  ['Rectificación (Art. 16)', 'Corregir datos inexactos o incompletos.'],
  ['Supresión (Art. 17)', 'Solicitar el borrado de sus datos ("derecho al olvido").'],
  ['Limitación (Art. 18)', 'Suspender el tratamiento en casos concretos.'],
  ['Portabilidad (Art. 20)', 'Recibir sus datos en formato estructurado.'],
  ['Oposición (Art. 21)', 'Oponerse al tratamiento basado en interés legítimo.'],
] as const;

function FinalidadItem({ numero, titulo, base, descripcion }: Readonly<{ numero: string; titulo: string; base: string; descripcion: string }>) {
  return (
    <div className="rounded-[3px] border border-foreground/10 p-3 flex flex-col gap-1">
      <p className="text-xs text-muted-foreground">{numero}</p>
      <p className="font-semibold text-foreground">{titulo}</p>
      <p className="text-xs text-muted-foreground font-medium">{base}</p>
      <p className="text-xs text-muted-foreground">{descripcion}</p>
    </div>
  );
}

export function PrivacidadContenido({ ctx }: Readonly<{ ctx: LegalContext }>) {
  const { titular, flags } = ctx;
  const subencargados = subencargadosDe(flags);
  const categorias = categoriasDatosDe(flags);

  return (
    <>
      <Section titulo="1. Responsable del tratamiento">
        <p>
          De conformidad con el Reglamento (UE) 2016/679 (RGPD) y la Ley Orgánica 3/2018 (LOPDGDD), le informamos
          de que el <strong>Responsable del Tratamiento</strong> de sus datos personales es:
        </p>
        <InfoTable rows={[
          ['Denominación', titular.nombre],
          titular.nif ? ['NIF/CIF', titular.nif] : null,
          titular.direccion ? ['Dirección', titular.direccion] : null,
          titular.email ? ['Email de contacto', titular.email] : null,
        ]} />
      </Section>

      <Section titulo="2. Encargado del tratamiento">
        <p>
          El software de gestión de este establecimiento lo desarrolla y mantiene{' '}
          <strong>{FABRICANTE.nombre} ({FABRICANTE.nombreComercial})</strong>, que actúa como Encargado del
          Tratamiento en los términos del Art. 28 RGPD:
        </p>
        <InfoTable rows={[
          ['Nombre', `${FABRICANTE.nombre} (${FABRICANTE.nombreComercial})`],
          ['NIF', FABRICANTE.nif],
          ['Dirección', FABRICANTE.direccion],
          ['Email', FABRICANTE.email],
          ['Web', FABRICANTE.web],
        ]} />
      </Section>

      <Section titulo="3. Finalidades y base jurídica">
        <div className="flex flex-col gap-3">
          <FinalidadItem numero="3.1" titulo="Gestión del pedido" base="Ejecución del contrato (Art. 6.1.b RGPD)"
            descripcion="Sus datos son necesarios para procesar y entregar su pedido. Sin ellos no es posible prestar el servicio." />
          <FinalidadItem numero="3.2" titulo="Comunicaciones sobre el pedido" base="Ejecución del contrato e interés legítimo (Art. 6.1.b y 6.1.f RGPD)"
            descripcion="Le enviamos la confirmación del pedido y, en su caso, información sobre su estado o envío." />
          {flags.descuentoBienvenidaActivo && (
            <FinalidadItem numero="3.3" titulo="Envío de promociones y descuentos" base="Consentimiento (Art. 6.1.a RGPD)"
              descripcion="Solo si lo ha aceptado expresamente. Puede retirar su consentimiento en cualquier momento con el enlace de baja de cada comunicación." />
          )}
          <FinalidadItem numero={flags.descuentoBienvenidaActivo ? '3.4' : '3.3'} titulo="Obligaciones fiscales y contables" base="Obligación legal (Art. 6.1.c RGPD)"
            descripcion="Los registros de ventas se conservan durante 5 años conforme al Art. 66 de la Ley 58/2003 General Tributaria." />
        </div>
      </Section>

      <Section titulo="4. Categorías de datos tratados">
        <ul className="list-disc list-inside space-y-1 text-muted-foreground pl-2">
          {categorias.map((c) => (
            <li key={c.titulo}><strong>{c.titulo}:</strong> {c.descripcion}</li>
          ))}
        </ul>
        <p className="text-muted-foreground">No se tratan categorías especiales de datos (salud, ideología, origen racial, etc.).</p>
      </Section>

      <Section titulo="5. Plazos de conservación">
        <p>
          Sus datos se conservan mientras exista una relación activa con el establecimiento. Tras{' '}
          <strong>5 años sin actividad</strong>, sus datos identificativos se anonimizan de forma automática,
          conservando solo los registros de pedidos y cobros exigidos por la normativa fiscal.
        </p>
      </Section>

      <Section titulo="6. Destinatarios y subencargados">
        <p>Pueden acceder a sus datos los siguientes prestadores de servicios técnicos, todos con garantías adecuadas:</p>
        <TablaSimple cabeceras={['Proveedor', 'Finalidad', 'País']} filas={subencargados.map((s) => [s.proveedor, s.finalidad, s.pais])} />
        <p className="text-xs text-muted-foreground">
          SCCs = Cláusulas Contractuales Tipo aprobadas por la Comisión Europea (Art. 46 RGPD).
        </p>
      </Section>

      <Section titulo="7. Sus derechos">
        <p>
          Puede ejercerlos dirigiéndose al Responsable en la dirección de la sección 1
          {titular.email ? ` o por email a ${titular.email}` : ''}:
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {DERECHOS.map(([derecho, desc]) => (
            <div key={derecho} className="rounded-[3px] border border-foreground/10 p-3 text-xs">
              <p className="font-semibold text-foreground">{derecho}</p>
              <p className="text-muted-foreground mt-0.5">{desc}</p>
            </div>
          ))}
        </div>
        <p className="text-muted-foreground">
          Si considera que sus derechos no se han atendido correctamente, puede reclamar ante la{' '}
          <strong>Agencia Española de Protección de Datos (AEPD)</strong>: <span className="font-mono">www.aepd.es</span>
        </p>
      </Section>

      <Section titulo="8. Menores de edad">
        <p>Este servicio no está dirigido a menores de 14 años. Si sabe que un menor nos ha facilitado datos sin consentimiento de sus tutores, comuníquenoslo para suprimirlos.</p>
      </Section>

      <Section titulo="9. Cookies">
        <p>
          Este sitio usa únicamente <strong>cookies técnicas estrictamente necesarias</strong> (sesión y seguridad CSRF).
          No se usan cookies de seguimiento, analítica de terceros ni publicidad, por lo que no se requiere banner de
          consentimiento (Ley 34/2002, LSSI-CE).
        </p>
      </Section>

      <p className="text-xs text-muted-foreground border-t border-foreground/10 pt-4">
        Normativa de referencia: RGPD (UE) 2016/679 · LO 3/2018 (LOPDGDD) · Ley 58/2003 General Tributaria (Art. 66) · Ley 34/2002 (LSSI-CE)
      </p>
    </>
  );
}
```

- [ ] **Step 6: Reescribir `src/app/privacidad/page.tsx`**

```tsx
import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal/legal-layout';
import { PrivacidadContenido } from '@/components/legal/privacidad-contenido';
import { cargarContextoLegal } from '@/lib/legal/cargar-contexto';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Política de privacidad',
  alternates: { canonical: '/privacidad' },
};

export default async function PrivacidadPage() {
  const ctx = await cargarContextoLegal('privacidad');
  return (
    <LegalPage titulo="Política de privacidad">
      <PrivacidadContenido ctx={ctx} />
    </LegalPage>
  );
}
```

Cambio de comportamiento aceptado: antes, un dominio sin tenant servía la política con "el titular de este sitio"; ahora da 404 (no existe tienda que informar).

- [ ] **Step 7: Verificar que pasa**

Run: `pnpm vitest run --project ui tests/ui/legal-privacidad.test.tsx && pnpm lint`
Expected: PASS y sin errores de lint.

- [ ] **Step 8: Commit**

```bash
git add src/components/legal/legal-layout.tsx src/components/legal/privacidad-contenido.tsx src/lib/legal/cargar-contexto.ts src/app/privacidad/page.tsx tests/ui/legal-privacidad.test.tsx tests/ui/legal-fixtures.ts
git commit -m "feat(legal): política de privacidad con subencargados y datos según el tenant"
```

---

### Task 11: `/aviso-legal`

**Files:**
- Create: `src/components/legal/aviso-legal-contenido.tsx`
- Create: `src/app/aviso-legal/page.tsx`
- Test: `tests/ui/legal-aviso-legal.test.tsx`

- [ ] **Step 1: Test que falla**

```tsx
// tests/ui/legal-aviso-legal.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AvisoLegalContenido } from '@/components/legal/aviso-legal-contenido';
import { contextoDePrueba } from './legal-fixtures';

describe('AvisoLegalContenido', () => {
  it('pinta los datos del titular (art. 10 LSSI)', () => {
    render(<AvisoLegalContenido ctx={contextoDePrueba({ titular: { ...contextoDePrueba().titular, registroMercantil: 'RM Tenerife, tomo 2690' } })} />);
    expect(screen.getByText('Tienda de Prueba S.L.')).toBeInTheDocument();
    expect(screen.getByText('B00000000')).toBeInTheDocument();
    expect(screen.getByText('RM Tenerife, tomo 2690')).toBeInTheDocument();
  });

  it('omite el registro mercantil si no hay (autónomos)', () => {
    render(<AvisoLegalContenido ctx={contextoDePrueba()} />);
    expect(screen.queryByText('Registro Mercantil:')).not.toBeInTheDocument();
  });

  it('el texto adicional con HTML se muestra escapado', () => {
    render(<AvisoLegalContenido ctx={contextoDePrueba({ legal: { adicionalAvisoLegal: '<script>alert(1)</script>' } })} />);
    expect(screen.getByText('<script>alert(1)</script>')).toBeInTheDocument();
    expect(document.querySelector('script')).toBeNull();
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `pnpm vitest run --project ui tests/ui/legal-aviso-legal.test.tsx`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar contenido**

```tsx
// src/components/legal/aviso-legal-contenido.tsx
import Link from 'next/link';
import type { LegalContext } from '@/core/domain/entities/empresa-legal';
import { InfoTable, Section, TextoAdicional } from './legal-layout';

export function AvisoLegalContenido({ ctx }: Readonly<{ ctx: LegalContext }>) {
  const { titular } = ctx;
  return (
    <>
      <Section titulo="1. Datos identificativos">
        <p>En cumplimiento del artículo 10 de la Ley 34/2002 (LSSI-CE), se informa de los datos del titular de este sitio web:</p>
        <InfoTable rows={[
          ['Titular', titular.nombre],
          titular.nif ? ['NIF/CIF', titular.nif] : null,
          titular.direccion ? ['Domicilio', titular.direccion] : null,
          titular.registroMercantil ? ['Registro Mercantil', titular.registroMercantil] : null,
          titular.email ? ['Email', titular.email] : null,
          titular.telefono ? ['Teléfono', titular.telefono] : null,
        ]} />
      </Section>

      <Section titulo="2. Condiciones de uso">
        <p>El acceso a este sitio web implica la aceptación de estas condiciones. El usuario se compromete a hacer un uso adecuado de los contenidos y a no emplearlos para actividades ilícitas o contrarias a la buena fe.</p>
      </Section>

      <Section titulo="3. Propiedad intelectual e industrial">
        <p>Los contenidos de este sitio (textos, fotografías, logotipos y diseño) pertenecen a {titular.nombre} o a terceros que han autorizado su uso. Queda prohibida su reproducción, distribución o transformación sin autorización expresa.</p>
      </Section>

      <Section titulo="4. Responsabilidad">
        <p>El titular no se hace responsable de los daños derivados de interrupciones del servicio, errores de acceso o contenidos de sitios de terceros enlazados desde esta web. Se compromete a retirar cualquier contenido ilícito en cuanto tenga conocimiento de él.</p>
      </Section>

      <Section titulo="5. Protección de datos">
        <p>El tratamiento de datos personales se rige por la <Link href="/privacidad" className="underline">política de privacidad</Link>.</p>
      </Section>

      <Section titulo="6. Legislación aplicable y jurisdicción">
        <p>Estas condiciones se rigen por la legislación española. Para cualquier controversia con consumidores serán competentes los juzgados y tribunales del domicilio del consumidor.</p>
      </Section>

      <TextoAdicional texto={ctx.legal.adicionalAvisoLegal} />
    </>
  );
}
```

- [ ] **Step 4: Página**

```tsx
// src/app/aviso-legal/page.tsx
import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal/legal-layout';
import { AvisoLegalContenido } from '@/components/legal/aviso-legal-contenido';
import { cargarContextoLegal } from '@/lib/legal/cargar-contexto';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Aviso legal',
  alternates: { canonical: '/aviso-legal' },
};

export default async function AvisoLegalPage() {
  const ctx = await cargarContextoLegal('aviso-legal');
  return (
    <LegalPage titulo="Aviso legal">
      <AvisoLegalContenido ctx={ctx} />
    </LegalPage>
  );
}
```

- [ ] **Step 5: Verificar que pasa y commit**

```bash
pnpm vitest run --project ui tests/ui/legal-aviso-legal.test.tsx && pnpm lint
git add src/components/legal/aviso-legal-contenido.tsx src/app/aviso-legal/page.tsx tests/ui/legal-aviso-legal.test.tsx
git commit -m "feat(legal): página de aviso legal por tenant"
```

---

### Task 12: `/condiciones`

**Files:**
- Create: `src/components/legal/condiciones-contenido.tsx`
- Create: `src/app/condiciones/page.tsx`
- Test: `tests/ui/legal-condiciones.test.tsx`

- [ ] **Step 1: Test que falla**

```tsx
// tests/ui/legal-condiciones.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CondicionesContenido } from '@/components/legal/condiciones-contenido';
import { contextoDePrueba } from './legal-fixtures';

describe('CondicionesContenido', () => {
  it('restaurante: informa de que no hay desistimiento por perecederos (art. 97.1.n)', () => {
    render(<CondicionesContenido ctx={contextoDePrueba({ tipo: 'restaurante' })} />);
    expect(screen.getByText(/no es aplicable el derecho de desistimiento/i)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /devoluciones/i })).not.toBeInTheDocument();
  });

  it('restaurante con reparto: sección de reparto a domicilio', () => {
    render(<CondicionesContenido ctx={contextoDePrueba({ tipo: 'restaurante', flags: { deliveryHabilitado: true } })} />);
    expect(screen.getByRole('heading', { name: /reparto a domicilio/i })).toBeInTheDocument();
  });

  it('restaurante sin reparto: sin sección de reparto', () => {
    render(<CondicionesContenido ctx={contextoDePrueba({ tipo: 'restaurante' })} />);
    expect(screen.queryByRole('heading', { name: /reparto a domicilio/i })).not.toBeInTheDocument();
  });

  it('tienda: remite a la página de devoluciones', () => {
    render(<CondicionesContenido ctx={contextoDePrueba()} />);
    expect(screen.getByRole('link', { name: /devoluciones y garantía/i })).toHaveAttribute('href', '/devoluciones');
  });

  it('usa IGIC si la empresa tributa en Canarias', () => {
    render(<CondicionesContenido ctx={contextoDePrueba({ tipoImpuesto: 'igic' })} />);
    expect(screen.getByText(/IGIC/)).toBeInTheDocument();
    expect(screen.queryByText(/\bIVA\b/)).not.toBeInTheDocument();
  });

  it('menciona el pago con tarjeta solo si está activo', () => {
    const { unmount } = render(<CondicionesContenido ctx={contextoDePrueba()} />);
    expect(screen.queryByText(/tarjeta/i)).not.toBeInTheDocument();
    unmount();
    render(<CondicionesContenido ctx={contextoDePrueba({ flags: { pagoTarjetaActivo: true } })} />);
    expect(screen.getByText(/tarjeta/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `pnpm vitest run --project ui tests/ui/legal-condiciones.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar**

```tsx
// src/components/legal/condiciones-contenido.tsx
import Link from 'next/link';
import type { LegalContext } from '@/core/domain/entities/empresa-legal';
import { Section, TextoAdicional } from './legal-layout';

function nombreImpuesto(tipo: LegalContext['tipoImpuesto']): string {
  return tipo === 'igic' ? 'IGIC (Impuesto General Indirecto Canario)' : 'IVA';
}

function metodosDePago(ctx: LegalContext): string {
  if (ctx.flags.pagoTarjetaActivo) {
    return 'Tarjeta de débito o crédito a través de la pasarela segura de Redsys, o los medios que se indiquen en el proceso de compra. No almacenamos los datos de su tarjeta.';
  }
  return 'Los medios que se indiquen en el proceso de compra.';
}

function Desistimiento({ ctx }: Readonly<{ ctx: LegalContext }>) {
  if (ctx.tipo === 'tienda') {
    return (
      <p>
        Dispone de un plazo de {ctx.legal.plazoDesistimientoDias} días naturales para desistir de su compra. Consulte las condiciones,
        exclusiones y la garantía en{' '}
        <Link href="/devoluciones" className="underline">Devoluciones y garantía</Link>.
      </p>
    );
  }
  return (
    <p>
      Al tratarse de productos que pueden deteriorarse o caducar con rapidez, no es aplicable el derecho de desistimiento
      (art. 103.d del Real Decreto Legislativo 1/2007). Si su pedido llega incompleto o en mal estado, contacte con nosotros y lo resolveremos.
    </p>
  );
}

export function CondicionesContenido({ ctx }: Readonly<{ ctx: LegalContext }>) {
  const { titular } = ctx;
  return (
    <>
      <Section titulo="1. Objeto y vendedor">
        <p>
          Estas condiciones regulan la compra de productos a través de este sitio web, cuyo titular es {titular.nombre}
          {titular.nif ? ` (NIF/CIF ${titular.nif})` : ''}. Al realizar un pedido, el cliente declara haberlas leído y aceptado.
        </p>
      </Section>

      <Section titulo="2. Proceso de compra">
        <p>Seleccione los productos, revise el carrito, indique sus datos y la forma de entrega y confirme el pedido. Recibirá un email de confirmación con el detalle de su compra.</p>
      </Section>

      <Section titulo="3. Precios e impuestos">
        <p>Los precios se muestran en {ctx.moneda} e incluyen el {nombreImpuesto(ctx.tipoImpuesto)}. Los gastos de entrega, si los hay, se indican antes de confirmar el pedido.</p>
      </Section>

      <Section titulo="4. Formas de pago">
        <p>{metodosDePago(ctx)}</p>
      </Section>

      {ctx.flags.deliveryHabilitado && (
        <Section titulo="5. Reparto a domicilio">
          <p>
            Los pedidos a domicilio los entrega un servicio de mensajería externo contratado por {titular.nombre}. El coste del
            reparto se muestra en el carrito antes de confirmar. Cualquier incidencia con la entrega debe comunicarse a{' '}
            {titular.nombre}, que es el responsable del pedido frente al cliente.
          </p>
        </Section>
      )}

      <Section titulo="Derecho de desistimiento">
        <Desistimiento ctx={ctx} />
      </Section>

      <Section titulo="Atención al cliente y reclamaciones">
        <p>
          Puede contactar con nosotros{titular.email ? ` en ${titular.email}` : ''}{titular.telefono ? ` o en el ${titular.telefono}` : ''}.
          Tiene a su disposición hojas de reclamación oficiales.
        </p>
      </Section>

      <Section titulo="Legislación aplicable">
        <p>Estas condiciones se rigen por la legislación española. Para controversias con consumidores son competentes los juzgados del domicilio del consumidor.</p>
      </Section>

      <TextoAdicional texto={ctx.legal.adicionalCondiciones} />
    </>
  );
}
```

Nota: las secciones sin número a partir del desistimiento son a propósito — el número de la sección de reparto es condicional y numerarlas todas obligaría a calcularlo (ternarios).

- [ ] **Step 4: Página**

```tsx
// src/app/condiciones/page.tsx
import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal/legal-layout';
import { CondicionesContenido } from '@/components/legal/condiciones-contenido';
import { cargarContextoLegal } from '@/lib/legal/cargar-contexto';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Condiciones de compra',
  alternates: { canonical: '/condiciones' },
};

export default async function CondicionesPage() {
  const ctx = await cargarContextoLegal('condiciones');
  return (
    <LegalPage titulo="Condiciones de compra">
      <CondicionesContenido ctx={ctx} />
    </LegalPage>
  );
}
```

- [ ] **Step 5: Verificar y commit**

```bash
pnpm vitest run --project ui tests/ui/legal-condiciones.test.tsx && pnpm lint
git add src/components/legal/condiciones-contenido.tsx src/app/condiciones/page.tsx tests/ui/legal-condiciones.test.tsx
git commit -m "feat(legal): condiciones de compra con reparto, impuesto y desistimiento por tipo"
```

---

### Task 13: `/envios-y-pagos`

**Files:**
- Create: `src/components/legal/envios-contenido.tsx`
- Create: `src/app/envios-y-pagos/page.tsx`
- Test: `tests/ui/legal-envios.test.tsx`

- [ ] **Step 1: Test que falla**

```tsx
// tests/ui/legal-envios.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EnviosContenido } from '@/components/legal/envios-contenido';
import { contextoDePrueba } from './legal-fixtures';

describe('EnviosContenido', () => {
  it('genera la tabla desde las modalidades de domicilio', () => {
    render(<EnviosContenido ctx={contextoDePrueba({
      modalidadesDomicilio: [
        { nombre: 'Tenerife', precioCents: 1500, tiempoMin: 24, tiempoMax: 48 },
        { nombre: 'Las Palmas', precioCents: 2500, tiempoMin: 48, tiempoMax: 48 },
      ],
    })} />);
    expect(screen.getByText('Tenerife')).toBeInTheDocument();
    expect(screen.getByText(/15,00/)).toBeInTheDocument();
    expect(screen.getByText('24-48 h')).toBeInTheDocument();
    expect(screen.getByText('48 h')).toBeInTheDocument();
  });

  it('sin modalidades explica que se informa en el carrito', () => {
    render(<EnviosContenido ctx={contextoDePrueba()} />);
    expect(screen.getByText(/se muestran en el carrito/i)).toBeInTheDocument();
  });

  it('muestra plazo de preparación y aviso de daños si están configurados', () => {
    render(<EnviosContenido ctx={contextoDePrueba({ legal: { plazoPreparacionDias: 2, plazoAvisoDanosHoras: 24 } })} />);
    expect(screen.getByText(/2 días hábiles/)).toBeInTheDocument();
    expect(screen.getByText(/24 horas/)).toBeInTheDocument();
  });
});
```

Ojo: confirmar el valor exacto de la clave `deliveryModalityTimeUnit` en el bloque `es` (`rg -n "deliveryModalityTimeUnit" src/lib/translations.ts`); si no es `h`, ajustar los `expect` de horas.

- [ ] **Step 2: Verificar que falla**

Run: `pnpm vitest run --project ui tests/ui/legal-envios.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar**

```tsx
// src/components/legal/envios-contenido.tsx
import type { LegalContext, ModalidadDomicilioLegal } from '@/core/domain/entities/empresa-legal';
import { formatPrice } from '@/lib/format-price';
import { formatRangoHorasModalidad } from '@/lib/modalidad-entrega-iconos';
import { Section, TablaSimple, TextoAdicional } from './legal-layout';

function plazo(m: ModalidadDomicilioLegal): string {
  if (m.tiempoMin === null || m.tiempoMax === null) return '—';
  return formatRangoHorasModalidad(m.tiempoMin, m.tiempoMax, 'es');
}

function precio(cents: number, moneda: string): string {
  if (cents === 0) return 'Gratis';
  return formatPrice(cents / 100, moneda, 'es');
}

export function EnviosContenido({ ctx }: Readonly<{ ctx: LegalContext }>) {
  const { legal, modalidadesDomicilio: modalidades } = ctx;
  return (
    <>
      <Section titulo="1. Zonas, plazos y costes de envío">
        {modalidades.length === 0 ? (
          <p>Las opciones de envío disponibles, con su precio y plazo, se muestran en el carrito antes de confirmar el pedido.</p>
        ) : (
          <TablaSimple
            cabeceras={['Modalidad', 'Precio', 'Plazo de entrega']}
            filas={modalidades.map((m) => [m.nombre, precio(m.precioCents, ctx.moneda), plazo(m)])}
          />
        )}
        {legal.plazoPreparacionDias !== null && (
          <p>Los pedidos se preparan y entregan al transportista en un máximo de {legal.plazoPreparacionDias} días hábiles desde la confirmación del pago.</p>
        )}
        <p>Recibirá un email con el número de seguimiento cuando su pedido salga de nuestras instalaciones.</p>
      </Section>

      <Section titulo="2. Incidencias en la entrega">
        {legal.plazoAvisoDanosHoras === null ? (
          <p>Si el paquete llega dañado, anótelo al transportista y comuníquenoslo cuanto antes, preferiblemente con fotografías.</p>
        ) : (
          <p>Si el paquete llega dañado, comuníquenoslo en las {legal.plazoAvisoDanosHoras} horas siguientes a la entrega, preferiblemente con fotografías, para gestionar la reclamación con el transportista. Este aviso no limita sus derechos de garantía.</p>
        )}
      </Section>

      <Section titulo="3. Formas de pago">
        <p>
          {ctx.flags.pagoTarjetaActivo
            ? 'Tarjeta de débito o crédito mediante la pasarela segura de Redsys. No almacenamos los datos de su tarjeta.'
            : 'Los medios de pago disponibles se indican en el proceso de compra.'}
        </p>
      </Section>

      <TextoAdicional texto={legal.adicionalEnvios} />
    </>
  );
}
```

- [ ] **Step 4: Página**

```tsx
// src/app/envios-y-pagos/page.tsx
import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal/legal-layout';
import { EnviosContenido } from '@/components/legal/envios-contenido';
import { cargarContextoLegal } from '@/lib/legal/cargar-contexto';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Envíos y pagos',
  alternates: { canonical: '/envios-y-pagos' },
};

export default async function EnviosPage() {
  const ctx = await cargarContextoLegal('envios-y-pagos');
  return (
    <LegalPage titulo="Envíos y pagos">
      <EnviosContenido ctx={ctx} />
    </LegalPage>
  );
}
```

- [ ] **Step 5: Verificar y commit**

```bash
pnpm vitest run --project ui tests/ui/legal-envios.test.tsx && pnpm lint
git add src/components/legal/envios-contenido.tsx src/app/envios-y-pagos/page.tsx tests/ui/legal-envios.test.tsx
git commit -m "feat(legal): página de envíos y pagos generada desde las modalidades"
```

---

### Task 14: `/devoluciones`

**Files:**
- Create: `src/components/legal/devoluciones-contenido.tsx`
- Create: `src/app/devoluciones/page.tsx`
- Test: `tests/ui/legal-devoluciones.test.tsx`

- [ ] **Step 1: Test que falla**

```tsx
// tests/ui/legal-devoluciones.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DevolucionesContenido } from '@/components/legal/devoluciones-contenido';
import { contextoDePrueba } from './legal-fixtures';

describe('DevolucionesContenido', () => {
  it('por defecto: 14 días, reembolso en 14 días y 3 años de garantía', () => {
    render(<DevolucionesContenido ctx={contextoDePrueba()} />);
    expect(screen.getByText(/14 días naturales/)).toBeInTheDocument();
    expect(screen.getByText('Todos los productos')).toBeInTheDocument();
    expect(screen.getByText('3 años')).toBeInTheDocument();
    expect(screen.queryByText(/2 años/)).not.toBeInTheDocument();
  });

  it('plazo ampliado por el tenant', () => {
    render(<DevolucionesContenido ctx={contextoDePrueba({ legal: { plazoDesistimientoDias: 30 } })} />);
    expect(screen.getByText(/30 días naturales/)).toBeInTheDocument();
  });

  it('gastos de devolución a cargo de la empresa', () => {
    render(<DevolucionesContenido ctx={contextoDePrueba({ legal: { gastosDevolucion: 'empresa' } })} />);
    expect(screen.getByText(/corren a nuestro cargo/i)).toBeInTheDocument();
  });

  it('muestra la dirección de devoluciones y las exclusiones marcadas', () => {
    render(<DevolucionesContenido ctx={contextoDePrueba({
      direccionDevoluciones: 'Almacén 3, Polígono Sur',
      legal: { exclusionesDesistimiento: { supuestos: ['personalizados'], otras: 'Baterías de ácido instaladas' } },
    })} />);
    expect(screen.getByText('Almacén 3, Polígono Sur')).toBeInTheDocument();
    expect(screen.getByText(/claramente personalizados \(art\. 103\.c\)/)).toBeInTheDocument();
    expect(screen.getByText('Baterías de ácido instaladas')).toBeInTheDocument();
  });

  it('garantía comercial extra por tipo de producto', () => {
    render(<DevolucionesContenido ctx={contextoDePrueba({
      legal: { garantias: [{ ambito: 'Baterías AGM', estado: 'nuevo', mesesLegales: 36, mesesComercialesExtra: 24 }] },
    })} />);
    expect(screen.getByText('Baterías AGM')).toBeInTheDocument();
    expect(screen.getByText('2 años')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `pnpm vitest run --project ui tests/ui/legal-devoluciones.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar**

```tsx
// src/components/legal/devoluciones-contenido.tsx
import type { LegalContext, GarantiaFila } from '@/core/domain/entities/empresa-legal';
import { etiquetaArt103, PLAZO_REEMBOLSO_DIAS } from '@/core/domain/legal/constantes';
import { garantiasVisibles, formatMeses } from '@/lib/legal/garantias';
import { InfoTable, Section, TablaSimple, TextoAdicional } from './legal-layout';

const ESTADO: Record<GarantiaFila['estado'], string> = { nuevo: 'Nuevo', segunda_mano: 'Segunda mano' };

function Gastos({ quien }: Readonly<{ quien: LegalContext['legal']['gastosDevolucion'] }>) {
  if (quien === 'empresa') return <p>Los gastos de devolución corren a nuestro cargo.</p>;
  return <p>Los gastos directos de devolución corren a cargo del cliente, salvo que el producto sea defectuoso o no corresponda con lo pedido.</p>;
}

function Exclusiones({ ctx }: Readonly<{ ctx: LegalContext }>) {
  const { supuestos, otras } = ctx.legal.exclusionesDesistimiento;
  if (supuestos.length === 0 && otras === null) return null;
  return (
    <Section titulo="Productos excluidos del desistimiento">
      <ul className="list-disc list-inside space-y-1 pl-2">
        {supuestos.map((s) => <li key={s}>{etiquetaArt103(s)}</li>)}
        {otras !== null && <li className="whitespace-pre-line">{otras}</li>}
      </ul>
    </Section>
  );
}

export function DevolucionesContenido({ ctx }: Readonly<{ ctx: LegalContext }>) {
  const { legal, titular } = ctx;
  const garantias = garantiasVisibles(legal.garantias);
  return (
    <>
      <Section titulo="1. Derecho de desistimiento">
        <p>
          Dispone de <strong>{legal.plazoDesistimientoDias} días naturales</strong> desde la recepción del pedido para desistir
          de la compra sin necesidad de justificación.
        </p>
        <p>Para ejercerlo, comuníquenoslo de forma inequívoca{titular.email ? ` por email a ${titular.email}` : ''}. Después, dispone de 14 días para enviarnos el producto, sin usar y con su embalaje original, a:</p>
        <InfoTable rows={[ctx.direccionDevoluciones ? ['Dirección de devolución', ctx.direccionDevoluciones] : null]} />
        <Gastos quien={legal.gastosDevolucion} />
      </Section>

      <Section titulo="2. Reembolso">
        <p>Le reembolsaremos el importe pagado, incluidos los gastos de envío iniciales (salvo el sobrecoste de una modalidad de envío más cara que la estándar), en un plazo máximo de {PLAZO_REEMBOLSO_DIAS} días desde que nos comunique el desistimiento, por el mismo medio de pago. Podemos retener el reembolso hasta recibir el producto.</p>
      </Section>

      <Exclusiones ctx={ctx} />

      <Section titulo="Garantía">
        <p>Todos los productos cuentan con la garantía legal del Real Decreto Legislativo 1/2007. En caso de falta de conformidad puede elegir entre la reparación o la sustitución del producto y, si no fuese posible, la rebaja del precio o la resolución del contrato.</p>
        <TablaSimple
          cabeceras={['Productos', 'Estado', 'Garantía legal', 'Garantía comercial adicional']}
          filas={garantias.map((g) => [g.ambito, ESTADO[g.estado], formatMeses(g.mesesLegales), formatMeses(g.mesesComercialesExtra)])}
        />
        <p className="text-xs text-muted-foreground">La garantía comercial adicional se suma a la legal y no la sustituye.</p>
      </Section>

      <TextoAdicional texto={legal.adicionalDevoluciones} />
    </>
  );
}
```

Nota: si en la tabla aparece la clave duplicada de React (dos celdas `—`), el `key` de `TablaSimple` ya incluye la cabecera (`${cabeceras[i]}-${celda}`), así que no colisionan.

- [ ] **Step 4: Página**

```tsx
// src/app/devoluciones/page.tsx
import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal/legal-layout';
import { DevolucionesContenido } from '@/components/legal/devoluciones-contenido';
import { cargarContextoLegal } from '@/lib/legal/cargar-contexto';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Devoluciones y garantía',
  alternates: { canonical: '/devoluciones' },
};

export default async function DevolucionesPage() {
  const ctx = await cargarContextoLegal('devoluciones');
  return (
    <LegalPage titulo="Devoluciones y garantía">
      <DevolucionesContenido ctx={ctx} />
    </LegalPage>
  );
}
```

- [ ] **Step 5: Verificar y commit**

```bash
pnpm vitest run --project ui tests/ui/legal-devoluciones.test.tsx && pnpm lint
git add src/components/legal/devoluciones-contenido.tsx src/app/devoluciones/page.tsx tests/ui/legal-devoluciones.test.tsx
git commit -m "feat(legal): página de devoluciones y garantía con suelos legales"
```

---

### Task 15: Footer — columna "Legal"

**Files:**
- Modify: `src/components/site-footer.tsx` (quitar el `<li>` de privacidad de `FooterNav` ~línea 60, añadir `FooterLegal`, sumar 1 a `columnasVisibles`, actualizar el comentario de la cabecera)
- Test: `tests/ui/site-footer-legal.test.tsx`

- [ ] **Step 1: Test que falla**

Antes, mirar cómo montan `SiteFooter` los tests existentes: `rg -l "SiteFooter" tests/ui`. Si ya hay un fixture de `EmpresaPublic`, reutilizarlo. Si no:

```tsx
// tests/ui/site-footer-legal.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { LanguageProvider } from '@/lib/language-context';
import { SiteFooter } from '@/components/site-footer';
import type { EmpresaPublic } from '@/core/domain/entities/types';

function empresa(over: Partial<EmpresaPublic>): EmpresaPublic {
  return {
    id: 'e1', nombre: 'Demo', dominio: 'demo.test', tipo: 'tienda', mostrarCarrito: true, moneda: 'EUR',
    subdomainPedidos: null, logoUrl: null, mostrarLogo: false, urlImage: null, bannerFit: null,
    tipoBanner: 'imagen', bannerSlides: [], colores: null, descripcion: null, titulo: null, subtitulo: null,
    subtitulo2: null, footer1: null, footer2: null, fb: null, instagram: null, urlMapa: null, direccion: null,
    telefono: null, emailNotification: null, nif: null, razonSocial: null, descuentoBienvenidaActivo: false,
    descuentoBienvenidaPorcentaje: 0, deliveryHabilitado: false, envioDomicilioHabilitado: false,
    landingHabilitada: false, googleReviewsUrl: null,
    ...over,
  };
}

function enlacesLegales() {
  const nav = screen.getByRole('navigation', { name: 'Legal' });
  return within(nav).getAllByRole('link').map((a) => a.getAttribute('href'));
}

describe('SiteFooter — columna Legal', () => {
  it('restaurante: aviso legal, privacidad y condiciones', () => {
    render(<LanguageProvider><SiteFooter empresa={empresa({ tipo: 'restaurante', deliveryHabilitado: true })} /></LanguageProvider>);
    expect(enlacesLegales()).toEqual(['/aviso-legal', '/privacidad', '/condiciones']);
  });

  it('tienda con envío: las cinco páginas', () => {
    render(<LanguageProvider><SiteFooter empresa={empresa({ envioDomicilioHabilitado: true })} /></LanguageProvider>);
    expect(enlacesLegales()).toEqual(['/aviso-legal', '/privacidad', '/condiciones', '/envios-y-pagos', '/devoluciones']);
  });

  it('privacidad ya no se duplica en la navegación general', () => {
    render(<LanguageProvider><SiteFooter empresa={empresa({})} /></LanguageProvider>);
    expect(screen.getAllByRole('link', { name: /política de privacidad/i })).toHaveLength(1);
  });
});
```

(Si `EmpresaPublic` tiene más campos obligatorios que los listados, TypeScript lo dirá: completarlos con valores neutros.)

- [ ] **Step 2: Verificar que falla**

Run: `pnpm vitest run --project ui tests/ui/site-footer-legal.test.tsx`
Expected: FAIL — no existe navegación "Legal".

- [ ] **Step 3: Implementar**

En `src/components/site-footer.tsx`:

1. Import: `import { paginasLegalesDe } from "@/lib/legal/paginas-legales"`.
2. En la cabecera del JSDoc de `FooterNavegacion`, sustituir `Privacidad no se configura: se enlaza siempre (LSSI/RGPD).` por `Las páginas legales van en su propia columna (FooterLegal), decididas por paginasLegalesDe.`
3. Borrar de `FooterNav` la línea `<li><Link href="/privacidad" ...>{t("footerPrivacy", language)}</Link></li>`.
4. Añadir tras `FooterNav`:

```tsx
function FooterLegal({ empresa, language }: Readonly<{ empresa: EmpresaPublic; language: Lang }>) {
  const paginas = paginasLegalesDe(empresa)
  return (
    <nav aria-label={t("footerLegalTitle", language)} className="space-y-4">
      <h3 className="text-xs font-semibold text-footer-fg uppercase tracking-wider">{t("footerLegalTitle", language)}</h3>
      <ul className="space-y-1">
        {paginas.map((p) => (
          <li key={p.slug}><Link href={p.href} className={footerLinkClass}>{t(p.labelKey, language)}</Link></li>
        ))}
      </ul>
    </nav>
  )
}
```

5. En `SiteFooter`: `const columnasVisibles = 4 + (mostrarMapa ? 1 : 0) + (mostrarResenas ? 1 : 0)` y en `footerGridColsClass` añadir el caso `if (columnasVisibles >= 6) return "lg:grid-cols-6";` como primera línea.
6. Renderizar `<FooterLegal empresa={empresa} language={language} />` justo después de `<FooterNav ... />`.

- [ ] **Step 4: Verificar**

Run: `pnpm vitest run --project ui tests/ui/site-footer-legal.test.tsx && pnpm vitest run --project ui && pnpm lint`
Expected: PASS, incluidos los tests de footer existentes (si alguno afirmaba el enlace de privacidad dentro de la nav general, actualizarlo a la nav "Legal").

- [ ] **Step 5: Commit**

```bash
git add src/components/site-footer.tsx tests/ui/site-footer-legal.test.tsx
git commit -m "feat(footer): columna legal con las páginas que aplican al tenant"
```

---

### Task 16: Sitemap, robots y llms.txt

**Files:**
- Modify: `src/app/sitemap.ts:34`
- Modify: `src/app/robots.ts:5-6` (solo comentario)
- Modify: `src/lib/seo/llms-txt.ts:120`

- [ ] **Step 1: Sitemap**

```ts
// src/app/sitemap.ts — import
import { paginasLegalesDe } from "@/lib/legal/paginas-legales";

// sustituir el return final por:
  const legales = paginasLegalesDe(empresa).map((p) => entrada(p.href, 0.2, false));
  return [entrada("/", 1, true), entrada("/carta", 0.9, true), ...legales];
```

Y actualizar el comentario de `multilingue`: `(las de cliente; las páginas legales se sirven solo en castellano).`

- [ ] **Step 2: robots — comentario**

Cambiar `Solo \`/\`, \`/carta\` y \`/privacidad\` son indexables.` por `Son indexables \`/\`, \`/carta\` y las páginas legales (ver src/lib/legal/paginas-legales.ts).` Sin cambios de reglas: `allow: "/"` ya las cubre.

- [ ] **Step 3: llms.txt**

En `src/lib/seo/llms-txt.ts` mirar la firma de la función que contiene la línea 120 (`rg -n "export function" src/lib/seo/llms-txt.ts`). Si recibe la empresa (`EmpresaPublic` o algo con `tipo`/flags), sustituir la línea por:

```ts
  lineas.push("", "## Optional", "");
  for (const p of paginasLegalesDe(empresa)) {
    lineas.push(`- [${t(p.labelKey, lang)}](${baseUrl}${p.href})`);
  }
  lineas.push("");
```

con `import { paginasLegalesDe } from "@/lib/legal/paginas-legales";`. Si NO recibe la empresa, dejar la línea como está (YAGNI) y anotarlo en el resumen final.

- [ ] **Step 4: Verificar**

Run: `pnpm vitest run && pnpm lint`
Expected: PASS (si existe un test de llms-txt que afirme la línea literal de privacidad, actualizarlo).

- [ ] **Step 5: Commit**

```bash
git add src/app/sitemap.ts src/app/robots.ts src/lib/seo/llms-txt.ts
git commit -m "feat(seo): sitemap y llms.txt con las páginas legales del tenant"
```

---

### Task 17: Admin — traducciones, sidebar y página

**Files:**
- Modify: `src/lib/translations.ts`
- Modify: `src/app/admin/(protected)/admin-sidebar.tsx:171` (entrada nueva) + import del icono
- Create: `src/app/admin/(protected)/legal/page.tsx`

- [ ] **Step 1: Claves de traducción del admin**

Añadir en el bloque `es` (castellano de España, tuteo) y el equivalente en `en/fr/it/de` (para las claves largas de ayuda basta con `es` + `en`: `t()` cae a `es` si falta):

```ts
    sidebarLegal: "Textos legales",
    legalAdminTitle: "Textos legales",
    legalAdminSubtitle: "Datos que completan tu aviso legal, condiciones, envíos y devoluciones. Los mínimos que exige la ley ya vienen incluidos.",
    legalTabAviso: "Aviso legal",
    legalTabCondiciones: "Condiciones",
    legalTabEnvios: "Envíos",
    legalTabDevoluciones: "Devoluciones",
    legalDatosEmpresa: "Datos de la empresa",
    legalDatosEmpresaAyuda: "Se editan en Configuración para que no haya dos versiones distintas.",
    legalIrConfiguracion: "Ir a Configuración",
    legalRegistroMercantil: "Registro Mercantil",
    legalRegistroMercantilAyuda: "Tomo, folio y hoja. Déjalo vacío si eres autónomo.",
    legalEmailLegal: "Email para asuntos legales",
    legalEmailLegalAyuda: "Si lo dejas vacío se usa el email de notificaciones.",
    legalDireccionDevoluciones: "Dirección para devoluciones",
    legalDireccionDevolucionesAyuda: "Si la dejas vacía se usa la dirección de la empresa.",
    legalPlazoDesistimiento: "Plazo de desistimiento (días)",
    legalPlazoDesistimientoAyuda: "Mínimo legal: 14 días. Puedes ampliarlo.",
    legalGastosDevolucion: "Gastos de devolución",
    legalGastosCliente: "Los paga el cliente",
    legalGastosEmpresa: "Los pagamos nosotros",
    legalPlazoPreparacion: "Plazo de preparación (días hábiles)",
    legalPlazoAvisoDanos: "Plazo para avisar de daños en el transporte (horas)",
    legalGarantias: "Garantías",
    legalGarantiasAyuda: "Producto nuevo: 3 años por ley. Segunda mano: mínimo 1 año. La garantía comercial es opcional y se suma a la legal.",
    legalGarantiaAmbito: "Productos",
    legalGarantiaEstado: "Estado",
    legalGarantiaNuevo: "Nuevo",
    legalGarantiaSegundaMano: "Segunda mano",
    legalGarantiaMesesLegales: "Garantía legal (meses)",
    legalGarantiaMesesExtra: "Garantía comercial extra (meses)",
    legalGarantiaAnadir: "Añadir garantía",
    legalGarantiaQuitar: "Quitar garantía",
    legalExclusiones: "Productos excluidos del desistimiento",
    legalExclusionesAyuda: "Marca solo los casos que la ley permite (art. 103).",
    legalExclusionesOtras: "Otras aclaraciones",
    legalAdicional: "Condiciones adicionales (opcional)",
    legalAdicionalAyuda: "Texto plano. Se muestra al final de la página.",
    legalVerPagina: "Ver página",
    legalGuardar: "Guardar",
    legalGuardado: "Datos legales guardados",
```

En `en`: `sidebarLegal: "Legal texts"`, `legalAdminTitle: "Legal texts"`, `legalTabAviso: "Legal notice"`, `legalTabCondiciones: "Terms"`, `legalTabEnvios: "Shipping"`, `legalTabDevoluciones: "Returns"`, `legalGuardar: "Save"`, `legalGuardado: "Legal data saved"`, `legalVerPagina: "View page"`, y el resto traducido literalmente. En `fr/it/de` como mínimo `sidebarLegal` (`Textes juridiques` / `Testi legali` / `Rechtstexte`).

Auditoría de voseo sobre lo añadido: `rg -o "\b[a-zA-Záéíóúñ]+(á|é|í|ás|és|ís)\b" src/lib/translations.ts | sort -u` y revisar las palabras nuevas una a una.

- [ ] **Step 2: Sidebar**

En `admin-sidebar.tsx`, importar `Scale` de `lucide-react` y añadir antes de la entrada de configuración (línea 172):

```ts
  { type: 'item', def: { href: '/admin/legal', labelKey: 'sidebarLegal', icon: Scale } },
```

- [ ] **Step 3: Página admin (server)**

```tsx
// src/app/admin/(protected)/legal/page.tsx
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { Scale } from 'lucide-react';
import { getAuthAdminUseCase, getEmpresaLegalUseCase } from '@/core/infrastructure/database';
import { SUPERADMIN_ROLE } from '@/core/domain/repositories/IAdminRepository';
import { LegalSettingsForm } from '@/components/admin/legal/LegalSettingsForm';
import { TextoTraducido } from '@/components/texto-traducido';

export const dynamic = 'force-dynamic';

export default async function LegalAdminPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('admin_token')?.value;
  if (!token) redirect('/admin/login');

  const admin = await getAuthAdminUseCase().verifyToken(token);
  if (!admin) redirect('/admin/login');

  let empresaId = admin.empresaId;
  if (admin.rol === SUPERADMIN_ROLE) {
    const superadminEmpresaId = cookieStore.get('superadmin_empresa_id')?.value;
    if (!superadminEmpresaId) redirect('/superadmin');
    empresaId = superadminEmpresaId;
  }

  const useCase = getEmpresaLegalUseCase();
  const [contexto, legal] = await Promise.all([useCase.getContext(empresaId!), useCase.get(empresaId!)]);
  if (!contexto.success || !legal.success) {
    throw new Error('No se pudieron cargar los datos legales');
  }

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <Scale className="w-6 h-6 text-cyan-400 shrink-0" aria-hidden="true" />
        <div>
          <h2 className="text-2xl font-bold text-white"><TextoTraducido k="legalAdminTitle" /></h2>
          <p className="text-sm text-slate-400 mt-0.5"><TextoTraducido k="legalAdminSubtitle" /></p>
        </div>
      </div>
      <LegalSettingsForm
        inicial={legal.data}
        titular={contexto.data.titular}
        flags={{ tipo: contexto.data.tipo, deliveryHabilitado: contexto.data.flags.deliveryHabilitado, envioDomicilioHabilitado: contexto.data.flags.envioDomicilioHabilitado }}
      />
    </div>
  );
}
```

(Commit junto con la Task 18: la página importa el formulario.)

---

### Task 18: Admin — formulario por pestañas y editor de garantías

**Files:**
- Create: `src/components/admin/legal/GarantiasEditor.tsx`
- Create: `src/components/admin/legal/LegalSettingsForm.tsx`
- Test: `tests/ui/legal-settings-form.test.tsx`

Antes de escribir: mirar `src/components/admin/empresa-datos-form.tsx` y copiar sus clases de `input`/`label`/botón (el admin usa tema oscuro `bg-white/5 border-white/10 text-white`). Las clases de abajo siguen ese estilo; si el formulario de referencia usa un componente `Input`/`Label` de `@/components/ui`, usar esos.

- [ ] **Step 1: Test que falla**

```tsx
// tests/ui/legal-settings-form.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LanguageProvider } from '@/lib/language-context';
import { LegalSettingsForm } from '@/components/admin/legal/LegalSettingsForm';
import { EMPRESA_LEGAL_POR_DEFECTO } from '@/core/domain/entities/empresa-legal';

const fetchWithCsrf = vi.fn();
vi.mock('@/lib/csrf-client', () => ({ fetchWithCsrf: (...a: unknown[]) => fetchWithCsrf(...a) }));

const titular = { nombre: 'Demo S.L.', nif: 'B1', direccion: 'Calle 1', email: 'a@b.test', telefono: null, registroMercantil: null };

function montar(tipo: 'tienda' | 'restaurante', envio = false) {
  return render(
    <LanguageProvider>
      <LegalSettingsForm inicial={EMPRESA_LEGAL_POR_DEFECTO} titular={titular}
        flags={{ tipo, deliveryHabilitado: false, envioDomicilioHabilitado: envio }} />
    </LanguageProvider>
  );
}

beforeEach(() => fetchWithCsrf.mockReset());

describe('LegalSettingsForm', () => {
  it('restaurante: solo pestañas de aviso legal y condiciones', () => {
    montar('restaurante');
    expect(screen.getByRole('tab', { name: 'Aviso legal' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Condiciones' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Envíos' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Devoluciones' })).not.toBeInTheDocument();
  });

  it('tienda con envío: las cuatro pestañas', () => {
    montar('tienda', true);
    expect(screen.getAllByRole('tab')).toHaveLength(4);
  });

  it('muestra los datos de empresa en solo lectura', () => {
    montar('tienda');
    expect(screen.getByText('Demo S.L.')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('Demo S.L.')).not.toBeInTheDocument();
  });

  it('no envía si el plazo de desistimiento baja de 14', async () => {
    montar('tienda');
    fireEvent.click(screen.getByRole('tab', { name: 'Devoluciones' }));
    fireEvent.change(screen.getByLabelText('Plazo de desistimiento (días)'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/14 días/);
    expect(fetchWithCsrf).not.toHaveBeenCalled();
  });

  it('guarda con PUT a /api/admin/legal', async () => {
    fetchWithCsrf.mockResolvedValue({ ok: true, json: async () => ({ data: EMPRESA_LEGAL_POR_DEFECTO }) });
    montar('tienda');
    fireEvent.change(screen.getByLabelText('Registro Mercantil'), { target: { value: 'RM TF tomo 1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(fetchWithCsrf).toHaveBeenCalledTimes(1));
    const [url, init] = fetchWithCsrf.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/admin/legal');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body as string).registroMercantil).toBe('RM TF tomo 1');
  });

  it('garantía de producto nuevo muestra 36 meses fijos', () => {
    montar('tienda');
    fireEvent.click(screen.getByRole('tab', { name: 'Devoluciones' }));
    fireEvent.click(screen.getByRole('button', { name: 'Añadir garantía' }));
    expect(screen.getByLabelText('Garantía legal (meses)')).toBeDisabled();
    expect(screen.getByLabelText('Garantía legal (meses)')).toHaveValue(36);
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `pnpm vitest run --project ui tests/ui/legal-settings-form.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Editor de garantías**

```tsx
// src/components/admin/legal/GarantiasEditor.tsx
'use client';

import { useId } from 'react';
import type { GarantiaFila } from '@/core/domain/entities/empresa-legal';
import { GARANTIA_NUEVO_MESES, MIN_SEGUNDA_MANO_MESES } from '@/core/domain/legal/constantes';
import { useLanguage } from '@/lib/language-context';
import { t } from '@/lib/translations';

const inputClass = 'w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 min-h-[44px] text-sm text-white';

interface Props {
  filas: GarantiaFila[];
  onChange: (filas: GarantiaFila[]) => void;
}

function conEstado(fila: GarantiaFila, estado: GarantiaFila['estado']): GarantiaFila {
  if (estado === 'nuevo') return { ...fila, estado, mesesLegales: GARANTIA_NUEVO_MESES };
  return { ...fila, estado, mesesLegales: Math.max(fila.mesesLegales, MIN_SEGUNDA_MANO_MESES) };
}

function FilaGarantia({ fila, onChange, onQuitar }: Readonly<{ fila: GarantiaFila; onChange: (f: GarantiaFila) => void; onQuitar: () => void }>) {
  const { language } = useLanguage();
  const id = useId();
  return (
    <fieldset className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-lg border border-white/10 p-3">
      <div>
        <label htmlFor={`${id}-ambito`} className="text-xs text-slate-400">{t('legalGarantiaAmbito', language)}</label>
        <input id={`${id}-ambito`} className={inputClass} maxLength={120} value={fila.ambito}
          onChange={(e) => onChange({ ...fila, ambito: e.target.value })} />
      </div>
      <div>
        <label htmlFor={`${id}-estado`} className="text-xs text-slate-400">{t('legalGarantiaEstado', language)}</label>
        <select id={`${id}-estado`} className={inputClass} value={fila.estado}
          onChange={(e) => onChange(conEstado(fila, e.target.value === 'segunda_mano' ? 'segunda_mano' : 'nuevo'))}>
          <option value="nuevo">{t('legalGarantiaNuevo', language)}</option>
          <option value="segunda_mano">{t('legalGarantiaSegundaMano', language)}</option>
        </select>
      </div>
      <div>
        <label htmlFor={`${id}-legal`} className="text-xs text-slate-400">{t('legalGarantiaMesesLegales', language)}</label>
        <input id={`${id}-legal`} type="number" className={inputClass} min={MIN_SEGUNDA_MANO_MESES} max={120}
          value={fila.mesesLegales} disabled={fila.estado === 'nuevo'}
          onChange={(e) => onChange({ ...fila, mesesLegales: Number(e.target.value) })} />
      </div>
      <div>
        <label htmlFor={`${id}-extra`} className="text-xs text-slate-400">{t('legalGarantiaMesesExtra', language)}</label>
        <input id={`${id}-extra`} type="number" className={inputClass} min={0} max={240} value={fila.mesesComercialesExtra}
          onChange={(e) => onChange({ ...fila, mesesComercialesExtra: Number(e.target.value) })} />
      </div>
      <button type="button" onClick={onQuitar} className="sm:col-span-2 min-h-[44px] text-sm text-red-300 hover:text-red-200 text-left">
        {t('legalGarantiaQuitar', language)}
      </button>
    </fieldset>
  );
}

export function GarantiasEditor({ filas, onChange }: Readonly<Props>) {
  const { language } = useLanguage();
  const actualizar = (i: number, f: GarantiaFila) => onChange(filas.map((x, j) => (j === i ? f : x)));
  const quitar = (i: number) => onChange(filas.filter((_, j) => j !== i));
  const anadir = () =>
    onChange([...filas, { ambito: '', estado: 'nuevo', mesesLegales: GARANTIA_NUEVO_MESES, mesesComercialesExtra: 0 }]);

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-400">{t('legalGarantiasAyuda', language)}</p>
      {filas.map((fila, i) => (
        // Las filas no tienen id propio y se pueden reordenar solo quitando; el índice es estable aquí.
        // eslint-disable-next-line react/no-array-index-key
        <FilaGarantia key={i} fila={fila} onChange={(f) => actualizar(i, f)} onQuitar={() => quitar(i)} />
      ))}
      {filas.length < 20 && (
        <button type="button" onClick={anadir} className="min-h-[44px] rounded-md border border-white/10 px-3 text-sm text-white hover:bg-white/10">
          {t('legalGarantiaAnadir', language)}
        </button>
      )}
    </div>
  );
}
```

Nota sobre la `key` por índice: quitar una fila intermedia reutiliza el estado DOM de la siguiente; al ser inputs controlados por `fila`, se re-renderizan con el valor correcto. Si el lint del repo no tiene la regla `react/no-array-index-key`, quitar el comentario `eslint-disable`.

- [ ] **Step 4: Formulario por pestañas**

```tsx
// src/components/admin/legal/LegalSettingsForm.tsx
'use client';

import Link from 'next/link';
import { useId, useState, type ReactNode } from 'react';
import type { EmpresaLegal, LegalContext } from '@/core/domain/entities/empresa-legal';
import { SUPUESTOS_ART_103, type CodigoArt103 } from '@/core/domain/legal/constantes';
import { updateEmpresaLegalSchema } from '@/core/application/dtos/empresa-legal.dto';
import { aplicaPagina, type FlagsPaginas } from '@/lib/legal/paginas-legales';
import { fetchWithCsrf } from '@/lib/csrf-client';
import { useLanguage } from '@/lib/language-context';
import { t } from '@/lib/translations';
import { GarantiasEditor } from './GarantiasEditor';

type Lang = Parameters<typeof t>[1];
type Pestana = 'aviso' | 'condiciones' | 'envios' | 'devoluciones';

const inputClass = 'w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 min-h-[44px] text-sm text-white';

const PESTANAS: readonly { id: Pestana; labelKey: Parameters<typeof t>[0]; href: string; slug: Parameters<typeof aplicaPagina>[1] }[] = [
  { id: 'aviso', labelKey: 'legalTabAviso', href: '/aviso-legal', slug: 'aviso-legal' },
  { id: 'condiciones', labelKey: 'legalTabCondiciones', href: '/condiciones', slug: 'condiciones' },
  { id: 'envios', labelKey: 'legalTabEnvios', href: '/envios-y-pagos', slug: 'envios-y-pagos' },
  { id: 'devoluciones', labelKey: 'legalTabDevoluciones', href: '/devoluciones', slug: 'devoluciones' },
];

interface Props {
  inicial: EmpresaLegal;
  titular: LegalContext['titular'];
  flags: FlagsPaginas;
}

/** Los inputs trabajan con string; null ↔ ''. */
function aTexto(v: string | null): string {
  return v ?? '';
}

function aNumeroONull(v: string): number | null {
  return v === '' ? null : Number(v);
}

function Campo({ label, ayuda, children, htmlFor }: Readonly<{ label: string; ayuda?: string; htmlFor: string; children: ReactNode }>) {
  return (
    <div className="space-y-1">
      <label htmlFor={htmlFor} className="text-sm font-medium text-white">{label}</label>
      {children}
      {ayuda && <p className="text-xs text-slate-400">{ayuda}</p>}
    </div>
  );
}

function DatosEmpresa({ titular, language }: Readonly<{ titular: LegalContext['titular']; language: Lang }>) {
  const filas = [titular.nombre, titular.nif, titular.direccion, titular.email].filter((v): v is string => Boolean(v));
  return (
    <section className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-2">
      <h3 className="text-sm font-semibold text-white">{t('legalDatosEmpresa', language)}</h3>
      <ul className="text-sm text-slate-300 space-y-0.5">{filas.map((f) => <li key={f}>{f}</li>)}</ul>
      <p className="text-xs text-slate-400">
        {t('legalDatosEmpresaAyuda', language)}{' '}
        <Link href="/admin/configuracion" className="underline">{t('legalIrConfiguracion', language)}</Link>
      </p>
    </section>
  );
}

function TextoAdicionalInput({ id, valor, onChange, language }: Readonly<{ id: string; valor: string | null; onChange: (v: string | null) => void; language: Lang }>) {
  return (
    <Campo htmlFor={id} label={t('legalAdicional', language)} ayuda={t('legalAdicionalAyuda', language)}>
      <textarea id={id} className={`${inputClass} min-h-[120px]`} maxLength={2000} value={aTexto(valor)}
        onChange={(e) => onChange(e.target.value)} />
    </Campo>
  );
}

export function LegalSettingsForm({ inicial, titular, flags }: Readonly<Props>) {
  const { language } = useLanguage();
  const id = useId();
  const pestanas = PESTANAS.filter((p) => aplicaPagina(flags, p.slug));
  const [activa, setActiva] = useState<Pestana>('aviso');
  const [datos, setDatos] = useState<EmpresaLegal>(inicial);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const set = <K extends keyof EmpresaLegal>(k: K, v: EmpresaLegal[K]) => setDatos((d) => ({ ...d, [k]: v }));

  const toggleSupuesto = (codigo: CodigoArt103) => {
    const actuales = datos.exclusionesDesistimiento.supuestos;
    const supuestos = actuales.includes(codigo) ? actuales.filter((c) => c !== codigo) : [...actuales, codigo];
    set('exclusionesDesistimiento', { ...datos.exclusionesDesistimiento, supuestos });
  };

  async function guardar() {
    setError(null);
    setOk(false);
    const parsed = updateEmpresaLegalSchema.safeParse(datos);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setGuardando(true);
    try {
      const res = await fetchWithCsrf('/api/admin/legal', { method: 'PUT', body: JSON.stringify(parsed.data) });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? t('errorSaving', language));
        return;
      }
      setOk(true);
    } catch {
      setError(t('connectionError', language));
    } finally {
      setGuardando(false);
    }
  }

  const pestanaActual = pestanas.find((p) => p.id === activa) ?? pestanas[0];

  return (
    <div className="space-y-6">
      <DatosEmpresa titular={titular} language={language} />

      <div role="tablist" aria-label={t('legalAdminTitle', language)} className="flex flex-wrap gap-2 border-b border-white/10">
        {pestanas.map((p) => (
          <button key={p.id} type="button" role="tab" id={`${id}-tab-${p.id}`} aria-selected={p.id === pestanaActual.id}
            aria-controls={`${id}-panel`} onClick={() => setActiva(p.id)}
            className="min-h-[44px] px-3 text-sm text-slate-300 aria-selected:text-white aria-selected:border-b-2 aria-selected:border-cyan-400">
            {t(p.labelKey, language)}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab-${pestanaActual.id}`} className="space-y-5">
        {pestanaActual.id === 'aviso' && (
          <>
            <Campo htmlFor={`${id}-rm`} label={t('legalRegistroMercantil', language)} ayuda={t('legalRegistroMercantilAyuda', language)}>
              <input id={`${id}-rm`} className={inputClass} maxLength={300} value={aTexto(datos.registroMercantil)}
                onChange={(e) => set('registroMercantil', e.target.value)} />
            </Campo>
            <Campo htmlFor={`${id}-email`} label={t('legalEmailLegal', language)} ayuda={t('legalEmailLegalAyuda', language)}>
              <input id={`${id}-email`} type="email" className={inputClass} maxLength={200} value={aTexto(datos.emailLegal)}
                onChange={(e) => set('emailLegal', e.target.value)} />
            </Campo>
            <TextoAdicionalInput id={`${id}-ad-aviso`} valor={datos.adicionalAvisoLegal} onChange={(v) => set('adicionalAvisoLegal', v)} language={language} />
          </>
        )}

        {pestanaActual.id === 'condiciones' && (
          <TextoAdicionalInput id={`${id}-ad-cond`} valor={datos.adicionalCondiciones} onChange={(v) => set('adicionalCondiciones', v)} language={language} />
        )}

        {pestanaActual.id === 'envios' && (
          <>
            <Campo htmlFor={`${id}-prep`} label={t('legalPlazoPreparacion', language)}>
              <input id={`${id}-prep`} type="number" min={0} max={60} className={inputClass} value={datos.plazoPreparacionDias ?? ''}
                onChange={(e) => set('plazoPreparacionDias', aNumeroONull(e.target.value))} />
            </Campo>
            <Campo htmlFor={`${id}-danos`} label={t('legalPlazoAvisoDanos', language)}>
              <input id={`${id}-danos`} type="number" min={1} max={720} className={inputClass} value={datos.plazoAvisoDanosHoras ?? ''}
                onChange={(e) => set('plazoAvisoDanosHoras', aNumeroONull(e.target.value))} />
            </Campo>
            <TextoAdicionalInput id={`${id}-ad-env`} valor={datos.adicionalEnvios} onChange={(v) => set('adicionalEnvios', v)} language={language} />
          </>
        )}

        {pestanaActual.id === 'devoluciones' && (
          <>
            <Campo htmlFor={`${id}-plazo`} label={t('legalPlazoDesistimiento', language)} ayuda={t('legalPlazoDesistimientoAyuda', language)}>
              <input id={`${id}-plazo`} type="number" min={14} max={365} className={inputClass} value={datos.plazoDesistimientoDias}
                onChange={(e) => set('plazoDesistimientoDias', Number(e.target.value))} />
            </Campo>
            <Campo htmlFor={`${id}-gastos`} label={t('legalGastosDevolucion', language)}>
              <select id={`${id}-gastos`} className={inputClass} value={datos.gastosDevolucion}
                onChange={(e) => set('gastosDevolucion', e.target.value === 'empresa' ? 'empresa' : 'cliente')}>
                <option value="cliente">{t('legalGastosCliente', language)}</option>
                <option value="empresa">{t('legalGastosEmpresa', language)}</option>
              </select>
            </Campo>
            <Campo htmlFor={`${id}-dir`} label={t('legalDireccionDevoluciones', language)} ayuda={t('legalDireccionDevolucionesAyuda', language)}>
              <input id={`${id}-dir`} className={inputClass} maxLength={300} value={aTexto(datos.direccionDevoluciones)}
                onChange={(e) => set('direccionDevoluciones', e.target.value)} />
            </Campo>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-white">{t('legalExclusiones', language)}</legend>
              <p className="text-xs text-slate-400">{t('legalExclusionesAyuda', language)}</p>
              {SUPUESTOS_ART_103.map((s) => (
                <label key={s.codigo} className="flex items-start gap-2 min-h-[44px] text-sm text-slate-300">
                  <input type="checkbox" className="mt-1" checked={datos.exclusionesDesistimiento.supuestos.includes(s.codigo)}
                    onChange={() => toggleSupuesto(s.codigo)} />
                  <span>{s.etiqueta} (art. 103.{s.letra})</span>
                </label>
              ))}
              <Campo htmlFor={`${id}-otras`} label={t('legalExclusionesOtras', language)}>
                <textarea id={`${id}-otras`} className={inputClass} maxLength={500} value={aTexto(datos.exclusionesDesistimiento.otras)}
                  onChange={(e) => set('exclusionesDesistimiento', { ...datos.exclusionesDesistimiento, otras: e.target.value })} />
              </Campo>
            </fieldset>
            <section className="space-y-2">
              <h3 className="text-sm font-medium text-white">{t('legalGarantias', language)}</h3>
              <GarantiasEditor filas={datos.garantias} onChange={(g) => set('garantias', g)} />
            </section>
            <TextoAdicionalInput id={`${id}-ad-dev`} valor={datos.adicionalDevoluciones} onChange={(v) => set('adicionalDevoluciones', v)} language={language} />
          </>
        )}
      </div>

      {error !== null && <p role="alert" className="text-sm text-red-300">{error}</p>}
      {ok && <p role="status" className="text-sm text-emerald-300">{t('legalGuardado', language)}</p>}

      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={guardar} disabled={guardando}
          className="min-h-[44px] rounded-md bg-cyan-500 px-4 text-sm font-semibold text-slate-900 disabled:opacity-50">
          {t('legalGuardar', language)}
        </button>
        <a href={pestanaActual.href} target="_blank" rel="noopener noreferrer"
          className="inline-flex min-h-[44px] items-center rounded-md border border-white/10 px-4 text-sm text-white">
          {t('legalVerPagina', language)}
        </a>
      </div>
    </div>
  );
}
```

Nota sobre el envío: se manda `parsed.data` (strings vacíos ya convertidos a `null`) y no `datos`, para que lo que llega a la API sea exactamente lo que valida el mismo esquema.

Complejidad: si SonarLint marca `LegalSettingsForm` por encima de 15 (los cuatro bloques `&&` no cuentan, pero `guardar` es una función anidada y no suma), extraer cada panel a su componente (`PanelAviso`, `PanelEnvios`, `PanelDevoluciones`) recibiendo `datos` y `set`. Medir con el script de `docs/context/deuda-complejidad.md` antes de refactorizar.

- [ ] **Step 5: Verificar**

Run: `pnpm vitest run --project ui tests/ui/legal-settings-form.test.tsx && pnpm lint`
Expected: PASS.

- [ ] **Step 6: Commit (incluye Task 17)**

```bash
git add src/lib/translations.ts "src/app/admin/(protected)/admin-sidebar.tsx" "src/app/admin/(protected)/legal/page.tsx" src/components/admin/legal/GarantiasEditor.tsx src/components/admin/legal/LegalSettingsForm.tsx tests/ui/legal-settings-form.test.tsx
git commit -m "feat(admin): sección de textos legales con suelos validados y vista previa"
```

---

### Task 19: Documentación, grafo y verificación final

**Files:**
- Create: `docs/context/paginas-legales.md`
- Modify: `CLAUDE.md` (sección nueva tras "Tienda — Envio a Domicilio y Seguimiento")
- Modify: `docs/superpowers/specs/2026-09-30-paginas-legales-multitenant-design.md` (dos ajustes)

- [ ] **Step 1: `docs/context/paginas-legales.md`**

Contenido mínimo: tabla de páginas/visibilidad; flujo `dominio → cargarContextoLegal → EmpresaLegalUseCase.getContext → *Contenido`; suelos legales y dónde se validan (Zod + CHECK + `garantiasVisibles`); lista de subencargados y de qué flag depende cada uno; cómo añadir una página nueva (regla en `paginas-legales.ts` + contenido + página + pestaña admin); trampa de horas en `modalidades_entrega`.

- [ ] **Step 2: Sección en `CLAUDE.md`**

```md
## Páginas Legales por Tenant — Trampas Criticas

> Ver doc completo: `docs/context/paginas-legales.md`

- **`paginasLegalesDe()` es la ÚNICA fuente de verdad** de qué páginas legales existen para un tenant (footer, sitemap, llms.txt, 404 de las páginas y pestañas del admin). Añadir una página = añadir su regla ahí; si no, el footer enlaza un 404 o la página queda huérfana.
- **Suelos legales en TRES sitios a propósito**: Zod (`empresa-legal.dto.ts`), CHECK en BD y `garantiasVisibles()` al pintar. Nunca relajar uno pensando que otro lo cubre: un tenant puede AMPLIAR derechos (desistimiento > 14 días, garantía comercial), nunca bajarlos (nuevo = 36 meses; segunda mano ≥ 12).
- **Subencargados de `/privacidad` salen de flags** (`subencargadosDe`). Si integras un proveedor nuevo que recibe datos personales, añádelo ahí con su condición; si no, la política miente.
- **Textos adicionales del tenant = texto plano** (`whitespace-pre-line`). Nunca `dangerouslySetInnerHTML`.
- **Restaurante nunca tiene `/envios-y-pagos` ni `/devoluciones`** aunque use Glovo: vende perecederos (art. 103.d). El reparto y la ausencia de desistimiento se explican en `/condiciones`.
```

- [ ] **Step 3: Ajustar la spec**

En la spec: (a) `garantias` se guarda en camelCase dentro del JSONB (`{ ambito, estado, mesesLegales, mesesComercialesExtra }`), no snake_case; (b) se elimina el test de ruta `tests/core/legal/admin-legal-route.test.ts` — el repo no testea rutas y la validación la cubre el DTO.

- [ ] **Step 4: Verificación completa (regla de oro del proyecto)**

Run: `pnpm vitest run && pnpm lint && pnpm build`
Expected: todo en verde. Si `pnpm build` falla por algo ajeno a esta feature, reportarlo con la salida y no marcar como completado.

- [ ] **Step 5: Verificación manual**

Con `pnpm dev`, sobre un dominio de tienda y uno de restaurante en local:
- Footer: la columna "Legal" muestra solo las páginas que aplican.
- `/devoluciones` en el restaurante → 404.
- `/admin/legal`: guardar 10 días de desistimiento → error "no puede ser inferior a 14 días"; guardar un registro mercantil → aparece en `/aviso-legal`.

- [ ] **Step 6: Grafo y commit**

```bash
graphify update .
git add docs/context/paginas-legales.md CLAUDE.md docs/superpowers/specs/2026-09-30-paginas-legales-multitenant-design.md graphify-out
git commit -m "docs(legal): contexto y trampas de las páginas legales por tenant"
```
