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
  is: (col: string, val: unknown) => QueryBuilder;
  in: (col: string, val: unknown) => QueryBuilder;
  maybeSingle: () => Promise<RespuestaPreparada>;
  single: () => Promise<RespuestaPreparada>;
}

export interface ConfigFake {
  /** Respuestas por `"<tabla>.<operacion>"`. Lo que no esté, devuelve `null`. */
  tablas?: Record<ClaveRespuesta, RespuestaPreparada>;
  /** Respuestas por nombre de función RPC. */
  rpcs?: Record<string, RespuestaPreparada>;
}

const VACIO: RespuestaPreparada = { data: null, error: null };

export function crearFakeSupabase(config: ConfigFake = {}): FakeSupabase {
  const llamadas: LlamadaRegistrada[] = [];
  const rpcs: { nombre: string; args?: Record<string, unknown> }[] = [];

  function from(tabla: string): QueryBuilder {
    const registro: LlamadaRegistrada = { tabla, operacion: 'select', filtros: {} };
    llamadas.push(registro);

    const resolver = (): RespuestaPreparada =>
      config.tablas?.[`${tabla}.${registro.operacion}`] ?? VACIO;

    const builder: QueryBuilder = {
      select: () => builder,
      insert: (payload) => { registro.operacion = 'insert'; registro.payload = payload; return builder; },
      update: (payload) => { registro.operacion = 'update'; registro.payload = payload; return builder; },
      delete: () => { registro.operacion = 'delete'; return builder; },
      eq: (col, val) => { registro.filtros[col] = val; return builder; },
      is: (col, val) => { registro.filtros[col] = val; return builder; },
      in: (col, val) => { registro.filtros[col] = val; return builder; },
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
      return config.rpcs?.[nombre] ?? VACIO;
    },
    llamadas,
    rpcs,
  };
}

/** Operaciones que tocaron una tabla concreta, en orden. */
export function llamadasDe(fake: FakeSupabase, tabla: string): LlamadaRegistrada[] {
  return fake.llamadas.filter((l) => l.tabla === tabla);
}
