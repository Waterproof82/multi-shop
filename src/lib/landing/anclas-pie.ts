import type { LandingSeccion } from "@/core/domain/entities/types";

/** Apartados de la landing enlazables por ancla (los `id` de cada `<section>`). */
export type SeccionAncla = "nosotros" | "galeria" | "donde-estamos";

// Modulo sin "use client": lo usan la landing (cliente) y carta-route (servidor).
// Un Server Component no puede ejecutar funciones de un modulo "use client".
export function imagenesValidas(contenido: Record<string, unknown>): string[] {
  if (!Array.isArray(contenido.imagenes)) return [];
  return contenido.imagenes.filter((url): url is string => typeof url === "string" && url.length > 0);
}

// Solo secciones que se pintan: la galeria sin fotos devuelve null y su
// ancla quedaria rota.
function anclaDeSeccion(seccion: LandingSeccion): SeccionAncla | null {
  if (seccion.tipo === "nosotros") return "nosotros";
  if (seccion.tipo === "visitanos") return "donde-estamos";
  if (seccion.tipo === "galeria" && imagenesValidas(seccion.contenido).length > 0) return "galeria";
  return null;
}

/** Anclas del pie de pagina, en el orden de la landing y sin repetir. */
export function anclasDelPie(sections: readonly LandingSeccion[]): SeccionAncla[] {
  return [...new Set(sections.map(anclaDeSeccion).filter((a): a is SeccionAncla => a !== null))];
}
