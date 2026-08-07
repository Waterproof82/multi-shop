import { test, expect, type APIRequestContext } from '@playwright/test';

/**
 * Los interruptores de configuración de empresa deben poder APAGARSE.
 *
 * POR QUÉ ESTE TEST EXISTE
 * `SupabaseEmpresaRepository.update` construía el payload con 26 `if` seguidos.
 * Bastaba añadir un campo booleano en la línea equivocada para que pasara por
 * `|| null`, y entonces:
 *
 *   `mostrar_promociones: false || null` → NULL → la columna vuelve a su DEFAULT
 *
 * Es decir: **el admin apaga el interruptor, guarda, recarga, y sigue encendido**.
 * Sin ningún error por ningún lado.
 *
 * Hay 18 pruebas unitarias sobre `construirPayloadEmpresa` que cubren la
 * construcción del payload. Esto cubre lo que aquellas no pueden: que el `false`
 * sobreviva al viaje completo —API → caso de uso → repositorio → Postgres— y
 * siga siendo `false` al releerlo.
 *
 * ⚠️ ESTE TEST ESCRIBE — POR ESO ES OPT-IN
 * A diferencia del resto de la suite, que solo lee o comprueba barreras de
 * autorización, este modifica la configuración de una empresa REAL: la apaga,
 * comprueba, y la restaura en `afterAll`.
 *
 * `PLAYWRIGHT_BASE_URL` apunta a un despliegue en vivo, así que un fallo del
 * proceso a mitad dejaría el interruptor apagado en producción. Por eso no
 * corre salvo que se pida explícitamente:
 *
 *     PLAYWRIGHT_ALLOW_MUTATING_TESTS=1 npx playwright test e2e/compliance/empresa-config-toggles.spec.ts
 *
 * Lo suyo es lanzarlo contra un entorno de pruebas, no contra el negocio.
 *
 * QUÉ APORTA SOBRE LOS TESTS UNITARIOS
 * Las 18 pruebas de `construirPayloadEmpresa` cubren la construcción del
 * payload. Esto cubre lo que aquellas no pueden: que el `false` sobreviva al
 * viaje completo —API → caso de uso → repositorio → Postgres— y siga siendo
 * `false` al releerlo.
 */

/** Interruptor de seguridad: sin esto, el test no toca nada. */
function mutacionesPermitidas(): boolean {
  return process.env.PLAYWRIGHT_ALLOW_MUTATING_TESTS === '1';
}

function adminEmail(): string | undefined { return process.env.PLAYWRIGHT_ADMIN_EMAIL; }
function adminPassword(): string | undefined { return process.env.PLAYWRIGHT_ADMIN_PASSWORD; }

/** Motivo por el que saltarse la prueba, o `null` si se puede ejecutar. */
function motivoParaSaltar(): string | null {
  if (!mutacionesPermitidas()) {
    return 'Test que ESCRIBE en una empresa real. Ejecutar con PLAYWRIGHT_ALLOW_MUTATING_TESTS=1 y preferiblemente contra un entorno de pruebas.';
  }
  if (!adminEmail() || !adminPassword()) {
    return 'PLAYWRIGHT_ADMIN_EMAIL o PLAYWRIGHT_ADMIN_PASSWORD no definidos';
  }
  return null;
}

/** Interruptores que el formulario de admin puede apagar. */
const INTERRUPTORES = ['mostrar_promociones', 'mostrar_tgtg', 'mostrar_logo'] as const;
type Interruptor = (typeof INTERRUPTORES)[number];

/** Nombre del campo en la respuesta del GET, que va en camelCase. */
const EN_RESPUESTA: Record<Interruptor, string> = {
  mostrar_promociones: 'mostrarPromociones',
  mostrar_tgtg: 'mostrarTgtg',
  mostrar_logo: 'mostrarLogo',
};

test.describe('Empresa — los interruptores se pueden apagar', () => {
  let request: APIRequestContext;
  let csrfHeader: string | null = null;
  /** Valores tal y como estaban antes de tocar nada. */
  const originales = new Map<Interruptor, boolean>();

  test.beforeAll(async ({ playwright, baseURL }) => {
    if (motivoParaSaltar()) return;

    request = await playwright.request.newContext({ baseURL });

    const login = await request.post('/api/admin/login', {
      data: { email: adminEmail()!, password: adminPassword()! },
    });
    if (!login.ok()) return;

    csrfHeader = ((await login.json()) as { csrfToken?: string }).csrfToken ?? null;

    // Foto del estado actual, para devolverlo tal cual al terminar.
    const actual = await request.get('/api/admin/empresa');
    if (!actual.ok()) return;

    const empresa = (await actual.json()) as Record<string, unknown>;
    for (const campo of INTERRUPTORES) {
      const valor = empresa[EN_RESPUESTA[campo]];
      if (typeof valor === 'boolean') originales.set(campo, valor);
    }
  });

  test.afterAll(async () => {
    // Restaurar SIEMPRE, aunque alguna aserción haya fallado: este test toca la
    // configuración real del negocio.
    if (csrfHeader && originales.size > 0) {
      await request.put('/api/admin/empresa', {
        headers: { 'x-csrf-token': csrfHeader },
        data: Object.fromEntries(originales),
      }).catch(() => null);
    }
    await request?.dispose();
  });

  for (const campo of INTERRUPTORES) {
    test(`${campo}: apagarlo lo deja apagado tras releer`, async () => {
      const motivo = motivoParaSaltar();
      if (motivo) { test.skip(true, motivo); return; }
      if (!csrfHeader || !originales.has(campo)) {
        test.skip(true, 'Login de admin falló o la empresa no expone el campo');
        return;
      }

      const guardado = await request.put('/api/admin/empresa', {
        headers: { 'x-csrf-token': csrfHeader },
        data: { [campo]: false },
      });
      expect(guardado.status(), `PUT de ${campo}=false debería aceptarse`).toBeLessThan(400);

      const releido = await request.get('/api/admin/empresa');
      expect(releido.ok()).toBe(true);

      const empresa = (await releido.json()) as Record<string, unknown>;
      expect(
        empresa[EN_RESPUESTA[campo]],
        `${campo} volvió a true tras apagarlo: el false se perdió por el camino ` +
          `(un || null lo convierte en NULL y la columna cae a su DEFAULT)`,
      ).toBe(false);
    });
  }

  test('encenderlo de nuevo también persiste', async () => {
    const motivo = motivoParaSaltar();
    if (motivo) { test.skip(true, motivo); return; }
    if (!csrfHeader || !originales.has('mostrar_promociones')) {
      test.skip(true, 'Login de admin falló o la empresa no expone el campo');
      return;
    }

    await request.put('/api/admin/empresa', {
      headers: { 'x-csrf-token': csrfHeader },
      data: { mostrar_promociones: true },
    });

    const releido = await request.get('/api/admin/empresa');
    const empresa = (await releido.json()) as Record<string, unknown>;
    expect(empresa.mostrarPromociones).toBe(true);
  });

  test('un campo de texto vacío se guarda como ausente, no como cadena vacía', async () => {
    // La contraparte del caso anterior: aquí el vaciado SÍ debe convertirse en
    // NULL. Guardar '' dejaría un enlace roto en el pie de la web pública.
    const motivo = motivoParaSaltar();
    if (motivo) { test.skip(true, motivo); return; }
    if (!csrfHeader) {
      test.skip(true, 'Login de admin falló en beforeAll');
      return;
    }

    const antes = (await (await request.get('/api/admin/empresa')).json()) as Record<string, unknown>;
    const original = (antes.fb as string | null) ?? null;

    try {
      await request.put('/api/admin/empresa', {
        headers: { 'x-csrf-token': csrfHeader },
        data: { fb: '' },
      });

      const empresa = (await (await request.get('/api/admin/empresa')).json()) as Record<string, unknown>;
      expect(empresa.fb ?? null, 'una cadena vacía debería guardarse como NULL').toBeNull();
    } finally {
      await request.put('/api/admin/empresa', {
        headers: { 'x-csrf-token': csrfHeader },
        data: { fb: original ?? '' },
      }).catch(() => null);
    }
  });
});
