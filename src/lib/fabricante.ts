/**
 * Datos del fabricante (productor del software TPV) y encargado del tratamiento.
 * Titular: José Miguel Aristía Gordillo, persona física; "Digitalizatenerife" es su nombre comercial.
 * Actualizar aquí cuando cambie el titular / NIF.
 *
 * Si cambia el PRODUCTOR (no solo un dato de contacto), `DECLARATION_DATE` debe
 * cambiar también: la declaración responsable del RD 1007/2023 la suscribe el
 * productor, y una declaración nueva lleva fecha nueva. Mismo motivo para el
 * contrato de encargo (DPA) con cada tenant (art. 28 RGPD).
 */
export const FABRICANTE = {
  nombre: 'José Miguel Aristía Gordillo',
  nombreComercial: 'Digitalizatenerife',
  nif: '02670352Y',
  direccion: 'C/ Médico Ernesto Castro, 57, 38358 Mesa del Mar, Tacoronte (Santa Cruz de Tenerife)',
  email: 'info@digitalizatenerife.es',
  telefono: '+34 601 396 419',
  web: 'https://digitalizatenerife.es',
} as const;

export const TPV_VERSION = '1.0.0';
export const DECLARATION_DATE = '2026-09-30';
