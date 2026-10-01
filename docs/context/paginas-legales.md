# Páginas legales por tenant

> Ver también: [seo-multitenant.md](./seo-multitenant.md) (sitemap/llms.txt) · [legal-compliance.md](./legal-compliance.md) (TPV/IVA-IGIC, distinto ámbito)

## Qué es

Cinco páginas públicas por tenant — `/aviso-legal`, `/privacidad`, `/condiciones`, `/envios-y-pagos`, `/devoluciones` — generadas por plantilla en código a partir de datos de `empresas` + la tabla `empresa_legal`, editables desde `/admin/legal`. Ninguna se rellena a mano por tenant: lo que varía es un conjunto de campos estructurados, todos validados contra suelos legales del TRLGDCU / RDL 1/2007.

## Qué páginas ve cada tenant

| Ruta | Restaurante | Tienda | Condición |
|---|---|---|---|
| `/aviso-legal` | sí | sí | Siempre |
| `/privacidad` | sí | sí | Siempre |
| `/condiciones` | sí | sí | Siempre |
| `/envios-y-pagos` | no | sí | `tipo === 'tienda'` && `envioDomicilioHabilitado` |
| `/devoluciones` | no | sí | `tipo === 'tienda'` |

Restaurante nunca tiene envíos ni devoluciones aunque use Glovo: vende perecederos (art. 103.d TRLGDCU), así que no hay derecho de desistimiento que gestionar; el reparto se explica dentro de `/condiciones`.

**`src/lib/legal/paginas-legales.ts` (`paginasLegalesDe` / `aplicaPagina`) es la ÚNICA fuente de verdad.** La consumen: el footer (columna "Legal"), `sitemap.ts`, `llms-txt.ts` y el 404 de cada página pública (vía `cargarContextoLegal`) y las pestañas de `/admin/legal`. Añadir una página nueva = añadir su regla ahí; si no, el footer/sitemap enlazan un 404 o la página queda sin pestaña de admin.

## Flujo dominio → página

```
dominio (headers)
  → getDomainFromHeaders() + resolverEmpresaPublica()
  → aplicaPagina(empresa, slug) — si no aplica, notFound()
  → getEmpresaLegalUseCase().getContext(empresaId)
  → LegalContext (con TODOS los fallbacks ya aplicados)
  → *Contenido (componente puro, sin lógica de "¿aplica?")
```

`src/lib/legal/cargar-contexto.ts::cargarContextoLegal(slug)` hace los tres primeros pasos. Un error de base de datos se LANZA (para que lo recoja `error.tsx`), nunca se convierte en un 404 silencioso — solo "no existe la empresa" o "la página no aplica a este tenant" son 404 legítimos.

Los componentes `*Contenido` (`src/components/legal/*.tsx`) reciben `LegalContext` ya resuelto y son puros: no consultan flags ni deciden nada, solo pintan.

## Suelos legales — validados en TRES sitios a propósito

| Sitio | Qué valida |
|---|---|
| Zod (`src/core/application/dtos/empresa-legal.dto.ts`) | Lo que escribe el admin desde `/admin/legal` |
| `CHECK` en `supabase/migrations/20260930000001_empresa_legal.sql` | Última barrera si alguien escribe fuera de la API |
| `garantiasVisibles()` (`src/lib/legal/garantias.ts`) | Al pintar la página pública — corrige de nuevo una fila guardada antes de un cambio de ley o escrita a mano en BD |

Nunca relajar uno pensando que otro lo cubre. Un tenant puede AMPLIAR derechos del consumidor (desistimiento > 14 días, garantía comercial extra), nunca recortarlos:

- `plazoDesistimientoDias`: mínimo 14 (art. 104 TRLGDCU), máximo 365.
- Garantía legal de producto **nuevo**: forzada a 36 meses (art. 120, tras RDL 7/2021) — no editable.
- Garantía legal de **segunda mano**: mínimo 12 meses (art. 120.1), sin techo.
- `PLAZO_REEMBOLSO_DIAS`: fijo en 14 días (art. 107), no configurable.

Constantes en `src/core/domain/legal/constantes.ts`.

## Migración `empresa_legal`

`supabase/migrations/20260930000001_empresa_legal.sql` — **aplicada el 2026-09-30** con `supabase db push --linked` + `pnpm db:smoke`. Verificado en vivo: RLS activa, policy RESTRICTIVE para anon, policies de admin `TO authenticated`, sin GRANTs a anon.

## `/privacidad` según el TPV del tenant

Desde el 2026-10-01 la política depende de `flags.tpvHabilitado` (ver `tpv-por-tenant.md`):

| | Con TPV | Sin TPV |
|---|---|---|
| Plazo (sección 5) | 5 años sin actividad | 3 años sin actividad |
| Finalidad que justifica guardar el pedido | "Obligaciones fiscales y contables" (art. 6.1.c, art. 66 LGT) | "Atención de garantías y reclamaciones" (art. 6.1.c y 6.1.f, garantía 3 años) |
| Qué se conserva tras anonimizar | Registros de pedidos y cobros exigidos por la normativa fiscal | Productos e importes, sin datos que identifiquen |

Las finalidades se construyen con `finalidadesAdicionales(flags)` (lista, numeradas por índice): no volver a un ternario para la numeración, se vuelve anidado en cuanto hay un caso más (S3358).

## Otras secciones de `/privacidad` (2026-09-30)

- **Encargado del tratamiento**: `FABRICANTE` (`src/lib/fabricante.ts`) — José Miguel Aristía Gordillo (Digitalizatenerife), persona física; NIF visible por decisión del titular. Cambiar de productor exige cambiar también `DECLARATION_DATE` (la declaración responsable del RD 1007/2023 la suscribe el productor) y firmar DPA nuevos con cada tenant.
- Derechos: incluye el art. 22 (decisiones automatizadas). Sección "Cómo ejercer sus derechos": sin exigir copia del DNI (desproporcionado según la AEPD), plazo de un mes (art. 12.3).
- Seguridad: medidas, notificación de brechas (arts. 33-34) y **copias de seguridad** cifradas con el bloqueo de datos suprimidos (art. 32 LOPDGDD). Solo se afirma porque `db-backup.yml` y el simulacro mensual están en verde (ver `copias-de-seguridad.md`).
- Sentry declarado con la grabación enmascarada de la sesión ante errores (`replaysOnErrorSampleRate: 1.0`).
- Cloudflare Inc. como subencargado (imágenes y copias de seguridad en R2).

## Formulario de desistimiento (Anexo B) y retención del reembolso (art. 107.3)

- `DevolucionesContenido` (`src/components/legal/devoluciones-contenido.tsx`) incluye el modelo de formulario de desistimiento del Anexo B del TRLGDCU, con el texto literal oficial (no es obligatorio para el consumidor usarlo, pero el texto sí debe ser el del anexo si se ofrece):
  - "Nombre del consumidor y usuario o de los consumidores y usuarios:"
  - "Domicilio del consumidor y usuario o de los consumidores y usuarios:"
  - "Firma del consumidor y usuario o de los consumidores y usuarios (solo si el presente formulario se presenta en papel):"
- El destinatario del formulario (`construirDestinatario`) se construye con nombre, dirección, email y **teléfono** del titular, en ese orden, omitiendo los que sean `null`.
- El reembolso puede retenerse "hasta haber recibido el producto o hasta que el consumidor presente una prueba de su devolución, lo que ocurra primero" (art. 107.3 TRLGDCU) — no basta con "hasta recibir el producto", que es una redacción incompleta y menos favorable a la empresa.

## Sin enlace a la plataforma ODR de la UE

`/condiciones` y `/devoluciones` NO enlazan a la plataforma de resolución de litigios en línea de la Comisión Europea. El Reglamento (UE) 524/2013 que la creaba fue derogado por el Reglamento (UE) 2024/3228; la plataforma cerró el 20 de julio de 2025. Añadir ese enlace sería remitir a un servicio inexistente.

## Subencargados (`/privacidad`)

`src/lib/legal/subencargados.ts::subencargadosDe(flags)` decide qué proveedores aparecen y por qué, todo derivado de flags — nunca texto fijo:

| Proveedor | Condición |
|---|---|
| Supabase, Vercel, Cloudflare (R2), Sentry | Siempre |
| Brevo | Siempre. Finalidad construida por flags: "confirmación de pedidos" (siempre) + "seguimiento de envíos" (`envioDomicilioHabilitado`) + "promociones" (`descuentoBienvenidaActivo`) |
| Redsys | `pagoTarjetaActivo` (derivado de `redsys_merchant_code IS NOT NULL`; el código nunca sale del repositorio) |
| Glovo | `deliveryHabilitado` (reparto de restaurante) |

Si se integra un proveedor nuevo que reciba datos personales, añadirlo aquí con su condición — si no, la política de privacidad miente por omisión.

`src/lib/legal/categorias-datos.ts::categoriasDatosDe(flags)` sigue el mismo patrón para las categorías de datos tratados: la dirección de entrega solo se declara si `deliveryHabilitado || envioDomicilioHabilitado`.

## Trampa de horas en `modalidades_entrega`

`/envios-y-pagos` pinta la tabla de modalidades de domicilio con `modalidades_entrega.tiempo_min_minutos` / `tiempo_max_minutos`, que pese al nombre guardan **HORAS**. Reutilizar `formatRangoHorasModalidad` (`src/lib/modalidad-entrega-iconos.ts`), nunca convertir como si fueran minutos.

## Cómo añadir una página legal nueva

1. Añadir la regla en `REGLAS` de `src/lib/legal/paginas-legales.ts` (slug, `labelKey`, función `aplica`).
2. Añadir la clave de traducción del footer (`footerXxx`) en los 5 idiomas de `src/lib/translations.ts`.
3. Crear el componente `*Contenido` puro en `src/components/legal/` (recibe `LegalContext`, sin lógica de "¿aplica?").
4. Crear `src/app/<slug>/page.tsx` como wrapper server (`force-dynamic`, llama a `cargarContextoLegal('<slug>')`).
5. Añadir la pestaña en `src/components/admin/legal/LegalSettingsForm.tsx` (`PESTANAS`) si hay campos editables.
6. Si hay campos nuevos: tipo en `EmpresaLegal`, columna + `CHECK` en una migración nueva, Zod en `empresa-legal.dto.ts`, mapper en `SupabaseEmpresaLegalRepository`.

## Tests

| Fichero | Qué fija |
|---|---|
| `tests/compliance/legal-paginas-legales.test.ts` | Matriz restaurante/tienda × `deliveryHabilitado` × `envioDomicilioHabilitado` |
| `tests/compliance/legal-subencargados.test.ts` | Redsys/Glovo según flags; Brevo siempre, finalidad por flags |
| `tests/compliance/legal-garantias.test.ts` | Lista vacía → fila por defecto; `nuevo` forzado a 36 meses |
| `tests/compliance/legal-empresa-legal-dto.test.ts` | Rechaza 13 días, 11 meses en segunda mano, strings por encima del max; lectura defensiva del JSONB |
| `tests/ui/legal-devoluciones.test.tsx` | Plazo, reembolso (art. 107.3), exclusiones, garantías, formulario Anexo B con destinatario (incluido teléfono) |
| `tests/ui/legal-aviso-legal.test.tsx`, `legal-condiciones.test.tsx`, `legal-envios.test.tsx`, `legal-privacidad.test.tsx` | Un componente por página: fallbacks, textos adicionales escapados, secciones condicionales por flags |
| `tests/ui/legal-layout.test.tsx` | `LegalPage` / `Section` / `InfoTable` compartidos |
| `tests/ui/legal-settings-form.test.tsx` | Pestañas del admin, solo las que aplican al tenant; guardado y errores de validación |
| `tests/ui/site-footer-legal.test.tsx` | Columna "Legal" del footer con `paginasLegalesDe` |
| `tests/core/legal/get-legal-context.test.ts` | Fallbacks del `LegalContext` (email, dirección, `razonSocial` → `nombre`); sin fila → defaults; JSONB corrupto → defaults |
