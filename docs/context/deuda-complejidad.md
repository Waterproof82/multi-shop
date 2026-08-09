# Deuda de complejidad cognitiva — plan pendiente

Estado a 2026-08-09.

**5 funciones** siguen por encima del umbral de complejidad cognitiva 15 (regla
SonarQube S3776). Se cerraron 15 en el bloque backend, `proxy.ts`, y otras nueve
de React en agosto de 2026.

Ninguna está ya bloqueada: el harness existe (ver más abajo). El detalle de las
5 que faltan, y por qué dos de ellas piden sesión propia, está al final del
documento.

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

---

## BLOQUEO: los componentes React no se pueden probar

14 de las 15 pendientes son componentes o páginas. **El proyecto no tiene `jsdom`
ni Testing Library configurados**, así que no hay manera de escribir la prueba de
caracterización que debe preceder a cada refactor.

Refactorizar `mesa-orders-client.tsx` (complejidad **78**, la pantalla donde el
comensal ve y paga su cuenta) sin red de seguridad es exactamente el atajo que
este trabajo ha evitado en todo el bloque backend. **No hacerlo.**

### Trabajo previo — HECHO (2026-08-09)

El harness ya existe. `jsdom`, `@testing-library/react`, `user-event` y
`jest-dom` instalados; `tests/ui/setup.ts` con limpieza entre tests; y en
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

### Lo que queda por decidir

**Qué se quiere cubrir.** No es "tests de componentes" en abstracto: son
comportamientos concretos —qué se muestra según el estado de la sesión, qué pasa
al pulsar pagar, cómo reacciona a un evento de Realtime—.

Esa decisión es de producto tanto como técnica, y merece empezarse en frío.

El primer test (`tests/ui/allergen-badges.test.tsx`) se eligió por valor, no por
facilidad: los alérgenos son información de seguridad alimentaria. Y ya documenta
un riesgo real — **un alérgeno con la clave mal escrita en la BBDD desaparece en
silencio**, sin error ni hueco visible.

---

## Pendientes, por orden de valor

### 1. `proxy.ts` — HECHO (2026-08-09). De 27 a bajo umbral

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

### 2. `mesa-orders-client.tsx:1248` — complejidad 78

La peor del proyecto, y la de mayor impacto: es la cuenta del comensal. Bloqueada
por el harness de React.

Cuando se aborde, el orden que ha funcionado en el bloque backend:
extraer primero las funciones **puras** (cálculos de totales, agrupaciones,
decisiones de visibilidad), que son las que se pueden probar sin montar nada.

### 3. Resto de componentes

| Complejidad | Archivo |
|---|---|
| 24 | `src/components/tgtg-reserva-popup.tsx:51` |
| 23 | `src/app/tpv/layout.tsx:40` |
| 21 | `src/components/tpv/TurnoCerrarForm.tsx:70` |
| 21 | `src/app/waiter/bar/page.tsx:441` |
| 20 | `src/app/tpv/turno/cerrar/page.tsx:18` |
| 18 | `src/components/mesa-orders-client.tsx:530` |
| 18 | `src/app/superadmin/empresas-table.tsx:203` |
| 17 | `src/components/cart-drawer.tsx:949` |
| 17 | `src/components/admin/delivery/DeliveryCredentialsForm.tsx:27` |
| 16 | `src/components/waiter-banner.tsx:137` |
| 16 | `src/components/tpv/MenuPanel.tsx:179` |
| 16 | `src/app/tpv/legal/page.tsx:90` |
| 16 | `src/app/admin/(protected)/page.tsx:19` |

### Nota sobre `cart-drawer.tsx`

Se intentó y **se atascó en 17**. Bajó de 19 extrayendo seis piezas
(`DiscountSection`, `TotalsSection`, `FieldError`, `detectMesaFromUrl`,
`validarCodigoDescuento`, `camposTrasCambioDeEntrega`) y ahí se quedó.

Dato contraintuitivo medido: **extraer condicionales del JSX (`{x && <p/>}`) no
mueve la métrica**. Está dominada por otra cosa. Quien lo retome, que lea las
*secondary locations* del informe de Sonar en vez de ir a ciegas como se hizo
aquí.

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
78  src/components/mesa-orders-client.tsx:1248   DELICADA
21  src/app/waiter/bar/page.tsx:441              DELICADA
18  src/components/mesa-orders-client.tsx:530
17  src/components/cart-drawer.tsx:949
16  src/components/waiter-banner.tsx:137
```

### Las tres mecánicas

Mismo tipo que las nueve ya cerradas. El patrón que ha funcionado en todas:

1. **Un ternario anidado casi siempre es un ESTADO SIN NOMBRE.** No lo desanides
   rama a rama: eso deja la misma idea repartida. Dale un tipo (`type Estado =
   'a' | 'b' | 'c'`) y una tabla `Record<Estado, …>`. Con el Record, añadir un
   estado nuevo obliga a rellenarlo — TypeScript no lo deja incompleto.
2. **Bloques JSX repetidos con ternarios dentro**: extrae un componente. En
   `SeoCell` eran doce ramas para decir cuatro cosas.
3. **Mide después de cada extracción, no al final.** `tgtg-reserva-popup` tenía
   la complejidad en TRES sitios (efecto, handler y JSX); bajar el primero no
   movió la aguja ni un punto.

### Las dos delicadas — leer esto antes de tocarlas

**`waiter/bar:441`** es un `beforeunload` que persiste comandas en vuelo y
dispara un PATCH por ítem. Es código de resiliencia offline: lo que se pierda
ahí son comandas reales que el cocinero no ve. Antes de refactorizarlo hay que
entender qué garantiza hoy —y qué no— sobre pestañas que se cierran a media
operación. Ver [`offline-y-resiliencia.md`](./offline-y-resiliencia.md).

**`mesa-orders-client:1248`** (78) es la pantalla donde el comensal paga.
El orden que ha funcionado en todo lo demás:

1. Extraer primero las funciones **puras** —cálculos de totales, agrupaciones,
   decisiones de visibilidad—. Se prueban sin montar nada, y el harness de
   `tests/ui/` ya existe para lo que sí necesite render.
2. Decidir **qué comportamiento cubrir** antes de mover código. No es "tests de
   componentes" en abstracto: qué se muestra según el estado de la sesión, qué
   pasa al pulsar pagar, cómo reacciona a un evento de Realtime. Esa decisión es
   de producto tanto como técnica.

**No las metas en el mismo PR que otra cosa.**
