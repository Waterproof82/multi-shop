# Complejidad cognitiva — cómo se cerró y cómo no volver

Estado a 2026-08-09.

**Cero funciones** por encima del umbral de complejidad cognitiva 15 (regla
SonarQube S3776), de las 15 que había al empezar.

Este documento ya no es un plan pendiente: es **cómo medir y qué patrones
funcionaron**, para que la próxima que aparezca se cierre en una tarde y no en
once sesiones. Léelo entero antes de tocar la primera línea de cualquier función
que vuelva a pasar de 15.

Lo último en caer fue el `beforeunload` de `/waiter/bar` (21), que era código de
resiliencia offline y llevaba tres iteraciones aparcado por eso.

---

## Cómo medir (importante)

**No usar el IDE.** SonarLint solo analiza los archivos abiertos y subestima el
alcance de forma grosera: llegó a reportar 1 función cuando había 30, y 49
`<button>` sin `type` cuando había 138.

Para el recuento real, sobre todo `src/`:

```bash
# En un directorio APARTE del proyecto (npm i --no-save en el repo falla):
npm init -y
npm i eslint@9 eslint-plugin-sonarjs@3 @typescript-eslint/parser
```

```js
// cognitive.mjs
import { ESLint } from 'eslint';
import sonarjs from 'eslint-plugin-sonarjs';
import * as tsparser from '@typescript-eslint/parser';

const RAIZ = '/ruta/al/multi_shop';
const eslint = new ESLint({
  cwd: RAIZ,
  overrideConfigFile: true,
  overrideConfig: [{
    files: ['**/*.tsx', '**/*.ts'],
    languageOptions: { parser: tsparser, parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: { sonarjs },
    rules: { 'sonarjs/cognitive-complexity': ['warn', 15] },
  }],
});

const res = await eslint.lintFiles([`${RAIZ}/src/**/*.tsx`, `${RAIZ}/src/**/*.ts`]);
for (const r of res) {
  for (const m of r.messages) {
    if (m.ruleId === 'sonarjs/cognitive-complexity') console.log(`${r.filePath}:${m.line} ${m.message}`);
  }
}
```

**Truco que ahorra la mitad del trabajo:** con el umbral en **0** y un solo
fichero, la regla lista *todas* sus funciones con su complejidad, no solo las que
pasan de 15. Es la forma barata de saber **dónde** está repartida antes de tocar
nada — el número por fichero no dice si es un bloque gordo o veinte guardas
sueltas, y esa diferencia decide el refactor.

Dos detalles que no son evidentes y cambian cómo se lee la salida:

- **El plugin de ESLint mide cada función POR SEPARADO.** La complejidad de una
  función anidada NO suma a la de su contenedora. Si un componente marca 16 y
  tiene dentro un handler de 10, ese 16 es todo suyo: sacar el handler no moverá
  la aguja. Comprobado en seco: una contenedora cuyo único contenido es un
  handler con tres `if` anidados marca **0**, y el handler marca 6.
- **En JSX solo cuentan los ternarios, y valen 1 punto cada uno.** `{x && <p/>}`
  cuesta **0**; `{x ? <p/> : <q/>}` cuesta **1**. Un ternario dentro de otro paga
  el anidamiento; dentro de un `&&` no. Por eso `cart-drawer` se atascó: se
  extrajeron seis piezas de JSX que no llevaban ternarios dentro.
- **Un `.map()` o un IIFE en medio del JSX es una función anidada**, así que sus
  ternarios NO cuentan para el componente. Al contar candidatos a mano, descartar
  todo lo que esté dentro de un callback: en `mesa-orders-client` eran 47
  ternarios en bruto y solo ~18 contaban.
- **Un ternario anidado paga el nivel: a profundidad 3 cuesta 3 puntos, no 1.**
  Es lo que hace que un componente con un solo `a ? (…) : (…)` gordo marque 17.
  **Busca ternarios profundos antes que bloques grandes** — `cart-drawer` estuvo
  dos intentos atascada por buscar lo segundo.

> **Cuidado al medir por trozos.** Recortar un fichero y medir la diferencia
> parece que atribuye complejidad a cada zona, y no es fiable: en
> `mesa-orders-client` dos recortes disjuntos sumaban 103 puntos sobre un total
> de 78. El refactor real confirmó uno de los dos y desmintió el otro. Sirve para
> saber **dónde mirar**, no para presupuestar. Lo que sí es fiable es medir el
> fichero entero después de cada extracción.

---

## Harness de React — HECHO (2026-08-09)

Durante un tiempo esto fue un bloqueo real: no había `jsdom` ni Testing Library,
así que no se podía escribir la prueba de caracterización que debe preceder a
cada refactor de componente. Ya no.

`jsdom`, `@testing-library/react`, `user-event` y `jest-dom` instalados;
`tests/ui/setup.ts` con limpieza entre tests; y en
`vitest.config.ts` **dos proyectos** en vez de un entorno único:

| Proyecto | Entorno | Coge | Corre en |
|---|---|---|---|
| `unit` | `node` | `tests/**/*.test.ts` | ~1,9 s |
| `ui` | `jsdom` | `tests/ui/**/*.test.tsx` | ~1,5 s |

> **Corrección respecto a lo que decía este documento:** recomendaba
> `environmentMatchGlobs`. Esa opción **se eliminó en Vitest 4** (el proyecto
> usa la 4.1.10). El sustituto es `projects`. Si alguien copia la receta vieja,
> no falla con un error claro: la opción se ignora en silencio y todo acaba
> corriendo en `node`.

**Lo que encontró el harness en su primera ejecución**, antes de correr un solo
test: `react` estaba en 19.2.8 y `react-dom` en 19.2.0. React 19 exige que
coincidan exactamente. Llevaba tiempo así y nadie lo veía porque **ningún test
renderizaba React**. Corregido en la misma PR.

### Cuándo montar React y cuándo no

Hasta ahora **ningún refactor de complejidad ha necesitado el proyecto `ui`**.
El patrón que ha bastado en las once: sacar la decisión a una función pura en
`src/lib/`, probarla en `unit` (que corre en ~2 s, en cada commit), y dejar en el
componente solo el render. `banner-visibilidad.ts` es el ejemplo más limpio.

Montar el componente es para lo que de verdad no se puede separar: qué se
muestra según el estado de la sesión, qué pasa al pulsar pagar, cómo reacciona a
un evento de Realtime. Ahí sí, y esa decisión es de producto tanto como técnica.

El primer test que sí monta (`tests/ui/allergen-badges.test.tsx`) se eligió por
valor, no por facilidad: los alérgenos son información de seguridad alimentaria.
Y ya documenta un riesgo real — **un alérgeno con la clave mal escrita en la BBDD
desaparece en silencio**, sin error ni hueco visible.

---

## Cerradas — lo que dejó cada una

Solo las que enseñaron algo. El resto siguió los patrones de más abajo sin
sorpresas.

### `proxy.ts` — de 27 a bajo umbral (2026-08-09)

Se cumplieron las tres condiciones que este documento exigía: 51 tests de
caracterización primero (`tests/compliance/proxy-autorizacion.test.ts`,
verificados por mutación), los E2E de seguridad en verde antes y después
(65 tests entre `waiter-csrf`, `kitchen-bar-csrf` y `kitchen-csrf-browser`), y
sin mezclar con otros cambios.

Extraído de `proxy()`: `isWaiterRoute`, `isPublicTpvRoute`,
`handleAdminOrEmployeeAuth` (la pareja admin→empleado que se repetía en `/api/tpv`
y `/api/laborcontrol`), `handleSuperadminAuth` y `buildPageResponse`.

**Dos cosas que aparecieron al mirarlo de cerca:**

1. `const url = request.nextUrl.clone()` estaba declarado y **nunca se usaba**.
   Un clon de URL por petición, para nada. Eliminado.

2. Las rutas públicas **no salen todas por el mismo sitio**, y eso cambia sus
   cabeceras. `/api/admin/login` no cumple ninguna condición de la cadena, así
   que cae hasta el final y recibe nonce, CSP y CORS. `/api/tpv/empleados/login`
   y los cron de laborcontrol hacen `return NextResponse.next()` antes, y **no
   reciben nada de eso**. Es una asimetría real que un refactor "uniformador" se
   llevaría por delante sin que fallara nada visible. Está congelada en tests.

> La complejidad real era **27**, no 28: este documento la había registrado con
> una unidad de más. Medir antes de tocar, siempre.

### `waiter-banner.tsx` — de 16 a 7 (2026-08-09)

Caso de libro de **complejidad sin un solo bloque gordo**. Midiendo con umbral 0
el componente marcaba 16 y su handler más pesado 10 — pero como el plugin no
suma las anidadas, ese 16 salía entero de **ocho `if (...) return null` seguidos**
más un `if/else if` para el rótulo de sección. Sacar handlers no habría movido
nada.

Extraído a `src/lib/waiter/banner-visibilidad.ts` como tabla de reglas
`{ motivo, oculta }`, con `motivoParaOcultarBanner()` devolviendo **el motivo, no
un booleano**. El motivo es lo que hace legible el test: `'tienda-sin-mesa'` dice
lo que `false` no dice.

**El orden de las reglas es parte del contrato.** `isWaiter` arranca en `false`,
así que si `'no-es-camarero'` ganara a `'auth-sin-comprobar'`, el primer render de
cada carga contaría como fallo de auth y dispararía el redirect a `/waiter`. Hay
test para eso.

Dos asimetrías heredadas que aparecieron al escribir los tests. Ninguna es un
bug hoy, y las dos están congeladas para que no cuesten una tarde:

1. `/admin` se compara **por prefijo sin barra**, así que una futura
   `/administracion` también ocultaría el banner, en silencio.
2. `/tracking/` **sí lleva barra**, así que `/tracking` a secas lo muestra.

---

### `mesa-orders-client.tsx` — de 78 a 14 (2026-08-09)

La peor del repo, y la que decide qué ve el comensal cuando paga. Se hizo en dos
commits, midiendo entre medias: **78 → 28 → 14**.

**Dónde estaba.** Midiendo con umbral 0, las otras 100 funciones del fichero
estaban sanas (máximo 15). Y dentro del componente, los **veinte `useEffect`**
—bfcache, `popstate`, Realtime, locks de pago, recuperación tras volver de
Redsys— sumaban **3 puntos entre todos**. Toda la deuda estaba en dos sitios:
elegir pantalla y pintarla. Vale la pena decirlo porque la intuición dice lo
contrario: los efectos parecen lo difícil, y no lo eran.

**Primer commit — la decisión.** El componente no es una pantalla, son cinco, y
elegía con cuatro `if (...) return <Vista/>` seguidos. Extraído a
`src/lib/mesa/vista-mesa.ts` como tabla de reglas que devuelve **la vista**
(`'esperando-cobro-propio'`), no un booleano. Pintar es de `VistaDeTurno`.

**A diferencia del `waiter-banner`, aquí el orden de las reglas NO es contrato**:
las cuatro son mutuamente excluyentes y hay un test que lo comprueba. Se dice
explícitamente en el módulo porque quien venga del banner va a asumir lo
contrario y va a evitar tocarlo por miedo.

Antes de sustituir nada se comprobó la equivalencia con las cuatro guardas
originales sobre **las 660 combinaciones** de sesión, turno, modo camarero y
panel oculto: 0 divergencias. La sonda se borró después; lo que queda son los 31
tests de caracterización.

Dos comportamientos heredados congelados sin corregir:

1. Con un `activeTurnoId` obsoleto y otro comensal seleccionando, se ve **la
   cuenta completa** en vez de la pantalla de espera. La auto-limpieza no rescata
   el caso: solo limpia turnos pagados o cancelados.
2. La regla de espera no exige sesión cargada; las otras tres sí. Hoy es inocua.

**Segundo commit — lo que solo pinta.** Cinco piezas fuera, todas por el mismo
criterio: cada una nombraba un estado resuelto con un ternario suelto.
`TotalDeLaCuenta` (el pie son dos cifras distintas según haya cobro parcial),
`BotonDePago` (el mismo ternario carga/contenido repetido tres veces),
`ModalBorrarItem` (dos pantallas: el aviso de "ya preparado" y el selector de
unidades), `ProgresoDeDivision`, y el tipo inline del `useState`.

**Lo que NO se hizo, y por qué.** Extraer la sección de pago entera (424 líneas)
habría necesitado **25 props**. Un componente con 25 props no es un componente,
es un pliegue de código: mueve el número sin mejorar nada. Partirla de verdad
pide un hook `usePagoDeMesa` que posea el estado de cobro y los handlers, y eso
es un cambio de diseño con PR propio — el mismo criterio que se aplicó a
`cart-drawer`.

## Patrones que han funcionado

Extraídos del bloque backend ya cerrado. Reutilizables.

**Tabla de despacho** — para handlers con N ramas por patrón. Cada rama es una
fila `{ patron, manejar }`. Ver `src/app/api/telegram/webhook/callbacks.ts`.
Lo que hay que testear es el **enrutado**, no la lógica: un patrón mal escrito no
da error, simplemente el botón hace otra cosa. Probar siempre el orden de
evaluación cuando hay prefijos compartidos, y el anclaje `^...$`.

**Inyección de servicios por contexto** (`ctx.servicios`) en vez de import
directo: permite probar sin hablar con la API externa.

**`PasoRuta<T> = { corte: NextResponse } | { valor: T }`** — saca validaciones de
un handler de Next sin perder el control de flujo. Ver
`src/app/api/admin/tgtg/enviar/route.ts`.

**Encadenar caminos con `??`** cuando cada uno devuelve `null` si la entrada no
es suya. Ver `processRedsysWebhookUseCase`.

**Listas declarativas para payloads de UPDATE** — ver
`src/core/infrastructure/database/update-payload.ts`. El criterio (¿el valor
vacío es NULL o es un dato?) pasa de vivir en un comentario a estar en el nombre
de la función que se elige.

---

## Herramientas ya disponibles

- **`tests/helpers/fake-supabase.ts`** — doble del query builder. Encadena todo,
  registra cada operación **en orden** (en pagos, el orden ES la corrección), y
  admite respuestas por secuencia cuando el código consulta la misma tabla dos
  veces con filtros distintos.
- **`vitest.config.ts` resuelve `@/`** — sin eso ningún test podía importar
  `src/core`. Era la causa raíz de que toda la capa de aplicación e
  infraestructura estuviera sin pruebas.

## Trampas conocidas

- Al probar cualquier módulo de `src/core`, **moquear
  `@/core/infrastructure/logging/logger`** aunque el test sea de funciones puras:
  el logger construye el cliente de Supabase al cargarse.
- **No editar archivos mientras corre un `git commit`**: el hook de Husky ejecuta
  typecheck y falla con la edición a medias.
- El hook llega a tardar >10 min ocasionalmente. Commitear de uno en uno.

---

## Lo que queda (2026-08-09)

Nada por encima del umbral.

Sí queda **una deuda de diseño** que estos refactors anotaron en vez de resolver:
la sección de pago de `mesa-orders-client` sigue dentro del componente porque
sacarla bien pide un hook `usePagoDeMesa`. Ver más arriba. No es complejidad
medida — es una responsabilidad en el sitio equivocado, y merece su propio PR.

### El patrón que ha funcionado en las quince cerradas

1. **Un ternario anidado casi siempre es un ESTADO SIN NOMBRE.** No lo desanides
   rama a rama: eso deja la misma idea repartida. Dale un tipo (`type Estado =
   'a' | 'b' | 'c'`) y una tabla `Record<Estado, …>`. Con el Record, añadir un
   estado nuevo obliga a rellenarlo — TypeScript no lo deja incompleto.
2. **Una cadena de guardas también es un estado sin nombre**, aunque no haya
   ningún ternario. Ver `waiter-banner` más arriba: ocho `return null` seguidos.
   Tabla de reglas, y que devuelva el motivo.
3. **Bloques JSX repetidos con ternarios dentro**: extrae un componente. En
   `SeoCell` eran doce ramas para decir cuatro cosas.
4. **Mide después de cada extracción, no al final.** `tgtg-reserva-popup` tenía
   la complejidad en TRES sitios (efecto, handler y JSX); bajar el primero no
   movió la aguja ni un punto.
5. **Empieza midiendo con umbral 0** para saber dónde está repartida. Ahorra
   justo el trabajo que no sirve.

### `cart-drawer.tsx` — de 17 a 3 (2026-08-09)

Dos intentos anteriores la dejaron atascada en 17, y este documento decía que lo
que quedaba "está repartido por el cuerpo del componente, no en un bloque
extraíble". **Era falso, y el diagnóstico se hizo sin la herramienta correcta.**

Todo estaba en un sitio: `mesaToken ? (distintivo) : (formulario de datos)`, con
el formulario entero en la rama negativa. Los cuatro `errors.X ? … : …` de dentro
quedaban a dos y tres niveles de anidamiento, **y a esa profundidad un ternario
cuesta 3 puntos, no 1**. Una sola extracción se llevó catorce.

La lección no es sobre este fichero. Los dos intentos anteriores buscaban *bloques
grandes* que extraer; lo que había que buscar era **ternarios profundos**. Un
ternario anidado a nivel 3 pesa lo mismo que tres sueltos, y ocupa una línea.

Y la separación que salió es exactamente la que este documento predijo a ciegas
—carrito contra datos de entrega—, solo que no era un cambio de diseño caro: era
un componente, `DatosDelComensal`.

**Lo que apareció al sacarlo.** La condición no era de maquetación: **en modo
mesa no se recogen datos personales**, porque la mesa ya identifica el pedido.
Eso es RGPD, no presentación. Invertirla no rompe nada visible y pone la tienda a
pedir nombre, teléfono y correo a gente sentada en una mesa. Congelado en
`tests/ui/datos-del-comensal.test.tsx`, cuyo primer bloque comprueba **ausencia**
de campos — que es justo lo que ningún test de "se ve bien" comprueba nunca.

Los 12 tests están verificados por mutación: invirtiendo la condición fallan 11.

### `waiter/bar` — de 21 a bajo umbral (2026-08-09)

La última, y la que llevaba tres iteraciones aparcada por delicada: un
`beforeunload` que persiste comandas en vuelo y dispara PATCH por ítem. Lo que se
pierda ahí son bebidas reales que el sistema da por servidas sin estarlo.

**Lo que había que entender antes de tocar**, y que ahora está escrito en el
código: la ejecución usa `keepalive`, que es **fuego y olvido**. El navegador
intenta la petición después de que la página muera, pero no hay respuesta que
comprobar, ni reintento, ni forma de saber si llegó. La marca optimista se
persiste en `localStorage` **antes** de disparar. Es decir: **la única parte de
todo el cierre que se puede verificar es la decisión, no el envío.**

Por eso el refactor separa exactamente eso. `src/lib/waiter/cierre-al-salir.ts`
decide qué pedidos quedan completos; `parchearAlSalir()` los manda. 15 tests
sobre la decisión; el envío queda documentado como no verificable, que es más
honesto que fingir que se prueba.

**Un `substring` que casi se convierte en `slice`.** Al extraer
`pedidoDeClave()` usé `slice` por costumbre. Sin `:` en la clave el índice es
`-1`, y ahí **no son equivalentes**: `substring` lo trunca a 0 y devuelve cadena
vacía —lo que hacía el original—; `slice` cuenta desde el final y devuelve la
clave sin su último carácter, un id inventado que no casa con ningún pedido.
Lo cazó el test que había escrito *antes* de mirar la implementación. Sin ese
test, el cambio era invisible y el fallo aparecería solo con datos raros.

**Dos comportamientos heredados congelados sin corregir:**

1. **Un pedido enteramente servido, sin ninguna cuenta atrás corriendo, NO se
   cierra.** La agrupación se siembra solo con los ítems en vuelo, y los
   servidos únicamente suman a pedidos ya presentes. Si el camarero sirve todo y
   después cierra la pestaña, el PATCH de pedido no sale y el pedido se queda
   abierto en el servidor. Es lo que hacía el `if (e)` original.
2. **El total lo fija el último ítem en vuelo de ese pedido**, no el mayor ni el
   primero, porque el bucle lo sobrescribe en cada vuelta.

### El orden que funcionó en las dos delicadas

1. Medir con umbral 0 **antes de leer el código**. En `mesa-orders-client`
   descartó de golpe los veinte efectos, que era donde parecía estar la
   dificultad.
2. Extraer primero la decisión **pura** y probarla en `unit`. Escribir el test
   **antes** de mirar cómo está implementada: así el test describe el
   comportamiento, no la implementación — y es lo que cazó el `substring`.
3. Cuando toca dinero, además **demostrar la equivalencia con el código viejo
   sobre todas las combinaciones** antes de sustituirlo. Los tests de
   caracterización dicen que lo nuevo hace lo que quisiste; la equivalencia
   exhaustiva dice que hace lo que hacía.
4. Solo después, sacar lo que solo pinta o solo envía.
