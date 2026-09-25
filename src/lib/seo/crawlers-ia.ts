// Crawlers de buscadores/asistentes de IA con regla EXPLICITA en robots.txt
// (GEO). El grupo `*` ya los deja pasar, pero declararlos:
// - deja constancia de que el acceso es deliberado (varios proveedores lo
//   recomiendan para aparecer citado en sus respuestas), y
// - hace facil cortar uno concreto (p. ej. los de ENTRENAMIENTO) sin tocar
//   al resto: basta sacarlo de esta lista y darle `disallow: "/"`.
//
// OJO: un grupo con user-agent propio REEMPLAZA al grupo `*` para ese bot, asi
// que cada uno debe llevar las mismas zonas bloqueadas (robots.ts se encarga).
export const CRAWLERS_IA_BUSQUEDA = [
  "OAI-SearchBot", // ChatGPT search
  "ChatGPT-User", // ChatGPT navegando por peticion del usuario
  "Claude-SearchBot",
  "Claude-User",
  "PerplexityBot",
  "Perplexity-User",
] as const;

export const CRAWLERS_IA_ENTRENAMIENTO = [
  "GPTBot",
  "ClaudeBot",
  "Google-Extended", // Gemini / AI Overviews
  "Applebot-Extended",
] as const;
