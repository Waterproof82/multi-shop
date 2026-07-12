# Sistema de Complementos por Producto

## Qué es

Sistema multi-grupo de complementos por producto (radio/checkbox), que coexiste con el sistema antiguo basado en categorías (`categoria_complemento_de` en `categorias`).

## Tablas DB

| Tabla | Descripción |
|---|---|
| `complemento_grupos` | Grupos reutilizables por tenant (nombre i18n, tipo radio/checkbox, obligatorio, orden) |
| `complemento_opciones` | Opciones dentro de cada grupo (nombre i18n, precio adicional, orden, activo) |
| `producto_complemento_grupos` | Join table: asigna grupos a productos con orden personalizable |

Migración: `supabase/migrations/20260711000001_complementos.sql`

## Arquitectura de capas

```
complemento-types.ts         → entidades de dominio (ComplementoGrupo, ComplementoOpcion)
IComplementoGrupoRepository  → interfaz del repositorio
supabase-complemento-grupo.repository.ts → implementación
ComplementoGrupoUseCase      → use case
complemento.dto.ts           → schemas Zod (create/update grupos, opciones, setProductoGrupos)
```

## API Routes

| Método | Path | Descripción |
|---|---|---|
| GET/POST | `/api/admin/complementos/grupos` | Listar/crear grupos del tenant |
| PATCH/DELETE | `/api/admin/complementos/grupos/[grupoId]` | Actualizar/eliminar grupo |
| POST | `/api/admin/complementos/grupos/[grupoId]/opciones` | Crear opción |
| PATCH/DELETE | `/api/admin/complementos/grupos/[grupoId]/opciones/[opcionId]` | Actualizar/eliminar opción |
| GET/PUT | `/api/admin/productos/[productoId]/complementos` | Obtener/asignar grupos a un producto |

## View Model del menú

`MenuItemVM` tiene dos campos:
- `complements?: ComplementVM[]` — sistema legacy (una sola categoría-complemento)
- `complementGroups?: ComplementGroupVM[]` — nuevo sistema multi-grupo

`getEffectiveGroups()` en `QuantitySelectorDialog` prioriza `complementGroups` si existen; si no, adapta `complements` al formato unificado `ComplementGroupVM`.

## Cómo se guardan en los pedidos

Los complementos seleccionados se pasan como `selectedComplements: { id, name, price }[]` en `PendingItem`. El use-case `pedido.use-case.ts` los serializa como `{ nombre, precio }` en `detalle_pedido[i].complementos`.

- Las opciones del **nuevo sistema** tienen ids que NO son `producto_id` — el use-case las salta en la validación de precio de productos (comentado: "New-system complement opciones are not products").
- Las opciones del **sistema legacy** sí eran productos — se valida el precio server-side.

## UI

- **Carta pública**: `QuantitySelectorDialog` — detecta grupos automáticamente con `getEffectiveGroups()`
- **TPV**: `MenuPanel.tsx` — `ComplementDialog` interno, misma lógica
- **Admin gestión**: `/admin/complementos` — página para crear/editar grupos y opciones
- **Admin asignación**: `ProductFormDialog` — tab "Complementos" para asignar grupos a un producto

## Trampas críticas

- **`revalidateTag` no existe en rutas de App Router sin `unstable_cache`** — no llamar `revalidateTag` en `/api/admin/productos/[productoId]/complementos`. Esta fue la causa del bug de TPV al cargar (TypeError undefined.id en MostradorClient).
- **`setProductoGrupos` es destructiva**: reemplaza TODOS los grupos del producto. El cliente debe enviar la lista completa de `grupoIds`, no un delta.
- **Backward compat**: el sistema legacy de `categoria_complemento_de` sigue activo y coexiste. No romper `get-menu.use-case.ts` que lo usa.
- **RLS**: todas las tablas tienen RLS + GRANTs explícitos para `service_role` y `authenticated`. Ver migración para el detalle.
