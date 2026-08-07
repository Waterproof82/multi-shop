import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  // El alias `@/` es el mismo que declara tsconfig.json.
  //
  // Sin él, vitest no puede importar NADA de `src/core`: todo ese código usa
  // rutas `@/...` y el runner las daba por módulos inexistentes. Por eso hasta
  // ahora los tests solo alcanzaban a `src/lib` por ruta relativa, y las
  // capas de aplicación e infraestructura —casos de uso, repositorios— se
  // quedaban sin una sola prueba. No era una decisión: era el harness.
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: 'reports/coverage',
    },
  },
});
