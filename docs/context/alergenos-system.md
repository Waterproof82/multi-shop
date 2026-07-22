# Sistema de Alérgenos por Producto

## Qué es

Etiquetado de alérgenos por producto conforme al Reglamento UE 1169/2011, Anexo II. El administrador selecciona los alérgenos de cada producto desde el panel de admin; la carta pública los muestra como iconos SVG inline con nombre traducido.

## Regulación aplicable

**Reglamento (UE) N.º 1169/2011 — Anexo II**: 14 sustancias o productos que causan alergias o intolerancias que deben declararse obligatoriamente en la información alimentaria.

## Almacenamiento en DB

| Tabla | Columna | Tipo | Default |
|---|---|---|---|
| `productos` | `alergenos` | `text[] NOT NULL` | `'{}'::text[]` |

Migración: `supabase/migrations/20260722000001_productos_alergenos.sql`

No requiere RLS ni GRANTs adicionales — hereda las policies y grants existentes de la tabla `productos`.

## Códigos válidos (14 alérgenos EU)

| Código | ES | EN | FR | IT | DE |
|---|---|---|---|---|---|
| `gluten` | Cereales con gluten | Cereals containing gluten | Céréales contenant du gluten | Cereali contenenti glutine | Glutenhaltiges Getreide |
| `crustaceans` | Crustáceos | Crustaceans | Crustacés | Crostacei | Krebstiere |
| `eggs` | Huevos | Eggs | Œufs | Uova | Eier |
| `fish` | Pescado | Fish | Poisson | Pesce | Fisch |
| `peanuts` | Cacahuetes | Peanuts | Arachides | Arachidi | Erdnüsse |
| `soy` | Soja | Soybeans | Soja | Soia | Sojabohnen |
| `milk` | Leche | Milk | Lait | Latte | Milch |
| `nuts` | Frutos de cáscara | Nuts | Fruits à coque | Frutta a guscio | Schalenfrüchte |
| `celery` | Apio | Celery | Céleri | Sedano | Sellerie |
| `mustard` | Mostaza | Mustard | Moutarde | Senape | Senf |
| `sesame` | Granos de sésamo | Sesame seeds | Graines de sésame | Semi di sesamo | Sesamsamen |
| `sulphites` | Dióxido de azufre y sulfitos | Sulphur dioxide and sulphites | Anhydride sulfureux et sulfites | Anidride solforosa e solfiti | Schwefeldioxid und Sulfite |
| `lupin` | Altramuces | Lupin | Lupin | Lupini | Lupinen |
| `molluscs` | Moluscos | Molluscs | Mollusques | Molluschi | Weichtiere |

La validación Zod usa `z.enum([...14 valores...])` — códigos fuera de esta lista son rechazados server-side.

## Arquitectura de capas

```
tipos.ts (Product.alergenos: string[])
  ↓
SupabaseProductRepository — mapToDomain + allowlist mapUpdateProductPayload
  ↓
product.dto.ts — z.array(z.enum([14 códigos]))
  ↓
PATCH /api/admin/productos/[id] — toAdminProduct() incluye alergenos
  ↓
menu-view-model.ts (MenuItemVM.alergenos?: string[])
  ↓
menu.mapper.ts — mapProductToItem() pasa alergenos
  ↓
menu-section.tsx — AllergenBadges (cards) + AllergenList (dialog)
```

## Componentes

Todos en `src/components/allergen-icons.tsx`.

### `AllergenIcon`
Dispatcher de iconos SVG. Recibe un código y renderiza el SVG correspondiente.
```tsx
<AllergenIcon allergen="gluten" className="w-5 h-5" />
```
Usa `ALLERGEN_ICON_MAP` (Record estático). No es tree-shakeable por diseño — los 14 íconos suman ~2 KB gzip.

### `AllergenBadges`
Fila de iconos pequeños para las cards del menú público. Devuelve `null` si `alergenos` está vacío.
```tsx
<AllergenBadges alergenos={item.alergenos} className="mt-1" />
```

### `AllergenList`
Lista con icono + nombre traducido para el dialog de detalle. Icono a `w-5 h-5` (20px mínimo).
```tsx
<AllergenList alergenos={item.alergenos} language={language} />
```
El título de sección usa `t('allergensSectionTitle', language)`.

### `AllergenSelector`
Sub-componente dentro de `ProductFormDialog`. Grid de 14 checkboxes (icono + nombre). Controlado, sin fetch — los alérgenos se guardan como parte del payload principal del formulario.
```tsx
<AllergenSelector
  selected={formData.alergenos}
  onChange={(alergenos) => setFormData(prev => ({ ...prev, alergenos }))}
  language={language}
/>
```

## Traducciones

Claves en `src/lib/translations.ts`:

```
allergenGluten, allergenCrustaceans, allergenEggs, allergenFish,
allergenPeanuts, allergenSoy, allergenMilk, allergenNuts,
allergenCelery, allergenMustard, allergenSesame, allergenSulphites,
allergenLupin, allergenMolluscs, allergensSectionTitle
```

Todas presentes en ES / EN / FR / IT / DE.

## Trampas conocidas

- **`mapUpdateProductPayload` tiene allowlist explícita** en `SupabaseProductRepository` (~línea 183). Si se añaden campos nuevos a `Product`, deben agregarse manualmente a esa lista o se descartan silenciosamente.
- **`allergenDairy` y `allergenTreeNuts`** son claves legacy que ya existían en ES y EN antes de este cambio (apuntaban a Leche y Frutos de cáscara). No confundir con `allergenMilk` y `allergenNuts` (los códigos de DB). Las claves legacy se mantienen por compatibilidad con código existente.
- **No hay campo `allergen` en `pedidos.detalle_pedido`** — los alérgenos son informativos para el cliente en la carta, no viajan al pipeline de cocina/bar.
- **`AllergenSelector.language` tipado como `string`** (no `Language`) para evitar acoplamiento entre módulos. Internamente hace cast a `Parameters<typeof t>[1]`.
