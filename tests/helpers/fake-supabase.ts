/**
 * Doble de prueba del cliente de Supabase.
 *
 * POR QUÉ EXISTE
 * Los casos de uso de este repo llaman a `getSupabaseClient()` y encadenan el
 * query builder (`.from().select().eq().maybeSingle()`). Para poder probarlos
 * sin base de datos hace falta un objeto que hable ese mismo idioma: encadenar
 * todo y resolver al final con lo que el test haya preparado.
 *
 * QUÉ GARANTIZA Y QUÉ NO
 * NO es un motor SQL: no filtra ni ordena nada. Devuelve lo que se le dijo, por
 * tabla y operación. Sirve para fijar el COMPORTAMIENTO del caso de uso —qué
 * ramas toma, en qué orden escribe, qué devuelve— que es justo lo que hay que
 * congelar antes de refactorizar. No sirve para validar consultas.
 *
 * Registra cada operación en `llamadas`, así que un test puede afirmar tanto el
 * resultado como los efectos: qué tablas se tocaron, con qué payload y en qué
 * orden. En un webhook de cobro ese orden ES la corrección.
 */

export interface LlamadaRegistrada {
  tabla: string;
  operacion: 'select' | 'insert' | 'update' | 'delete';
  payload?: unknown;
  filtros: Record<string, unknown>;
}

export interface RespuestaPreparada {
  data?: unknown;
  error?: { message: string; code?: string } | null;
}

/** Clave de una respuesta preparada: `"<tabla>.<operacion>"`. */
type ClaveRespuesta = string;

export interface FakeSupabase {
  from: (tabla: string) => QueryBuilder;
  rpc: (nombre: string, args?: Record<string, unknown>) => Promise<RespuestaPreparada>;
  /** Todo lo que el caso de uso hizo, en orden. */
  llamadas: LlamadaRegistrada[];
  /** Nombre y argumentos de cada RPC invocada, en orden. */
  rpcs: { nombre: string; args?: Record<string, unknown> }[];
}

interface QueryBuilder extends PromiseLike<RespuestaPreparada> {
  select: (cols?: string) => QueryBuilder;
  insert: (payload: unknown) => QueryBuilder;
  update: (payload: unknown) => QueryBuilder;
  delete: () => QueryBuilder;
  eq: (col: string, val: unknown) => QueryBuilder;
  neq: (col: string, val: unknown) => QueryBuilder;
  gt: (col: string, val: unknown) => QueryBuilder;
  gte: (col: string, val: unknown) => QueryBuilder;
  lt: (col: string, val: unknown) => QueryBuilder;
  lte: (col: string, val: unknown) => QueryBuilder;
  like: (col: string, val: unknown) => QueryBuilder;
  ilike: (col: string, val: unknown) => QueryBuilder;
  is: (col: string, val: unknown) => QueryBuilder;
  in: (col: string, val: unknown) => QueryBuilder;
  not: (col: string, op: string, val: unknown) => QueryBuilder;
  or: (filtro: string) => QueryBuilder;
  order: (col: string, opts?: unknown) => QueryBuilder;
  limit: (n: number) => QueryBuilder;
  range: (desde: number, hasta: number) => QueryBuilder;
  maybeSingle: () => Promise<RespuestaPreparada>;
  single: () => Promise<RespuestaPreparada>;
}

export interface ConfigFake {
  /**
   * Respuestas por `"<tabla>.<operacion>"`. Lo que no esté, devuelve `null`.
   *
   * Un ARRAY significa "una respuesta por cada llamada sucesiva": hace falta
   * cuando el código consulta la misma tabla dos veces con filtros distintos
   * —por ejemplo pedidos por `sesion_id` y luego los huérfanos por `mesa_id`—
   * y el doble, que no filtra, si no devolvería lo mismo a las dos y duplicaría
   * los resultados. Agotado el array, se repite la última.
   */
  tablas?: Record<ClaveRespuesta, RespuestaPreparada | RespuestaPreparada[]>;
  /** Respuestas por nombre de función RPC. Mismo criterio para los arrays. */
  rpcs?: Record<string, RespuestaPreparada | RespuestaPreparada[]>;
}

/** Resuelve la respuesta N-ésima de una clave, siguiendo el criterio de arriba. */
function siguienteRespuesta(
  preparada: RespuestaPreparada | RespuestaPreparada[] | undefined,
  vecesUsada: number,
  vacio: RespuestaPreparada,
): RespuestaPreparada {
  if (!preparada) return vacio;
  if (!Array.isArray(preparada)) return preparada;
  return preparada[Math.min(vecesUsada, preparada.length - 1)] ?? vacio;
}

const VACIO: RespuestaPreparada = { data: null, error: null };

export function crearFakeSupabase(config: ConfigFake = {}): FakeSupabase {
  const llamadas: LlamadaRegistrada[] = [];
  const rpcs: { nombre: string; args?: Record<string, unknown> }[] = [];
  const usos = new Map<string, number>();

  function consumir(clave: string, preparada: RespuestaPreparada | RespuestaPreparada[] | undefined): RespuestaPreparada {
    const n = usos.get(clave) ?? 0;
    usos.set(clave, n + 1);
    return siguienteRespuesta(preparada, n, VACIO);
  }

  function from(tabla: string): QueryBuilder {
    const registro: LlamadaRegistrada = { tabla, operacion: 'select', filtros: {} };
    llamadas.push(registro);

    // La clave se resuelve al final, no al crear el builder: la operación no se
    // conoce hasta que se ha encadenado `.update()`, `.delete()`, etc.
    const resolver = (): RespuestaPreparada => {
      const clave = `${tabla}.${registro.operacion}`;
      return consumir(clave, config.tablas?.[clave]);
    };

    const builder: QueryBuilder = {
      select: () => builder,
      insert: (payload) => { registro.operacion = 'insert'; registro.payload = payload; return builder; },
      update: (payload) => { registro.operacion = 'update'; registro.payload = payload; return builder; },
      delete: () => { registro.operacion = 'delete'; return builder; },
      // Los filtros se registran para poder afirmarlos, pero NO se aplican: el
      // doble no filtra. Un `.neq()` que faltara aquí haría estallar la cadena
      // dentro del try/catch del repositorio y el test vería un error genérico
      // en vez del comportamiento — por eso están todos los operadores que usa
      // el código, aunque la mayoría no se comprueben.
      eq: (col, val) => { registro.filtros[col] = val; return builder; },
      neq: (col, val) => { registro.filtros[`${col}!=`] = val; return builder; },
      gt: (col, val) => { registro.filtros[`${col}>`] = val; return builder; },
      gte: (col, val) => { registro.filtros[`${col}>=`] = val; return builder; },
      lt: (col, val) => { registro.filtros[`${col}<`] = val; return builder; },
      lte: (col, val) => { registro.filtros[`${col}<=`] = val; return builder; },
      like: (col, val) => { registro.filtros[`${col}~`] = val; return builder; },
      ilike: (col, val) => { registro.filtros[`${col}~*`] = val; return builder; },
      is: (col, val) => { registro.filtros[col] = val; return builder; },
      in: (col, val) => { registro.filtros[col] = val; return builder; },
      not: (col, op, val) => { registro.filtros[`not.${col}.${op}`] = val; return builder; },
      or: (filtro) => { registro.filtros['or'] = filtro; return builder; },
      order: () => builder,
      limit: () => builder,
      range: () => builder,
      maybeSingle: async () => resolver(),
      single: async () => resolver(),
      // Un builder sin `.single()` se espera directamente con `await`.
      then: (onfulfilled, onrejected) => Promise.resolve(resolver()).then(onfulfilled, onrejected),
    };
    return builder;
  }

  return {
    from,
    rpc: async (nombre, args) => {
      rpcs.push({ nombre, args });
      return consumir(`rpc.${nombre}`, config.rpcs?.[nombre]);
    },
    llamadas,
    rpcs,
  };
}

/** Operaciones que tocaron una tabla concreta, en orden. */
export function llamadasDe(fake: FakeSupabase, tabla: string): LlamadaRegistrada[] {
  return fake.llamadas.filter((l) => l.tabla === tabla);
}
