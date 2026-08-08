# Deuda de complejidad cognitiva — plan pendiente

Estado a 2026-08-07. Rama `perf/latency-fase1`.

**15 funciones** siguen por encima del umbral de complejidad cognitiva 15 (regla
SonarQube S3776). Se cerraron 15 en el bloque backend; lo que queda es casi todo
React, y **no se puede refactorizar con seguridad todavía** porque no hay forma
de probarlo.

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

### Trabajo previo necesario

1. `pnpm add -D jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom`
2. En `vitest.config.ts`: `environmentMatchGlobs` para que `tests/ui/**` use
   `jsdom` y el resto siga en `node` (la suite actual tarda ~2 s; meter jsdom en
   todo la ralentizaría sin motivo).
3. Un `setup.ts` con `@testing-library/jest-dom` y limpieza entre tests.
4. Decidir **qué se quiere cubrir**. No es "tests de componentes" en abstracto:
   son comportamientos concretos —qué se muestra según el estado de la sesión,
   qué pasa al pulsar pagar, cómo reacciona a un evento de Realtime—.

Esa decisión es de producto tanto como técnica, y merece empezarse en frío.

---

## Pendientes, por orden de valor

### 1. `proxy.ts:389` — complejidad 28

**Lo único de backend que queda, y va aparte.** Contiene autenticación, CSRF y
la construcción de la CSP. Un fallo aquí no degrada una pantalla: abre el
sistema.

Condiciones para tocarlo:
- Tests de caracterización primero, cubriendo cada rama de autorización.
- Los tests E2E de seguridad existentes (`e2e/waiter-csrf.spec.ts`) en verde
  antes y después.
- Sin mezclar con otros cambios en el mismo commit.

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
