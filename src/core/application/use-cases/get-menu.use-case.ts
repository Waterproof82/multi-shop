import type { IProductRepository } from "@/core/domain/repositories/IProductRepository";
import type { ICategoryRepository } from "@/core/domain/repositories/ICategoryRepository";
import type { IComplementoGrupoRepository } from '@/core/domain/repositories/IComplementoGrupoRepository';
import type { IMenuVirtualRepository } from "@/core/domain/repositories/IMenuVirtualRepository";
import type { MenuCategoryVM } from "@/core/application/dtos/menu-view-model";
import type { Category, Product } from "@/core/domain/entities/types";
import type { ComplementoGrupo, ProductoComplementoAsignacion } from '@/core/domain/entities/complemento-types';
import { MenuMapper, mapComplementoGrupoToGroupVM } from "@/core/application/mappers/menu.mapper";
import { logger } from "@/core/infrastructure/logging/logger";

/**
 * Grupos de complementos de cada producto, en el orden en que deben mostrarse.
 *
 * El orden sale de `asignacion.orden`, no del orden en que la base devuelva las
 * filas: es lo que decide si al cliente le aparece primero "Punto de la carne" o
 * "Guarnición", y eso lo configura el restaurante.
 */
export function agruparComplementosPorProducto(
  asignaciones: ProductoComplementoAsignacion[],
  grupos: ComplementoGrupo[],
): Map<string, ComplementoGrupo[]> {
  const gruposPorId = new Map(grupos.map(g => [g.id, g]));
  const porProducto = new Map<string, ComplementoGrupo[]>();

  for (const asignacion of [...asignaciones].sort((a, b) => a.orden - b.orden)) {
    const grupo = gruposPorId.get(asignacion.grupoId);
    if (!grupo) continue;
    porProducto.set(asignacion.productoId, [...(porProducto.get(asignacion.productoId) ?? []), grupo]);
  }

  return porProducto;
}

/**
 * Lo que aporta cada categoría-complemento a su categoría padre.
 *
 * En el sistema legacy una categoría entera puede ser "los complementos de otra"
 * (`categoriaComplementoDe`). De ahí salen cuatro cosas distintas indexadas por
 * la categoría padre, y recorrer la lista cuatro veces por separado era parte de
 * lo que hinchaba este caso de uso.
 */
interface IndiceComplementos {
  productos: Map<string, Product[]>;
  obligatorio: Map<string, boolean>;
  nombre: Map<string, string>;
  traducciones: Map<string, Category['translations']>;
}

export function indexarCategoriasComplemento(
  categoriasComplemento: Category[],
  productos: Product[],
): IndiceComplementos {
  const indice: IndiceComplementos = {
    productos: new Map(), obligatorio: new Map(), nombre: new Map(), traducciones: new Map(),
  };

  for (const categoria of categoriasComplemento) {
    const padreId = categoria.categoriaComplementoDe;
    if (!padreId) continue;

    // Solo productos activos: un complemento desactivado no debe poder pedirse.
    const suyos = productos.filter(p => p.categoriaId === categoria.id && p.activo);
    indice.productos.set(padreId, [...(indice.productos.get(padreId) ?? []), ...suyos]);

    indice.obligatorio.set(padreId, categoria.complementoObligatorio);
    if (categoria.nombre) indice.nombre.set(padreId, categoria.nombre);
    if (categoria.translations) indice.traducciones.set(padreId, categoria.translations);
  }

  return indice;
}

/** Agrupa por clave, conservando el orden de entrada dentro de cada grupo. */
function agruparPor<T>(elementos: T[], clave: (e: T) => string): Map<string, T[]> {
  const mapa = new Map<string, T[]>();
  for (const elemento of elementos) {
    const k = clave(elemento);
    mapa.set(k, [...(mapa.get(k) ?? []), elemento]);
  }
  return mapa;
}

const porOrden = (a: Category, b: Category) => (a.orden || 0) - (b.orden || 0);

export class GetMenuUseCase {
  constructor(
    private readonly productRepo: IProductRepository,
    private readonly categoryRepo: ICategoryRepository,
    private readonly complementoRepo: IComplementoGrupoRepository,
    private readonly menuVirtualRepo: IMenuVirtualRepository,
  ) {}

  /**
   * Grupos de complementos del sistema nuevo (`complemento_grupos`).
   *
   * Si cualquiera de las dos consultas falla se devuelve un mapa vacío en lugar
   * de propagar el error: sin complementos la carta se sirve igual, y un fallo
   * aquí no debe dejar al cliente sin poder pedir.
   */
  private async cargarComplementos(empresaId: string, productos: Product[]): Promise<Map<string, ComplementoGrupo[]>> {
    const idsActivos = productos.filter(p => p.activo).map(p => p.id);

    const [asignaciones, grupos] = await Promise.all([
      this.complementoRepo.findAssignmentsByProductos(idsActivos, empresaId),
      this.complementoRepo.findAllByTenant(empresaId),
    ]);

    if (!asignaciones.success || !grupos.success) return new Map();
    return agruparComplementosPorProducto(asignaciones.data, grupos.data);
  }

  /**
   * Menús virtuales (ver docs/superpowers/specs/2026-09-16-menus-virtuales-design.md).
   * Best-effort: si cualquiera de las dos consultas falla, la carta se sirve
   * igual sin menús virtuales — mismo criterio que cargarComplementos.
   */
  private async construirMenusVirtuales(
    empresaId: string,
    productos: Product[],
    categoriasPorId: Map<string, Category>,
    gruposPorProducto: Map<string, ComplementoGrupo[]>,
  ): Promise<MenuCategoryVM[]> {
    const [nodos, asignaciones] = await Promise.all([
      this.menuVirtualRepo.findAllByTenant(empresaId),
      this.menuVirtualRepo.findAsignacionesByTenant(empresaId),
    ]);

    if (!nodos.success || !asignaciones.success) return [];

    const asignacionesPorNodo = agruparPor(asignaciones.data, a => a.menuVirtualId)
      .entries();
    const productoIdsPorNodo = new Map(
      [...asignacionesPorNodo].map(([menuVirtualId, asigs]) => [menuVirtualId, asigs.map(a => a.productoId)])
    );
    const productosPorId = new Map(productos.map(p => [p.id, p]));
    const padres = nodos.data.filter(m => !m.padreId).sort((a, b) => a.orden - b.orden);
    const hijosPorPadre = agruparPor(nodos.data.filter(m => m.padreId), m => m.padreId!);

    // toVirtualCategoryVM espera el tipo VIEW-MODEL (ComplementGroupVM), no el
    // de dominio (ComplementoGrupo) — misma conversión que toCategoryVM hace
    // internamente, reutilizando la función ahora exportada (Step 0).
    const gruposVMPorProducto = new Map(
      [...gruposPorProducto.entries()].map(([productoId, grupos]) => [productoId, grupos.map(mapComplementoGrupoToGroupVM)])
    );

    return padres.map(padre => MenuMapper.toVirtualCategoryVM(
      padre,
      hijosPorPadre.get(padre.id) ?? [],
      productoIdsPorNodo,
      productosPorId,
      categoriasPorId,
      gruposVMPorProducto,
    ));
  }

  /**
   * Carta pública de la empresa: categorías con sus productos, subcategorías y
   * complementos, listas para pintar.
   */
  async execute(empresaId: string): Promise<{ data?: MenuCategoryVM[]; error?: string }> {
    try {
      const [productos, categorias] = await Promise.all([
        this.productRepo.findAllByTenant(empresaId),
        this.categoryRepo.findAllByTenant(empresaId),
      ]);

      // El repositorio ya loguea el fallo con su propio código (DB_SELECT_ERROR,
      // etc.) antes de devolver el Result — volver a loguearlo aquí duplicaba
      // el evento en Sentry para un mismo incidente.
      if (!productos.success) {
        return { error: productos.error.message };
      }
      if (!categorias.success) {
        return { error: categorias.error.message };
      }

      const gruposPorProducto = await this.cargarComplementos(empresaId, productos.data);

      const complementos = indexarCategoriasComplemento(
        categorias.data.filter(c => c.categoriaComplementoDe),
        productos.data,
      );

      const principales = categorias.data.filter(c => !c.categoriaComplementoDe);
      const padres = principales.filter(c => !c.categoriaPadreId).sort(porOrden);
      const subcategorias = agruparPor(
        principales.filter(c => c.categoriaPadreId).sort(porOrden),
        c => c.categoriaPadreId!,
      );
      const categoriasPorId = new Map(categorias.data.map(c => [c.id, c]));

      const menu = padres.map(padre => MenuMapper.toCategoryVM(
        padre,
        productos.data,
        subcategorias.get(padre.id) ?? [],
        complementos.productos.get(padre.id) ?? [],
        complementos.obligatorio.get(padre.id) ?? false,
        categoriasPorId,
        productos.data,
        complementos.nombre.get(padre.id),
        complementos.traducciones.get(padre.id),
        gruposPorProducto,
      ));

      const menuVirtualVMs = await this.construirMenusVirtuales(empresaId, productos.data, categoriasPorId, gruposPorProducto);

      // Categorías reales y menús virtuales se intercalan por `orden` — el
      // admin elige la posición relativa de ambos tipos de nodo desde sus
      // respectivas pantallas, en vez de que los virtuales queden siempre al
      // final. Sort estable (garantizado desde ES2019): a igual `orden`,
      // las categorías reales mantienen su posición antes que las virtuales,
      // que es el orden en que llegan en el spread.
      const todasLasCategorias = [...menu, ...menuVirtualVMs].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));

      // Una categoría sin nada que ofrecer no se pinta: dejaría un encabezado
      // vacío en la carta del cliente. Aplica igual a categorías reales y a
      // menús virtuales — toVirtualCategoryVM puebla `items` con la unión de
      // sus hojas justo para que este mismo filtro los alcance.
      return { data: todasLasCategorias.filter(categoria => categoria.items.length > 0) };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'use-case', 'GetMenuUseCase.execute', { empresaId });
      return { error: appError.message };
    }
  }
}
