import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// El alias `@/` es el mismo que declara tsconfig.json.
//
// Sin él, vitest no puede importar NADA de `src/core`: todo ese código usa
// rutas `@/...` y el runner las daba por módulos inexistentes. Por eso hasta
// ahora los tests solo alcanzaban a `src/lib` por ruta relativa, y las
// capas de aplicación e infraestructura —casos de uso, repositorios— se
// quedaban sin una sola prueba. No era una decisión: era el harness.
const alias = {
  '@': fileURLToPath(new URL('./src', import.meta.url)),
};

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: 'reports/coverage',
    },

    // DOS PROYECTOS, NO UN ENTORNO ÚNICO.
    //
    // La suite de `unit` tarda ~2 s porque corre en `node`. Montar jsdom para
    // los 297 tests que solo leen ficheros o llaman funciones puras los
    // ralentizaría sin ganar nada, y estos tests corren en cada commit
    // (`.husky/pre-commit`): lo que se pague aquí se paga decenas de veces
    // al día.
    //
    // La separación es por CONVENCIÓN, no por configuración que haya que
    // recordar: `tests/**/*.test.ts` va a node, `tests/ui/**/*.test.tsx` va a
    // jsdom. Un test de componente en el sitio equivocado no arranca.
    //
    // Nota para quien venga del doc de deuda técnica: allí se recomendaba
    // `environmentMatchGlobs`. Esa opción ya NO EXISTE — se eliminó en
    // Vitest 4. `projects` es su sustituto.
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'unit',
          environment: 'node',
          include: ['tests/**/*.test.ts'],
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'ui',
          environment: 'jsdom',
          include: ['tests/ui/**/*.test.tsx'],
          setupFiles: ['./tests/ui/setup.ts'],
        },
      },
    ],
  },
});
