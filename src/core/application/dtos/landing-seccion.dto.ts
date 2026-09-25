import { z } from 'zod';
import { LANDING_SECCION_TIPOS, type LandingSeccionTipo } from '@/core/domain/entities/types';

const translatableTextSchema = z.object({
  es: z.string().max(2000).nullable().optional(),
  en: z.string().max(2000).nullable().optional(),
  fr: z.string().max(2000).nullable().optional(),
  it: z.string().max(2000).nullable().optional(),
  de: z.string().max(2000).nullable().optional(),
});

const heroContenidoSchema = z.object({
  kicker: translatableTextSchema.optional(),
  titulo: translatableTextSchema.optional(),
  descripcion: translatableTextSchema.optional(),
  imagenUrl: z.string().max(2000).nullable().optional(),
  ctaSecundariaTexto: translatableTextSchema.optional(),
  ctaSecundariaUrl: z.string().max(2000).nullable().optional(),
  horario: translatableTextSchema.optional(),
  marquee: translatableTextSchema.optional(),
});

const nosotrosContenidoSchema = z.object({
  kicker: translatableTextSchema.optional(),
  titulo: translatableTextSchema.optional(),
  descripcion: translatableTextSchema.optional(),
  imagenUrl: z.string().max(2000).nullable().optional(),
});

const ctaCartaContenidoSchema = z.object({
  kicker: translatableTextSchema.optional(),
  titulo: translatableTextSchema.optional(),
  descripcion: translatableTextSchema.optional(),
  ctaSecundariaTexto: translatableTextSchema.optional(),
  ctaSecundariaUrl: z.string().max(2000).nullable().optional(),
});

const testimonioContenidoSchema = z.object({
  texto: translatableTextSchema.optional(),
  autor: translatableTextSchema.optional(),
});

const galeriaContenidoSchema = z.object({
  kicker: translatableTextSchema.optional(),
  titulo: translatableTextSchema.optional(),
  imagenes: z.array(z.string().max(2000)).max(20).default([]),
});

const visitanosContenidoSchema = z.object({
  kicker: translatableTextSchema.optional(),
  titulo: translatableTextSchema.optional(),
  horario: translatableTextSchema.optional(),
});

const contenidoSchemaPorTipo = {
  hero: heroContenidoSchema,
  nosotros: nosotrosContenidoSchema,
  cta_carta: ctaCartaContenidoSchema,
  testimonio: testimonioContenidoSchema,
  galeria: galeriaContenidoSchema,
  visitanos: visitanosContenidoSchema,
} satisfies Record<LandingSeccionTipo, z.ZodTypeAny>;

export const upsertLandingSeccionSchema = z.object({
  activo: z.boolean(),
  orden: z.number().int().min(0).max(100).default(0),
  contenido: z.record(z.string(), z.unknown()),
});

// strict: los switches del superadmin solo togglean; un campo extra no puede colarse y pisar orden/contenido.
export const setActivoLandingSeccionSchema = z.object({ activo: z.boolean() }).strict();

export type UpsertLandingSeccionDTO = z.infer<typeof upsertLandingSeccionSchema>;

// DESVIACIÓN respecto al código dado en la tarea (`z.ZodType` genérico sin
// parámetros + tipo de retorno sin anotar): el código de la tarea no
// compilaba bajo Zod 4.6.2 + TypeScript estricto. Dos problemas separados:
//
// 1. `tipo` debe ser GENÉRICO (`<T extends LandingSeccionTipo>`), no
//    `LandingSeccionTipo` a secas. Con el parámetro no genérico,
//    `contenidoSchemaPorTipo[tipo]` se tipa como la UNIÓN de los 6 schemas —
//    TypeScript no correlaciona el valor concreto de `tipo` en cada llamada
//    con la clave del lookup (las "correlated unions" no se resuelven solas
//    en un simple indexed access). Un caller que hace
//    `parseContenidoPorTipo('galeria', x).data.imagenes` no compilaba: esa
//    propiedad no existe en las otras 5 ramas de la unión resultante.
// 2. Aun con `tipo` genérico, TypeScript sigue sin inferir automáticamente
//    el tipo de retorno correcto a partir del CUERPO de una función
//    genérica cuando el valor devuelto viene de invocar un método (`.safeParse`)
//    sobre un indexed access genérico (`map[T]`) — confirmado con un repro
//    aislado. Hace falta anotar explícitamente el tipo de retorno con el
//    indexed access type (`(typeof contenidoSchemaPorTipo)[T]['safeParse']`)
//    y un cast interno; así cada call site con un literal (`'galeria'`, etc.)
//    sí resuelve al schema exacto. El comportamiento en runtime no cambia:
//    sigue siendo un único lookup + safeParse.
export function parseContenidoPorTipo<T extends LandingSeccionTipo>(
  tipo: T,
  contenido: unknown,
): ReturnType<(typeof contenidoSchemaPorTipo)[T]['safeParse']> {
  return contenidoSchemaPorTipo[tipo].safeParse(contenido) as ReturnType<
    (typeof contenidoSchemaPorTipo)[T]['safeParse']
  >;
}

export { LANDING_SECCION_TIPOS };
