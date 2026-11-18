import type { FlagsLegales } from '@/core/domain/entities/empresa-legal';

export interface CategoriaDatos {
  readonly titulo: string;
  readonly descripcion: string;
}

export function categoriasDatosDe(f: FlagsLegales): CategoriaDatos[] {
  const lista: CategoriaDatos[] = [
    { titulo: 'Datos identificativos', descripcion: 'nombre y apellidos.' },
    { titulo: 'Datos de contacto', descripcion: 'teléfono y correo electrónico.' },
  ];
  if (f.deliveryHabilitado || f.envioDomicilioHabilitado) {
    lista.push({ titulo: 'Datos de dirección', descripcion: 'dirección de entrega, solo para pedidos con entrega a domicilio.' });
  }
  lista.push({ titulo: 'Datos económicos', descripcion: 'importe del pedido. No se almacenan datos de tarjeta de crédito.' });
  if (f.kitsCaducidadHabilitado) {
    lista.push({
      titulo: 'Datos de avisos de caducidad del kit',
      descripcion: 'email y, opcionalmente, teléfono de quien registra la serie del kit; y la fecha y la versión de cada consentimiento.',
    });
  }
  return lista;
}
