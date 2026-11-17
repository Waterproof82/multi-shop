import { describe, expect, it } from 'vitest';
import { avisosDebidos, claveAviso, type KitParaAvisos } from '@/lib/kit-caducidad/avisos';

// sdd kit-expiry-reminders R4: avisos a 30 y 15 días, una sola vez por
// (serie, consumible, parte, umbral), con recuperación de días perdidos.

const PASTILLAS = 'Pastillas Potabilizadoras de Agua (50 uds.)';
const BOTIQUIN = 'Botiquín de primeros auxilios conforme a DIN 13164';

function kit(caducidades: KitParaAvisos['caducidades'], extra: Partial<KitParaAvisos> = {}): KitParaAvisos {
  return { serie: 'KEC-AAAA-BBBB-C', kitSlug: 'kit-estandar-72h', avisosEmail: true, caducidades, ...extra };
}

describe('avisosDebidos', () => {
  const lote = [{ consumible: PASTILLAS, parte: '', caducaEl: '2031-03-01' }];

  it('envía el aviso de 30 días el día que faltan 30', () => {
    // Act
    const [aviso] = avisosDebidos('2031-01-30', [kit(lote)], new Set());

    // Assert
    expect(aviso.elementos).toEqual([{ consumible: PASTILLAS, parte: '', caducaEl: '2031-03-01', umbralDias: 30 }]);
    expect(aviso.marcar).toEqual([claveAviso('KEC-AAAA-BBBB-C', PASTILLAS, '', 30)]);
  });

  it('no envía nada a más de 30 días', () => {
    expect(avisosDebidos('2031-01-29', [kit(lote)], new Set())).toEqual([]);
  });

  it('envía el de 15 días aunque ya se enviara el de 30', () => {
    const enviados = new Set([claveAviso('KEC-AAAA-BBBB-C', PASTILLAS, '', 30)]);

    const [aviso] = avisosDebidos('2031-02-14', [kit(lote)], enviados);

    expect(aviso.elementos[0].umbralDias).toBe(15);
  });

  it('no repite un aviso ya enviado', () => {
    const enviados = new Set([
      claveAviso('KEC-AAAA-BBBB-C', PASTILLAS, '', 30),
      claveAviso('KEC-AAAA-BBBB-C', PASTILLAS, '', 15),
    ]);

    expect(avisosDebidos('2031-02-14', [kit(lote)], enviados)).toEqual([]);
  });

  it('recupera días perdidos: si ya toca el de 15, manda uno y marca los dos', () => {
    const [aviso] = avisosDebidos('2031-02-20', [kit(lote)], new Set());

    expect(aviso.elementos).toHaveLength(1);
    expect(aviso.elementos[0].umbralDias).toBe(15);
    expect(aviso.marcar.sort()).toEqual(
      [claveAviso('KEC-AAAA-BBBB-C', PASTILLAS, '', 30), claveAviso('KEC-AAAA-BBBB-C', PASTILLAS, '', 15)].sort(),
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
          { consumible: BOTIQUIN, parte: 'Antiséptico', caducaEl: '2031-02-10' },
          { consumible: BOTIQUIN, parte: 'Gasas estériles', caducaEl: '2035-01-01' },
        ]),
      ],
      new Set(),
    );

    expect(aviso.elementos.map((e) => e.parte)).toEqual(['', 'Antiséptico']);
  });

  it('ignora los kits sin avisos por email activos', () => {
    expect(avisosDebidos('2031-01-30', [kit(lote, { avisosEmail: false })], new Set())).toEqual([]);
  });
});
