import type { LegalContext, GarantiaFila } from '@/core/domain/entities/empresa-legal';
import { etiquetaArt103, PLAZO_REEMBOLSO_DIAS } from '@/core/domain/legal/constantes';
import { garantiasVisibles, formatMeses } from '@/lib/legal/garantias';
import { InfoTable, Section, TablaSimple, TextoAdicional } from './legal-layout';

const ESTADO: Record<GarantiaFila['estado'], string> = { nuevo: 'Nuevo', segunda_mano: 'Segunda mano' };

const ANEXO_B_LINEAS = [
  'Por la presente le comunico/comunicamos (*) que desisto de mi/desistimos de nuestro (*) contrato de venta del siguiente bien/prestación del siguiente servicio (*)',
  'Pedido el/recibido el (*):',
  'Nombre del consumidor o de los consumidores:',
  'Domicilio del consumidor o de los consumidores:',
  'Firma del consumidor o de los consumidores (solo si el presente formulario se presenta en papel):',
  'Fecha:',
  '(*) Táchese lo que no proceda.',
];

function construirDestinatario(titular: LegalContext['titular']): string {
  const partes = [titular.nombre];
  if (titular.direccion !== null) partes.push(titular.direccion);
  if (titular.email !== null) partes.push(titular.email);
  return `A la atención de: ${partes.join(', ')}`;
}

function FormularioDesistimiento({ titular }: Readonly<{ titular: LegalContext['titular'] }>) {
  return (
    <Section titulo="Modelo de formulario de desistimiento">
      <p>Puede utilizar este modelo, aunque no es obligatorio:</p>
      <div className="rounded-[3px] border border-foreground/10 p-3 whitespace-pre-line text-sm">
        {construirDestinatario(titular)}
        {'\n\n'}
        {ANEXO_B_LINEAS.join('\n')}
      </div>
    </Section>
  );
}

function Gastos({ quien }: Readonly<{ quien: LegalContext['legal']['gastosDevolucion'] }>) {
  if (quien === 'empresa') return <p>Los gastos de devolución corren a nuestro cargo.</p>;
  return <p>Los gastos directos de devolución corren a cargo del cliente, salvo que el producto sea defectuoso o no corresponda con lo pedido.</p>;
}

function Exclusiones({ ctx }: Readonly<{ ctx: LegalContext }>) {
  const { supuestos, otras } = ctx.legal.exclusionesDesistimiento;
  if (supuestos.length === 0 && otras === null) return null;
  return (
    <Section titulo="Productos excluidos del desistimiento">
      <ul className="list-disc list-inside space-y-1 pl-2">
        {supuestos.map((s) => <li key={s}>{etiquetaArt103(s)}</li>)}
        {otras !== null && <li className="whitespace-pre-line">{otras}</li>}
      </ul>
    </Section>
  );
}

export function DevolucionesContenido({ ctx }: Readonly<{ ctx: LegalContext }>) {
  const { legal, titular } = ctx;
  const garantias = garantiasVisibles(legal.garantias);
  return (
    <>
      <Section titulo="1. Derecho de desistimiento">
        <p>
          Dispone de <strong>{legal.plazoDesistimientoDias} días naturales</strong> desde la recepción del pedido para desistir
          de la compra sin necesidad de justificación.
        </p>
        <p>Para ejercerlo, comuníquenoslo de forma inequívoca{titular.email ? ` por email a ${titular.email}` : ''}. Después, dispone de 14 días para enviarnos el producto, sin usar y con su embalaje original, a:</p>
        <InfoTable rows={[ctx.direccionDevoluciones ? ['Dirección de devolución', ctx.direccionDevoluciones] : null]} />
        <Gastos quien={legal.gastosDevolucion} />
      </Section>

      <Section titulo="2. Reembolso">
        <p>Le reembolsaremos el importe pagado, incluidos los gastos de envío iniciales (salvo el sobrecoste de una modalidad de envío más cara que la estándar), en un plazo máximo de {PLAZO_REEMBOLSO_DIAS} días desde que nos comunique el desistimiento, por el mismo medio de pago. Podemos retener el reembolso hasta haber recibido el producto o hasta que usted nos presente una prueba de su devolución, lo que ocurra primero.</p>
      </Section>

      <FormularioDesistimiento titular={titular} />

      <Exclusiones ctx={ctx} />

      <Section titulo="Garantía">
        <p>Todos los productos cuentan con la garantía legal del Real Decreto Legislativo 1/2007. En caso de falta de conformidad puede elegir entre la reparación o la sustitución del producto y, si no fuese posible, la rebaja del precio o la resolución del contrato.</p>
        <TablaSimple
          cabeceras={['Productos', 'Estado', 'Garantía legal', 'Garantía comercial adicional']}
          filas={garantias.map((g) => [g.ambito, ESTADO[g.estado], formatMeses(g.mesesLegales), formatMeses(g.mesesComercialesExtra)])}
        />
        <p className="text-xs text-muted-foreground">La garantía comercial adicional se suma a la legal y no la sustituye.</p>
      </Section>

      <TextoAdicional texto={legal.adicionalDevoluciones} />
    </>
  );
}
