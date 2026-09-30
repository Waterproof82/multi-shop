# Páginas legales multi-tenant — Diseño

Fecha: 2026-09-30
Estado: aprobado en brainstorming, pendiente de plan

## Problema

Hoy solo existe `/privacidad`, con los datos del responsable dinámicos pero el resto del texto fijo en código:

- Lista Glovo y Redsys como subencargados en TODOS los tenants, los usen o no.
- Describe Brevo como "solo marketing", cuando también envía confirmaciones de pedido y emails de seguimiento.
- Asume que solo se recogen nombre y teléfono (caso restaurante); una tienda con envío recoge la dirección.

No existen aviso legal (art. 10 LSSI), condiciones de contratación, envíos ni devoluciones. Las tiendas con envío a domicilio las necesitan (arts. 97 y 103 TRLGDCU).

Referencia analizada: lacasadelabateria.es (PrestaShop). Sirve como modelo de estructura, pero NO como contenido: dice "2 años de garantía" (son 3 años desde el RDL 7/2021) y tiene los apartados legales mezclados.

## Decisiones

| Decisión | Elegido | Motivo |
|---|---|---|
| Idioma | Solo castellano | Es lo que exige vender en España; una traducción legal mala es peor que ninguna |
| Enfoque | Plantilla en código + campos estructurados por tenant | Los mínimos legales no se pueden romper; un cambio de ley se corrige una vez para todos |
| Quién edita | El admin del tenant y el superadmin (`?empresaId`) | El responsable legal es el titular del negocio |
| Variaciones | Todo lo que varía es configurable, con suelo legal validado por Zod | Flexibilidad sin permitir valores ilegales |

## Páginas y visibilidad

| Ruta | Restaurante | Tienda | Condición |
|---|---|---|---|
| `/aviso-legal` | sí | sí | Siempre |
| `/privacidad` | sí | sí | Siempre |
| `/condiciones` | sí | sí | Siempre. Sección "Reparto a domicilio" solo si `deliveryHabilitado` |
| `/envios-y-pagos` | no | sí | `tipo === 'tienda'` && `envioDomicilioHabilitado` |
| `/devoluciones` | no | sí | `tipo === 'tienda'` |

Una ruta que no aplica al tenant → `notFound()` (404).

Restaurante: no hay desistimiento porque los productos son perecederos (art. 103.d TRLGDCU), pero `/condiciones` debe decirlo expresamente (art. 97.1.n). El reparto por Glovo lo cobra el restaurante (`pedido.use-case.ts:452`), así que el restaurante es el vendedor frente al comensal y responde de las incidencias.

Única fuente de verdad: `src/lib/legal/paginas-legales.ts`. La usan el footer, el sitemap y las páginas.

## Contenido dinámico por página

- **Aviso legal:** `razonSocial` (fallback `nombre`), `nif`, `direccion`, `registro_mercantil`, `email_legal` (fallback `emailNotification`), teléfono, más texto adicional.
- **Privacidad:**
  - Subencargados según flags:
    - Supabase, Vercel y Sentry: siempre.
    - Redsys: si `redsys_merchant_code` no es nulo. Se calcula como booleano en servidor; el código nunca sale al cliente.
    - Glovo: si `deliveryHabilitado`.
    - Brevo: siempre. Finalidad construida por flags: "confirmación de pedidos" siempre, "+ seguimiento de envíos" si `envioDomicilioHabilitado`, "+ promociones" si `descuentoBienvenidaActivo`.
  - Categorías de datos: la dirección de entrega solo si `deliveryHabilitado || envioDomicilioHabilitado`.
- **Condiciones:** proceso de compra, precios con IVA o IGIC según `tipoImpuesto`, métodos de pago activos, reparto (condicional), desistimiento (tienda: remite a `/devoluciones`; restaurante: exclusión por perecederos), garantía (tienda), jurisdicción, más texto adicional.
- **Envíos y pagos:**
  - Tabla generada desde `modalidades_entrega` (`tipo='domicilio'`, `activo`, ordenada por `orden`): nombre, precio y plazo.
  - `plazo_preparacion_dias`, `plazo_aviso_danos_horas`, métodos de pago, más texto adicional.
- **Devoluciones:**
  - `plazo_desistimiento_dias` (≥ 14) y `direccion_devoluciones` (fallback `direccion`).
  - `gastos_devolucion`.
  - Reembolso en 14 días por el mismo medio de pago (fijo); puede retenerse hasta recibir el producto o hasta que el consumidor presente prueba de su devolución, lo que ocurra primero (art. 107.3 TRLGDCU).
  - Modelo de formulario de desistimiento (Anexo B TRLGDCU) con el texto literal oficial, dirigido al titular (nombre, dirección, email y teléfono).
  - Tabla de garantías, exclusiones marcadas y texto adicional.

## Modelo de datos

Tabla nueva `public.empresa_legal`, 1:1 con `empresas` (`empresa_id` PK/FK, `ON DELETE CASCADE`).

| Columna | Tipo | Regla |
|---|---|---|
| `registro_mercantil` | text | opcional, max 300 |
| `email_legal` | text | opcional, email; si es nulo → `emailNotification` |
| `direccion_devoluciones` | text | opcional, max 300; si es nulo → `direccion` |
| `plazo_desistimiento_dias` | int NOT NULL DEFAULT 14 | CHECK ≥ 14 (y Zod ≥ 14, ≤ 365) |
| `gastos_devolucion` | text NOT NULL DEFAULT 'cliente' | CHECK IN ('cliente','empresa') |
| `plazo_preparacion_dias` | int | opcional, 0–60 |
| `plazo_aviso_danos_horas` | int | opcional, 1–720 |
| `garantias` | jsonb NOT NULL DEFAULT '[]' | ver abajo |
| `exclusiones_desistimiento` | jsonb NOT NULL DEFAULT '{"supuestos":[],"otras":null}' | ver abajo |
| `adicional_aviso_legal` / `adicional_condiciones` / `adicional_envios` / `adicional_devoluciones` | text | opcional, max 2000, texto plano |
| `updated_at` | timestamptz | |

`garantias`: lista de `{ ambito: string (max 120), estado: 'nuevo' | 'segunda_mano', mesesLegales: int, mesesComercialesExtra: int ≥ 0 }` — **camelCase dentro del JSONB**, no snake_case: se guarda tal cual lo produce el DTO, sin mapper de columnas para las claves internas. Máx 20 filas.
- `nuevo` → `mesesLegales` forzado a 36 (art. 120 TRLGDCU).
- `segunda_mano` → `mesesLegales` ≥ 12.
- Lista vacía → la página muestra la fila por defecto "Todos los productos · nuevo · 3 años".

`exclusiones_desistimiento`: `{ supuestos: CodigoArt103[], otras: string | null (max 500) }`. `CodigoArt103` es un enum en domain con los supuestos del art. 103 TRLGDCU (personalizados, perecederos, precintados por salud/higiene, mezclados inseparablemente, contenido digital precintado, prensa, etc.).

Zod valida el JSONB al escribir y al leer. Si al leer es inválido, se loguea y se usan los defaults: una fila corrupta no rompe la página pública.

Sin fila en `empresa_legal` → todos los defaults. Las páginas funcionan sin que el admin haya rellenado nada.

Migración conforme al checklist de `CLAUDE.md`:
- RLS con `AS RESTRICTIVE` para anon.
- Policies `TO authenticated` con `(SELECT get_mi_empresa_id())`.
- GRANTs explícitos a service_role y authenticated (sin anon).
- Se aplica con `supabase db push --linked`, seguido de `pnpm db:smoke`.

## Arquitectura

- **Domain** (`core/domain/`):
  - Tipo `EmpresaLegal`.
  - Constantes `MIN_DESISTIMIENTO_DIAS = 14`, `GARANTIA_NUEVO_MESES = 36`, `MIN_SEGUNDA_MANO_MESES = 12` y el enum `CodigoArt103` con sus etiquetas.
  - Interfaz `IEmpresaLegalRepository`.
- **Application:**
  - `empresa-legal.dto.ts`: Zod con suelos legales, `max()` en todos los strings y `safeParse`.
  - `GetLegalContextUseCase`: `empresa` + `empresa_legal` + flags derivados + modalidades de domicilio → `LegalContext` resuelto, con los fallbacks ya aplicados. Es lo que consumen las páginas.
  - `GetEmpresaLegalUseCase` / `UpdateEmpresaLegalUseCase` (admin).
- **Infra:** `SupabaseEmpresaLegalRepository` con upsert, mapper camelCase y reintento en lectura ante `/timeout|gateway/i`. Todo con `Result<T, AppError>`.
- **API:** `GET/PUT /api/admin/legal`.
  - `requireRole(['admin','superadmin'])`, CSRF y `?empresaId` para superadmin.
  - `try/catch` en `request.json()` y `handleResult`.
- **Lógica pura** (`src/lib/legal/`):
  - `paginas-legales.ts`: `paginasLegalesDe(ctx) → PaginaLegal[]` y `aplicaPagina(ctx, slug)`.
  - `subencargados.ts`: `subencargadosDe(ctx) → { proveedor, finalidad, pais }[]`.
  - `garantias.ts`: `garantiasVisibles(filas)`, que normaliza y aplica la fila por defecto.
  - `categorias-datos.ts`: los datos personales tratados según los flags.

## UI

- **Páginas públicas:** 5 rutas server (`force-dynamic`, dominio → `GetLegalContextUseCase`).
  - Componentes compartidos `LegalPage` / `Section` / `InfoTable`, extraídos de la `/privacidad` actual.
  - Estética editorial: Playfair 400 romana, filetes `border-foreground/10–15`, tokens del tenant, sin cursivas en los titulares.
  - Los textos adicionales se pintan como texto plano con `whitespace-pre-line`; nunca con `dangerouslySetInnerHTML`.
- **Admin:** entrada "Textos legales" en `admin-sidebar.tsx` → `/admin/legal`.
  - Pestañas: Aviso legal · Condiciones · Envíos · Devoluciones. Solo las que aplican al tenant.
  - Los datos de la empresa (razón social, NIF, dirección, email) se muestran en solo lectura, con un enlace a `/admin/configuracion`.
  - Editor de garantías con filas añadir/quitar. `nuevo` muestra "3 años (legal)" sin editar.
  - Exclusiones del art. 103 como casillas con su etiqueta legal.
  - Botón "Ver página" por pestaña.
  - Validación de los suelos en el cliente con el mismo esquema Zod.
- **Footer:** columna "Legal" generada con `paginasLegalesDe`. Sustituye el enlace suelto a privacidad.
- **SEO:** `sitemap.ts` incluye solo las páginas aplicables; canonical en cada una.

Todo el texto de UI del admin y del footer pasa por `t()` (bloque `es`, castellano de España con tuteo). Las páginas legales son solo castellano.

## Tests (TDD)

- `tests/compliance/legal-paginas-legales.test.ts`: matriz restaurante/tienda × `deliveryHabilitado` × `envioDomicilioHabilitado`.
- `tests/compliance/legal-subencargados.test.ts`: Redsys/Glovo según los flags; Brevo siempre, con la finalidad por flags.
- `tests/compliance/legal-garantias.test.ts`: lista vacía → fila por defecto; `nuevo` forzado a 36.
- `tests/compliance/legal-empresa-legal-dto.test.ts`: rechaza 13 días, 11 meses en segunda mano y strings por encima del max; acepta los límites exactos.
- `tests/core/legal/get-legal-context.test.ts`: fallbacks (email, dirección, `razonSocial` → `nombre`); sin fila → defaults; JSONB corrupto → defaults.
- `tests/ui/legal-aviso-legal.test.tsx`, `legal-condiciones.test.tsx`, `legal-envios.test.tsx`, `legal-privacidad.test.tsx`, `legal-devoluciones.test.tsx`: un restaurante no muestra envíos ni devoluciones; privacidad sin reparto no lista Glovo; los textos adicionales con `<script>` se muestran escapados.
- Sin test de ruta para `/api/admin/legal`: el repo no testea rutas API directamente; la validación de los suelos la cubre `tests/compliance/legal-empresa-legal-dto.test.ts` y el `handleResult` compartido ya está probado en otras rutas admin.

## Fuera de alcance

- Multidioma.
- Sustituir la plantilla por texto propio.
- Historial de versiones de los textos.
- Banner de cookies: se siguen usando solo cookies técnicas, y Vercel Analytics no usa cookies.
- Página de contacto.
