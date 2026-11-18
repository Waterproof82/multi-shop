import { describe, expect, it } from 'vitest';
import {
  avisosDebidos,
  claveAviso,
  clavesVigentes,
  parsearClaveAviso,
  type EnviadoAviso,
  type KitParaAvisos,
} from '@/lib/kit-caducidad/avisos';

// sdd kit-expiry-reminders R4: avisos a 30 y 15 días, una sola vez por
// (serie, ingrediente, parte, umbral), con recuperación de días perdidos.
// La clave usa el id del ingrediente (FK), nunca su nombre.

const PASTILLAS = 'Pastillas Potabilizadoras de Agua (50 uds.)';
const PASTILLAS_ID = "11111111-1111-4111-8111-111111111111";
const BOTIQUIN_ID = "22222222-2222-4222-8222-222222222222";
const BOTIQUIN = 'Botiquín de primeros auxilios conforme a DIN 13164';

function kit(caducidades: KitParaAvisos['caducidades'], extra: Partial<KitParaAvisos> = {}): KitParaAvisos {
  return { serie: 'KEC-AAAA-BBBB-C', kitSlug: 'kit-estandar-72h', avisosEmail: true, caducidades, ...extra };
}

describe('avisosDebidos', () => {
  const lote = [{ ingredienteId: PASTILLAS_ID, consumible: PASTILLAS, parte: '', caducaEl: '2031-03-01' }];

  it('envía el aviso de 30 días el día que faltan 30', () => {
    // Act
    const [aviso] = avisosDebidos('2031-01-30', [kit(lote)], new Set());

    // Assert
    expect(aviso.elementos).toEqual([{ ingredienteId: PASTILLAS_ID, consumible: PASTILLAS, parte: '', caducaEl: '2031-03-01', umbralDias: 30 }]);
    expect(aviso.marcar).toEqual([claveAviso('KEC-AAAA-BBBB-C', PASTILLAS_ID, '', 30)]);
  });

  it('no envía nada a más de 30 días', () => {
    expect(avisosDebidos('2031-01-29', [kit(lote)], new Set())).toEqual([]);
  });

  it('envía el de 15 días aunque ya se enviara el de 30', () => {
    const enviados = new Set([claveAviso('KEC-AAAA-BBBB-C', PASTILLAS_ID, '', 30)]);

    const [aviso] = avisosDebidos('2031-02-14', [kit(lote)], enviados);

    expect(aviso.elementos[0].umbralDias).toBe(15);
  });

  it('no repite un aviso ya enviado', () => {
    const enviados = new Set([
      claveAviso('KEC-AAAA-BBBB-C', PASTILLAS_ID, '', 30),
      claveAviso('KEC-AAAA-BBBB-C', PASTILLAS_ID, '', 15),
    ]);

    expect(avisosDebidos('2031-02-14', [kit(lote)], enviados)).toEqual([]);
  });

  it('recupera días perdidos: si ya toca el de 15, manda uno y marca los dos', () => {
    const [aviso] = avisosDebidos('2031-02-20', [kit(lote)], new Set());

    expect(aviso.elementos).toHaveLength(1);
    expect(aviso.elementos[0].umbralDias).toBe(15);
    expect(aviso.marcar.sort()).toEqual(
      [claveAviso('KEC-AAAA-BBBB-C', PASTILLAS_ID, '', 30), claveAviso('KEC-AAAA-BBBB-C', PASTILLAS_ID, '', 15)].sort(),
    );
  });

  it('no avisa de algo ya caducado', () => {
    expect(avisosDebidos('2031-03-02', [kit(lote)], new Set())).toEqual([]);
  });

  it('agrupa en un solo aviso por kit todo lo que toca ese día, botiquín por partes', () => {
    const [aviso] = avisosDebidos(
      '2031-01-30',
      [
        kit([
          ...lote,
          { ingredienteId: BOTIQUIN_ID, consumible: BOTIQUIN, parte: 'Antiséptico', caducaEl: '2031-02-10' },
          { ingredienteId: BOTIQUIN_ID, consumible: BOTIQUIN, parte: 'Gasas estériles', caducaEl: '2035-01-01' },
        ]),
      ],
      new Set(),
    );

    expect(aviso.elementos.map((e) => e.parte)).toEqual(['', 'Antiséptico']);
  });

  it('no repite un aviso aunque el ingrediente cambie de nombre', () => {
    // Arrange
    const enviados = new Set([claveAviso('KEC-AAAA-BBBB-C', PASTILLAS_ID, '', 30)]);
    const renombrado = [{ ...lote[0], consumible: 'Tabletas potabilizadoras (50 uds.)' }];

    // Act
    const avisos = avisosDebidos('2031-01-30', [kit(renombrado)], enviados);

    // Assert
    expect(avisos).toEqual([]);
  });

  it('ignora los kits sin avisos por email activos', () => {
    expect(avisosDebidos('2031-01-30', [kit(lote, { avisosEmail: false })], new Set())).toEqual([]);
  });
});

// sdd kit-expiry-m3 (docs/sdd/kit-expiry-reminders/m3/), M3b/DD2:
// `parsearClaveAviso` deshace `claveAviso` para el cron (leer
// `kit_avisos_enviados` y escribir `marcarEnviados`). La `parte` puede
// contener `|` (ej. "Antiséptico | caja"), así que la clave NO se puede
// partir en 5 trozos fijos: solo el 1.º, el 2.º, el penúltimo y el último
// tienen posición fija.
describe('parsearClaveAviso', () => {
  it('deshace claveAviso (ida y vuelta) con una parte vacía', () => {
    const clave = claveAviso('KEC-AAAA-BBBB-C', PASTILLAS_ID, '', 30);

    expect(parsearClaveAviso(clave)).toEqual({
      serie: 'KEC-AAAA-BBBB-C',
      ingredienteId: PASTILLAS_ID,
      parte: '',
      umbralDias: 30,
    });
  });

  it('deshace claveAviso con una parte que contiene "|"', () => {
    const clave = claveAviso('KEC-AAAA-BBBB-C', BOTIQUIN_ID, 'Antiséptico|caja', 15);

    expect(parsearClaveAviso(clave)).toEqual({
      serie: 'KEC-AAAA-BBBB-C',
      ingredienteId: BOTIQUIN_ID,
      parte: 'Antiséptico|caja',
      umbralDias: 15,
    });
  });

  it('devuelve null con menos de 5 trozos', () => {
    expect(parsearClaveAviso('serie|ingrediente|30|email')).toBeNull();
  });

  it('devuelve null con un umbral distinto de 30/15', () => {
    expect(parsearClaveAviso('serie|ingrediente||45|email')).toBeNull();
  });

  it('devuelve null con un canal distinto de "email"', () => {
    expect(parsearClaveAviso('serie|ingrediente||30|whatsapp')).toBeNull();
  });
});

// M3b/DD3: `clavesVigentes` descarta los avisos enviados a un titular
// ANTERIOR al actual (el que se dio de baja y otro registró la serie) —
// esos no cuentan como ya enviados, y el titular nuevo vuelve a recibirlos.
describe('clavesVigentes', () => {
  const FILA: EnviadoAviso = { serie: 'KEC-AAAA-BBBB-C', ingredienteId: PASTILLAS_ID, parte: '', umbralDias: 30, enviadoAt: '2031-01-30T08:00:00Z' };

  it('una fila con enviadoAt anterior al registradoAt de su serie no entra', () => {
    const registradoAt = new Map([['KEC-AAAA-BBBB-C', '2031-02-01T00:00:00Z']]);

    expect(clavesVigentes([FILA], registradoAt)).toEqual(new Set());
  });

  it('una fila con enviadoAt igual al registradoAt de su serie entra', () => {
    const registradoAt = new Map([['KEC-AAAA-BBBB-C', FILA.enviadoAt]]);

    expect(clavesVigentes([FILA], registradoAt)).toEqual(
      new Set([claveAviso(FILA.serie, FILA.ingredienteId, FILA.parte, FILA.umbralDias)]),
    );
  });

  it('una fila con enviadoAt posterior al registradoAt de su serie entra', () => {
    const registradoAt = new Map([['KEC-AAAA-BBBB-C', '2031-01-01T00:00:00Z']]);

    expect(clavesVigentes([FILA], registradoAt)).toEqual(
      new Set([claveAviso(FILA.serie, FILA.ingredienteId, FILA.parte, FILA.umbralDias)]),
    );
  });

  it('una serie sin registradoAt no entra', () => {
    expect(clavesVigentes([FILA], new Map())).toEqual(new Set());
  });
});
