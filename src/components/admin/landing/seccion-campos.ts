import type { LandingSeccionTipo } from "@/core/domain/entities/types";

export type CampoConfig =
  | { key: string; kind: "texto"; label: string; multiline?: boolean }
  | { key: string; kind: "imagen"; label: string }
  | { key: string; kind: "url"; label: string }
  | { key: "imagenes"; kind: "galeria"; label: string };

export const SECCION_CAMPOS: Record<LandingSeccionTipo, CampoConfig[]> = {
  hero: [
    { key: "kicker", kind: "texto", label: "Kicker" },
    { key: "titulo", kind: "texto", label: "Título (usa *así* para resaltar una parte)" },
    { key: "descripcion", kind: "texto", label: "Descripción", multiline: true },
    { key: "imagenUrl", kind: "imagen", label: "Imagen de fondo" },
    { key: "ctaSecundariaTexto", kind: "texto", label: "Texto del botón secundario" },
    { key: "ctaSecundariaUrl", kind: "url", label: "URL del botón secundario" },
    { key: "horario", kind: "texto", label: "Horario" },
    { key: "marquee", kind: "texto", label: "Cinta animada (palabras separadas por comas)" },
  ],
  nosotros: [
    { key: "kicker", kind: "texto", label: "Kicker" },
    { key: "titulo", kind: "texto", label: "Título (usa *así* para resaltar una parte)" },
    { key: "descripcion", kind: "texto", label: "Descripción", multiline: true },
    { key: "imagenUrl", kind: "imagen", label: "Imagen" },
  ],
  cta_carta: [
    { key: "kicker", kind: "texto", label: "Kicker" },
    { key: "titulo", kind: "texto", label: "Título (usa *así* para resaltar una parte)" },
    { key: "descripcion", kind: "texto", label: "Descripción", multiline: true },
    { key: "ctaSecundariaTexto", kind: "texto", label: "Texto del botón secundario" },
    { key: "ctaSecundariaUrl", kind: "url", label: "URL del botón secundario" },
  ],
  testimonio: [
    { key: "texto", kind: "texto", label: "Cita", multiline: true },
    { key: "autor", kind: "texto", label: "Autor / atribución" },
  ],
  galeria: [
    { key: "kicker", kind: "texto", label: "Kicker" },
    { key: "titulo", kind: "texto", label: "Título (usa *así* para resaltar una parte)" },
    { key: "imagenes", kind: "galeria", label: "Imágenes" },
  ],
  visitanos: [
    { key: "kicker", kind: "texto", label: "Kicker" },
    { key: "titulo", kind: "texto", label: "Título (usa *así* para resaltar una parte)" },
    { key: "horario", kind: "texto", label: "Horario" },
  ],
};
