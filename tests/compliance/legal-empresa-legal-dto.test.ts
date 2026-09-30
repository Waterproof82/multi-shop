import { describe, it, expect } from 'vitest';
import {
  updateEmpresaLegalSchema,
  parseGarantiasGuardadas,
  parseExclusionesGuardadas,
} from '@/core/application/dtos/empresa-legal.dto';

const valido = {
  registroMercantil: 'RM Tenerife, tomo 2690, folio 193',
  emailLegal: '',
  direccionDevoluciones: '',
  plazoDesistimientoDias: 14,
  gastosDevolucion: 'cliente',
  plazoPreparacionDias: 2,
  plazoAvisoDanosHoras: 24,
  garantias: [{ ambito: 'Todos los productos', estado: 'nuevo', mesesLegales: 36, mesesComercialesExtra: 0 }],
  exclusionesDesistimiento: { supuestos: ['personalizados'], otras: '' },
  adicionalAvisoLegal: '',
  adicionalCondiciones: '',
  adicionalEnvios: '',
  adicionalDevoluciones: '',
};

describe('updateEmpresaLegalSchema — suelos legales', () => {
  it('acepta el caso válido y convierte strings vacíos en null', () => {
    const r = updateEmpresaLegalSchema.safeParse(valido);
    expect(r.success).toBe(true);
    expect(r.data?.emailLegal).toBeNull();
    expect(r.data?.exclusionesDesistimiento.otras).toBeNull();
  });

  it('rechaza 13 días de desistimiento y acepta 14 exactos', () => {
    expect(updateEmpresaLegalSchema.safeParse({ ...valido, plazoDesistimientoDias: 13 }).success).toBe(false);
    expect(updateEmpresaLegalSchema.safeParse({ ...valido, plazoDesistimientoDias: 14 }).success).toBe(true);
  });

  it('rechaza garantía de producto nuevo distinta de 36 meses', () => {
    const r = updateEmpresaLegalSchema.safeParse({
      ...valido,
      garantias: [{ ambito: 'Baterías', estado: 'nuevo', mesesLegales: 24, mesesComercialesExtra: 0 }],
    });
    expect(r.success).toBe(false);
  });

  it('rechaza segunda mano con 11 meses y acepta 12', () => {
    const fila = { ambito: 'Reacondicionados', estado: 'segunda_mano', mesesComercialesExtra: 0 };
    expect(updateEmpresaLegalSchema.safeParse({ ...valido, garantias: [{ ...fila, mesesLegales: 11 }] }).success).toBe(false);
    expect(updateEmpresaLegalSchema.safeParse({ ...valido, garantias: [{ ...fila, mesesLegales: 12 }] }).success).toBe(true);
  });

  it('rechaza un supuesto de exclusión que no está en el art. 103', () => {
    const r = updateEmpresaLegalSchema.safeParse({
      ...valido,
      exclusionesDesistimiento: { supuestos: ['lo_que_yo_diga'], otras: null },
    });
    expect(r.success).toBe(false);
  });

  it('rechaza textos adicionales de más de 2000 caracteres', () => {
    expect(updateEmpresaLegalSchema.safeParse({ ...valido, adicionalCondiciones: 'x'.repeat(2001) }).success).toBe(false);
  });

  it('rechaza un email legal mal formado', () => {
    expect(updateEmpresaLegalSchema.safeParse({ ...valido, emailLegal: 'no-es-email' }).success).toBe(false);
  });

  it('descarta claves desconocidas (no se puede colar empresaId)', () => {
    const r = updateEmpresaLegalSchema.safeParse({ ...valido, empresaId: 'otra' });
    expect(r.success).toBe(true);
    expect(r.data).not.toHaveProperty('empresaId');
  });
});

describe('lectura defensiva del JSONB guardado', () => {
  it('JSONB corrupto de garantías → lista vacía', () => {
    expect(parseGarantiasGuardadas('basura')).toEqual([]);
    expect(parseGarantiasGuardadas([{ ambito: 1 }])).toEqual([]);
  });

  it('JSONB corrupto de exclusiones → sin exclusiones', () => {
    expect(parseExclusionesGuardadas(null)).toEqual({ supuestos: [], otras: null });
  });

  it('JSONB válido se devuelve tal cual', () => {
    const g = [{ ambito: 'Todo', estado: 'nuevo', mesesLegales: 36, mesesComercialesExtra: 12 }];
    expect(parseGarantiasGuardadas(g)).toEqual(g);
  });
});
