import { describe, it, expect } from 'vitest';
import { retencionClientesAnios, resumenLegalEmpresa } from '@/lib/empresa/tpv-legal';

describe('retencionClientesAnios', () => {
  it('con TPV: 5 años (los pedidos son registros fiscales del sistema)', () => {
    expect(retencionClientesAnios(true)).toBe(5);
  });

  it('sin TPV: 3 años (cubre la garantía legal; la facturación va fuera)', () => {
    expect(retencionClientesAnios(false)).toBe(3);
  });
});

describe('resumenLegalEmpresa', () => {
  it('con TPV: factura este sistema, con el modo VeriFactu, y hay registro de jornada', () => {
    const r = resumenLegalEmpresa({ tpvHabilitado: true, verifactuMode: 'no-verifactu' });
    expect(r.facturacion).toEqual({ estado: 'activo', texto: 'Este sistema (TPV) · VeriFactu: no-verifactu' });
    expect(r.registroJornada.estado).toBe('activo');
    expect(r.retencionClientes).toEqual({ estado: 'activo', texto: 'Se anonimizan a los 5 años sin actividad' });
  });

  it('con TPV y sin modo VeriFactu configurado lo dice explícitamente', () => {
    const r = resumenLegalEmpresa({ tpvHabilitado: true, verifactuMode: null });
    expect(r.facturacion.texto).toBe('Este sistema (TPV) · VeriFactu: sin configurar');
  });

  it('sin TPV: programa externo, sin registro de jornada (aviso) y 3 años', () => {
    const r = resumenLegalEmpresa({ tpvHabilitado: false, verifactuMode: 'verifactu' });
    expect(r.facturacion).toEqual({ estado: 'inactivo', texto: 'Programa externo (la web solo confirma pedidos)' });
    expect(r.registroJornada).toEqual({
      estado: 'aviso',
      texto: 'No disponible: si tiene empleados, debe registrar la jornada con otra herramienta',
    });
    expect(r.retencionClientes.texto).toBe('Se anonimizan a los 3 años sin actividad');
  });
});
