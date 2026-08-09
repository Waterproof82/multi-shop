/**
 * Reglas de visibilidad del WaiterBanner.
 *
 * El banner se monta en TODAS las paginas de la app, asi que decidir donde NO
 * aparece es la mitad de su comportamiento. Estaba resuelto con ocho
 * `if (...) return null` seguidos dentro del componente: cada uno correcto,
 * ninguno con nombre, y entre todos la mayor parte de su complejidad cognitiva.
 *
 * Aqui cada regla es una fila con su motivo. Se evaluan en orden y gana la
 * primera: el orden es parte del contrato (ver `auth-sin-comprobar`).
 * Congelado en `tests/compliance/waiter-banner-visibilidad.test.ts`.
 */

export type ContextoBanner = Readonly<{
  /** Ya se resolvio la llamada a `/api/waiter/me`. */
  authChecked: boolean;
  isWaiter: boolean;
  pathname: string;
  /** El camarero tiene una mesa seleccionada en sessionStorage. */
  hasMesa: boolean;
}>;

export type MotivoOculto =
  | 'auth-sin-comprobar'
  | 'no-es-camarero'
  | 'panel-de-gestion'
  | 'cocina-tiene-cabecera-propia'
  | 'pagina-de-cliente'
  | 'mesa-de-cliente-sin-impersonar'
  | 'tienda-sin-mesa';

type Regla = Readonly<{
  motivo: MotivoOculto;
  oculta: (ctx: ContextoBanner) => boolean;
}>;

const REGLAS: readonly Regla[] = [
  // Primero, siempre: `isWaiter` arranca en false. Si "no es camarero" ganara
  // a "aun no lo se", el primer render de cada carga seria un fallo de auth.
  { motivo: 'auth-sin-comprobar', oculta: (c) => !c.authChecked },
  { motivo: 'no-es-camarero', oculta: (c) => !c.isWaiter },

  // Admin, superadmin y TPV nunca son contexto de camarero.
  {
    motivo: 'panel-de-gestion',
    oculta: (c) =>
      c.pathname.startsWith('/admin') ||
      c.pathname.startsWith('/superadmin') ||
      c.pathname.startsWith('/tpv'),
  },

  // `/kitchen` (la pantalla fija de cocina) trae su propia cabecera.
  // Ojo: `/waiter/kitchen` es otra pantalla y esta si lleva banner.
  { motivo: 'cocina-tiene-cabecera-propia', oculta: (c) => c.pathname.startsWith('/kitchen') },

  // El seguimiento del pedido lo mira el comensal desde su movil.
  { motivo: 'pagina-de-cliente', oculta: (c) => c.pathname.startsWith('/tracking/') },

  // En las pantallas de cliente el banner solo aparece si el camarero esta
  // actuando en nombre de una mesa concreta.
  { motivo: 'mesa-de-cliente-sin-impersonar', oculta: (c) => c.pathname.startsWith('/mesa/') && !c.hasMesa },
  { motivo: 'tienda-sin-mesa', oculta: (c) => c.pathname === '/' && !c.hasMesa },
];

/** `null` = se pinta. Cualquier otro valor nombra por que no. */
export function motivoParaOcultarBanner(ctx: ContextoBanner): MotivoOculto | null {
  return REGLAS.find((regla) => regla.oculta(ctx))?.motivo ?? null;
}

/** Claves de traduccion de las secciones que el banner rotula. */
type ClaveSeccion = 'waiterKitchen' | 'waiterBar';

const SECCION_POR_RUTA: Readonly<Record<string, ClaveSeccion>> = {
  '/waiter/kitchen': 'waiterKitchen',
  '/waiter/bar': 'waiterBar',
};

/**
 * Rotulo de seccion del banner, o `null` si la ruta no es una seccion.
 * Coincidencia EXACTA: `/waiter/kitchen/historial` no es la cocina.
 */
export function seccionDeRuta(pathname: string): ClaveSeccion | null {
  return SECCION_POR_RUTA[pathname] ?? null;
}
