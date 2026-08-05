/**
 * El canal de sesiones de mesa debe llevar scope de empresa, y los dos extremos
 * deben construir el nombre IGUAL.
 *
 * POR QUÉ ESTE TEST EXISTE
 * En Realtime Broadcast el nombre del canal es la clave de enrutado: no hay
 * `filter` ni RLS por fila. Eso tiene dos consecuencias, y las dos son mudas.
 *
 *   1. Si el emisor (el trigger de Postgres) y el receptor (el cliente) no
 *      escriben EXACTAMENTE el mismo nombre, la suscripción se establece bien,
 *      no da error, y no llega nada nunca. El síntoma aparece días después como
 *      "a mí no me salta la comanda".
 *
 *   2. Si alguien vuelve a poner un nombre fijo sin `empresaId`, el canal
 *      reabre el firehose global: cualquiera con la anon key (pública por
 *      diseño) recibe la actividad de mesas de todos los tenants. Tampoco falla
 *      nada — simplemente vuelve a filtrar.
 *
 * Ningún test de integración pilla ninguno de los dos. Por eso se comprueba
 * sobre el código fuente.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { mesaSesionChannel } from '../../src/lib/realtime-channels';

const RAIZ = resolve(__dirname, '../..');
const SRC = join(RAIZ, 'src');
const MIGRACION = join(
  RAIZ,
  'supabase/migrations/20260805080303_mesa_sesion_channel_por_empresa.sql',
);

/** El único módulo autorizado a componer el nombre del canal. */
const HELPER = 'lib/realtime-channels.ts';

function listarFuentes(dir: string): string[] {
  const salida: string[] = [];
  for (const entrada of readdirSync(dir)) {
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) {
      salida.push(...listarFuentes(ruta));
    } else if (/\.tsx?$/.test(entrada)) {
      salida.push(ruta);
    }
  }
  return salida;
}

/** `.channel('mesa-sesion-update')` literal — con o sin sufijo escrito a mano. */
const CANAL_HARDCODEADO = /\.channel\(\s*['"`]mesa-sesion-update/;

describe('scope de empresa en el canal de sesiones de mesa', () => {
  it('incluye el empresaId en el nombre', () => {
    const empresa = '3f2a9c1e-7b04-4d55-9e31-8a6c0f2d4b77';
    expect(mesaSesionChannel(empresa)).toContain(empresa);
  });

  it('da un canal distinto por empresa', () => {
    // Esta es LA propiedad. Si dos empresas comparten canal, comparten eventos.
    expect(mesaSesionChannel('empresa-a')).not.toBe(mesaSesionChannel('empresa-b'));
  });

  it('nadie construye el nombre del canal a mano', () => {
    const infractores = listarFuentes(SRC)
      .map((ruta) => ({ ruta, rel: relative(SRC, ruta).replaceAll('\\', '/') }))
      .filter(({ rel }) => rel !== HELPER)
      .filter(({ ruta }) => CANAL_HARDCODEADO.test(readFileSync(ruta, 'utf8')))
      .map(({ rel }) => rel);

    expect(
      infractores,
      `Estos módulos escriben el nombre del canal a mano. Un nombre fijo sin empresaId ` +
        `reabre el canal global a todos los tenants; uno con sufijo escrito a mano se ` +
        `desincroniza del trigger en silencio. Usar mesaSesionChannel(empresaId):\n` +
        infractores.map((f) => `  - ${f}`).join('\n'),
    ).toEqual([]);
  });
});

describe('el trigger y el cliente coinciden', () => {
  const sql = readFileSync(MIGRACION, 'utf8');

  it('el trigger publica en el mismo prefijo que compone el helper', () => {
    // `mesaSesionChannel('X')` da 'mesa-sesion-update:X'; el trigger concatena
    // 'mesa-sesion-update:' || NEW.empresa_id. Se compara el prefijo real, no una
    // cadena copiada, para que renombrar el canal en el helper rompa este test.
    const prefijo = mesaSesionChannel('').replace(/'/g, "''");
    expect(sql).toContain(`'${prefijo}' || NEW.empresa_id`);
  });

  it('la ventana de convivencia con el canal legacy expira sola', () => {
    // El corte no puede depender de que alguien recuerde aplicar una segunda
    // migración: mientras exista el topic sin scope, la fuga sigue abierta.
    expect(sql).toMatch(/v_legacy_hasta\s+CONSTANT\s+timestamptz\s*:=\s*TIMESTAMPTZ\s*'/);
    expect(sql).toMatch(/IF\s+now\(\)\s*<\s*v_legacy_hasta\s+THEN/);
  });

  it('el canal legacy solo se emite dentro de esa ventana', () => {
    // Es decir: el `realtime.send` al topic sin scope tiene que estar DENTRO del
    // IF. Si alguien lo saca fuera "para no romper nada", la fuga es permanente.
    const dentroDelIf = /IF\s+now\(\)\s*<\s*v_legacy_hasta\s+THEN[\s\S]*?'mesa-sesion-update'[\s\S]*?END IF;/;
    expect(sql).toMatch(dentroDelIf);
  });
});
