import React from 'react';
import { Document, Page, Text, View, StyleSheet, renderToStream } from '@react-pdf/renderer';
import type { Readable } from 'stream';
import type { FichajeEvento, PerfilLaboral } from '../../domain/types';

const styles = StyleSheet.create({
  page:    { padding: 30, fontSize: 9, fontFamily: 'Helvetica' },
  title:   { fontSize: 14, marginBottom: 12, fontWeight: 'bold' },
  header:  { flexDirection: 'row', backgroundColor: '#e5e7eb', padding: 4, marginBottom: 2 },
  row:     { flexDirection: 'row', padding: 3, borderBottomWidth: 0.5, borderBottomColor: '#d1d5db' },
  cell:    { flex: 1 },
  cellWide:{ flex: 2 },
  legal:   { fontSize: 7, marginTop: 20, color: '#6b7280' },
});

interface ExportRow {
  empleado: PerfilLaboral;
  fichajes: FichajeEvento[];
}

function formatTs(d: Date): string {
  return d.toLocaleString('es-ES', { timeZone: 'Europe/Madrid', hour12: false });
}

function FichajesDocument({ rows, from, to, empresaNombre }: Readonly<{
  rows: ExportRow[];
  from: Date;
  to: Date;
  empresaNombre: string;
}>) {
  return React.createElement(Document, {},
    ...rows.map(({ empleado, fichajes }) =>
      React.createElement(Page, { key: empleado.empleadoId, size: 'A4', style: styles.page },
        React.createElement(View, {},
          React.createElement(Text, { style: styles.title },
            `Registro de jornada — ${empresaNombre}`
          ),
          React.createElement(Text, { style: { marginBottom: 8 } },
            `Empleado: ${empleado.empleadoId}  |  Período: ${from.toLocaleDateString('es-ES')} – ${to.toLocaleDateString('es-ES')}`
          ),
          React.createElement(View, { style: styles.header },
            React.createElement(Text, { style: styles.cellWide }, 'Fecha/hora evento'),
            React.createElement(Text, { style: styles.cell }, 'Tipo'),
            React.createElement(Text, { style: styles.cellWide }, 'Fecha/hora servidor'),
            React.createElement(Text, { style: styles.cell }, 'Offline'),
          ),
          ...fichajes.map((f, i) =>
            React.createElement(View, { key: i, style: styles.row },
              React.createElement(Text, { style: styles.cellWide }, formatTs(f.timestampEvento)),
              React.createElement(Text, { style: styles.cell }, f.tipo),
              React.createElement(Text, { style: styles.cellWide }, formatTs(f.timestampServidor)),
              React.createElement(Text, { style: styles.cell }, f.origenOffline ? 'Sí' : 'No'),
            )
          ),
          React.createElement(Text, { style: styles.legal },
            'El registro de jornada se realiza en base al Art. 6.1.c RGPD (obligación legal) en cumplimiento del Art. 34.9 ET.'
          ),
        )
      )
    )
  );
}

export async function renderFichajesPdf(
  rows: ExportRow[],
  from: Date,
  to: Date,
  empresaNombre: string,
): Promise<Readable> {
  const element = React.createElement(FichajesDocument, { rows, from, to, empresaNombre });
  return renderToStream(element as Parameters<typeof renderToStream>[0]) as unknown as Readable;
}
