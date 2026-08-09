# Deuda de complejidad cognitiva — plan pendiente

Estado a 2026-08-09.

**3 funciones** siguen por encima del umbral de complejidad cognitiva 15 (regla
SonarQube S3776), de las 15 que había al empezar. Se cerraron el bloque backend,
`proxy.ts`, y once componentes de React en agosto de 2026.

Ninguna está bloqueada: el harness de React existe (ver más abajo). **Dos de las
tres piden sesión propia**, y el porqué está al final del documento.

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
  la aguja.
- **Los condicionales del JSX (`{x && <p/>}`) no cuentan.** Por eso `cart-drawer`
  se atascó (ver más abajo): se extrajeron seis piezas de JSX y el número no se
  movió.

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

```
78  src/components/mesa-orders-client.tsx:1281   DELICADA — la cuenta del comensal
21  src/app/waiter/bar/page.tsx:441              DELICADA — beforeunload offline
17  src/components/cart-drawer.tsx:1004          intentada, NO conseguida
```

Los números de línea se mueven en cuanto alguien toca el fichero. **Medir antes
de ir a buscarlos.**

### El patrón que ha funcionado en las once cerradas

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

### `cart-drawer.tsx` — intentada y atascada en 17

Bajó de 19 extrayendo seis piezas (`DiscountSection`, `TotalsSection`,
`FieldError`, `detectMesaFromUrl`, `validarCodigoDescuento`,
`camposTrasCambioDeEntrega`) y ahí se quedó.

Lo que queda **está repartido por el cuerpo del componente** —guardas de envío,
estados de descuento, flujo de delivery—, no en un bloque extraíble. Sacar trozos
sueltos movería el número sin mejorar nada, que es exactamente lo que no se busca
aquí.

Antes de reintentarlo: medir con umbral 0 y comprobar que sigue siendo así. Si el
único camino es partir el componente en dos por responsabilidad (carrito vs.
datos de entrega), eso es un cambio de diseño y merece su propio PR.

### Las dos delicadas — leer esto antes de tocarlas

**`waiter/bar:441`** es un `beforeunload` que persiste comandas en vuelo y
dispara un PATCH por ítem. Es código de resiliencia offline: lo que se pierda
ahí son comandas reales que el cocinero no ve. Antes de refactorizarlo hay que
entender qué garantiza hoy —y qué no— sobre pestañas que se cierran a media
operación. Ver [`offline-y-resiliencia.md`](./offline-y-resiliencia.md).

**`mesa-orders-client:1281`** (78) es la pantalla donde el comensal paga.
El orden que ha funcionado en todo lo demás:

1. Extraer primero las funciones **puras** —cálculos de totales, agrupaciones,
   decisiones de visibilidad—. Se prueban sin montar nada, y el harness de
   `tests/ui/` ya existe para lo que sí necesite render.
2. Decidir **qué comportamiento cubrir** antes de mover código. No es "tests de
   componentes" en abstracto: qué se muestra según el estado de la sesión, qué
   pasa al pulsar pagar, cómo reacciona a un evento de Realtime. Esa decisión es
   de producto tanto como técnica.

**No las metas en el mismo PR que otra cosa.**
