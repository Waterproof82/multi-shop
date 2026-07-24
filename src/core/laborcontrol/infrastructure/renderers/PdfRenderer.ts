import React from 'react';
import { Document, Page, Text, View, StyleSheet, renderToStream } from '@react-pdf/renderer';
import type { Readable } from 'stream';
import type { FichajeEvento, PerfilLaboral } from '../../domain/types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface EmpresaInfo { nombre: string; nif?: string }
interface ExportRow   { empleado: PerfilLaboral; fichajes: FichajeEvento[] }

// ─── Styles ───────────────────────────────────────────────────────────────────

const C = {
  gray100: '#f3f4f6',
  gray200: '#e5e7eb',
  gray500: '#6b7280',
  gray700: '#374151',
  black:   '#111827',
  amber:   '#92400e',
  amberBg: '#fffbeb',
};

const s = StyleSheet.create({
  page:        { padding: 36, fontSize: 9, fontFamily: 'Helvetica', color: C.black },
  // Header block
  headerBox:   { borderWidth: 1, borderColor: C.gray200, borderRadius: 4, padding: 10, marginBottom: 14 },
  docTitle:    { fontSize: 13, fontWeight: 'bold', marginBottom: 6 },
  headerGrid:  { flexDirection: 'row', gap: 24 },
  headerCol:   { flex: 1 },
  labelTxt:    { color: C.gray500, fontSize: 8, marginBottom: 1 },
  valueTxt:    { fontSize: 9, fontWeight: 'bold' },
  // Section label
  sectionLabel:{ fontSize: 7, fontWeight: 'bold', color: C.amber, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4, marginTop: 12 },
  // Table
  tableHeader: { flexDirection: 'row', backgroundColor: C.gray100, padding: '4 6', borderBottomWidth: 1, borderBottomColor: C.gray200 },
  tableRow:    { flexDirection: 'row', padding: '3 6', borderBottomWidth: 0.5, borderBottomColor: C.gray200 },
  tableRowAlt: { flexDirection: 'row', padding: '3 6', borderBottomWidth: 0.5, borderBottomColor: C.gray200, backgroundColor: '#fafafa' },
  colTs:     { width: 130 },
  colTipo:   { width: 90 },
  colTsServ: { width: 130 },
  colMotivo: { flex: 1 },
  thTxt:       { fontSize: 8, fontWeight: 'bold', color: C.gray700 },
  tdTxt:       { fontSize: 8.5 },
  // Summary box
  summaryBox:  { flexDirection: 'row', gap: 10, marginTop: 12 },
  sumCard:     { flex: 1, borderWidth: 1, borderColor: C.gray200, borderRadius: 4, padding: '6 8' },
  sumLabel:    { fontSize: 7, color: C.gray500, marginBottom: 2 },
  sumValue:    { fontSize: 11, fontWeight: 'bold' },
  // Legal footer
  legal:       { fontSize: 7, color: C.gray500, marginTop: 18, lineHeight: 1.5, borderTopWidth: 0.5, borderTopColor: C.gray200, paddingTop: 8 },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TIPO_LABEL: Record<string, string> = {
  entrada:      'Entrada',
  salida:       'Salida',
  inicio_pausa: 'Inicio pausa',
  fin_pausa:    'Fin pausa',
  correccion:   'Corrección',
};

const CONTRATO_LABEL: Record<string, string> = {
  indefinido:    'Indefinido',
  temporal:      'Temporal',
  obra_servicio: 'Obra y servicio',
  practicas:     'Prácticas',
  formacion:     'Formación',
  otro:          'Otro',
};

function fmtTs(d: Date): string {
  return d.toLocaleString('es-ES', {
    timeZone:  'Europe/Madrid',
    day:       '2-digit',
    month:     '2-digit',
    year:      'numeric',
    hour:      '2-digit',
    minute:    '2-digit',
    second:    '2-digit',
    hour12:    false,
  });
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function calcTotales(fichajes: FichajeEvento[]): { horasTrabajadas: number; diasConRegistro: number } {
  let totalMs = 0;
  let workStart: Date | null = null;
  const dias = new Set<string>();

  const sorted = [...fichajes]
    .filter(f => f.tipo !== 'correccion')
    .sort((a, b) => a.timestampEvento.getTime() - b.timestampEvento.getTime());

  for (const f of sorted) {
    dias.add(f.timestampEvento.toISOString().slice(0, 10));
    if (f.tipo === 'entrada' || f.tipo === 'fin_pausa') {
      workStart = f.timestampEvento;
    } else if ((f.tipo === 'salida' || f.tipo === 'inicio_pausa') && workStart !== null) {
      totalMs += f.timestampEvento.getTime() - workStart.getTime();
      workStart = null;
    }
  }

  return { horasTrabajadas: totalMs / 3_600_000, diasConRegistro: dias.size };
}

function fmtHoras(h: number): string {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return `${hh}h ${String(mm).padStart(2, '0')}m`;
}

// ─── PDF Document ─────────────────────────────────────────────────────────────

function FichajesDocument({ rows, from, to, empresa, generadoEn }: Readonly<{
  rows: ExportRow[];
  from: Date;
  to: Date;
  empresa: EmpresaInfo;
  generadoEn: Date;
}>) {
  return React.createElement(Document, {},
    ...rows.map(({ empleado, fichajes }) => {
      const { horasTrabajadas, diasConRegistro } = calcTotales(fichajes);
      const empleadoDisplay = empleado.empleadoNombre ?? empleado.empleadoId;
      const contratoDisplay = CONTRATO_LABEL[empleado.tipoContrato] ?? empleado.tipoContrato;

      return React.createElement(Page, { key: empleado.empleadoId, size: 'A4', style: s.page },
        React.createElement(View, {},

          // ── Header card ──
          React.createElement(View, { style: s.headerBox },
            React.createElement(Text, { style: s.docTitle }, 'Registro de Jornada Laboral'),
            React.createElement(View, { style: s.headerGrid },
              // Empresa
              React.createElement(View, { style: s.headerCol },
                React.createElement(Text, { style: s.labelTxt }, 'Empresa'),
                React.createElement(Text, { style: s.valueTxt }, empresa.nombre),
                empresa.nif !== undefined && React.createElement(Text, { style: { fontSize: 8, color: C.gray500, marginTop: 1 } }, `NIF: ${empresa.nif}`),
              ),
              // Empleado
              React.createElement(View, { style: s.headerCol },
                React.createElement(Text, { style: s.labelTxt }, 'Empleado'),
                React.createElement(Text, { style: s.valueTxt }, empleadoDisplay),
                React.createElement(Text, { style: { fontSize: 8, color: C.gray500, marginTop: 1 } },
                  `${contratoDisplay}${empleado.tiempoParcial ? ' · Tiempo parcial' : ''}`
                ),
              ),
              // Período
              React.createElement(View, { style: s.headerCol },
                React.createElement(Text, { style: s.labelTxt }, 'Período'),
                React.createElement(Text, { style: s.valueTxt }, `${fmtDate(from)} – ${fmtDate(to)}`),
                React.createElement(Text, { style: { fontSize: 8, color: C.gray500, marginTop: 1 } },
                  `Generado: ${fmtTs(generadoEn)}`
                ),
              ),
            ),
          ),

          // ── Summary cards ──
          React.createElement(Text, { style: s.sectionLabel }, 'Resumen del período'),
          React.createElement(View, { style: s.summaryBox },
            React.createElement(View, { style: s.sumCard },
              React.createElement(Text, { style: s.sumLabel }, 'Horas trabajadas'),
              React.createElement(Text, { style: s.sumValue }, fmtHoras(horasTrabajadas)),
            ),
            React.createElement(View, { style: s.sumCard },
              React.createElement(Text, { style: s.sumLabel }, 'Días con registro'),
              React.createElement(Text, { style: s.sumValue }, String(diasConRegistro)),
            ),
            React.createElement(View, { style: s.sumCard },
              React.createElement(Text, { style: s.sumLabel }, 'Total eventos'),
              React.createElement(Text, { style: s.sumValue }, String(fichajes.length)),
            ),
          ),

          // ── Events table ──
          React.createElement(Text, { style: s.sectionLabel }, 'Detalle de eventos'),

          // Table header
          React.createElement(View, { style: s.tableHeader },
            React.createElement(Text, { style: [s.thTxt, s.colTs] },     'Fecha/hora evento'),
            React.createElement(Text, { style: [s.thTxt, s.colTipo] },   'Tipo'),
            React.createElement(Text, { style: [s.thTxt, s.colTsServ] }, 'Fecha/hora servidor'),
            React.createElement(Text, { style: [s.thTxt, s.colMotivo] }, 'Motivo / Corrección'),
          ),

          // Table rows
          ...fichajes.map((f, i) =>
            React.createElement(View, { key: f.recordId, style: i % 2 === 0 ? s.tableRow : s.tableRowAlt },
              React.createElement(Text, { style: [s.tdTxt, s.colTs] },     fmtTs(f.timestampEvento)),
              React.createElement(Text, { style: [s.tdTxt, s.colTipo] },   TIPO_LABEL[f.tipo] ?? f.tipo),
              React.createElement(Text, { style: [s.tdTxt, s.colTsServ] }, fmtTs(f.timestampServidor)),
              React.createElement(Text, { style: [s.tdTxt, s.colMotivo] }, f.motivo ?? ''),
            )
          ),

          // ── Legal footer ──
          React.createElement(Text, { style: s.legal },
            'El presente registro de jornada ha sido generado en cumplimiento del Art. 34.9 del Estatuto de los Trabajadores y el RD-Ley 8/2019. '
            + 'El tratamiento de datos tiene base legal en el Art. 6.1.c del RGPD (obligación legal). '
            + 'Los registros son inmutables: cada evento está vinculado al anterior mediante cadena SHA-256. '
            + 'Los datos se conservarán durante un mínimo de 4 años conforme al Art. 34.9 ET. '
            + 'Acceso RLT garantizado por Art. 64 ET.'
          ),
        )
      );
    })
  );
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function renderFichajesPdf(
  rows: ExportRow[],
  from: Date,
  to: Date,
  empresa: EmpresaInfo,
): Promise<Readable> {
  const element = React.createElement(FichajesDocument, {
    rows, from, to, empresa, generadoEn: new Date(),
  });
  return renderToStream(element as Parameters<typeof renderToStream>[0]) as unknown as Readable;
}
