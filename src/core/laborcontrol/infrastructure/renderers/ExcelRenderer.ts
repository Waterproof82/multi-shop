import ExcelJS from 'exceljs';
import { PassThrough } from 'stream';
import type { Readable } from 'stream';
import type { FichajeEvento, PerfilLaboral } from '../../domain/types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface EmpresaInfo { nombre: string; nif?: string }
interface ExportRow   { empleado: PerfilLaboral; fichajes: FichajeEvento[] }

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

function fmtDate(d: Date): string {
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// ─── Renderer ─────────────────────────────────────────────────────────────────

export async function renderFichajesExcel(
  rows: ExportRow[],
  from: Date,
  to: Date,
  empresa: EmpresaInfo,
): Promise<Readable> {
  const passThrough = new PassThrough();
  const wb = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: passThrough });

  const generadoEn = new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid', hour12: false });

  for (const { empleado, fichajes } of rows) {
    const empleadoDisplay  = empleado.empleadoNombre ?? empleado.empleadoId;
    const contratoDisplay  = CONTRATO_LABEL[empleado.tipoContrato] ?? empleado.tipoContrato;
    const { horasTrabajadas, diasConRegistro } = calcTotales(fichajes);

    // Sheet name: max 31 chars (Excel limit), strip invalid chars
    const rawName  = empleadoDisplay.replace(/[:/\\?*[\]]/g, '').slice(0, 31);
    const sheet    = wb.addWorksheet(rawName);

    // ── Header block ──
    const titleRow = sheet.addRow(['Registro de Jornada Laboral']);
    titleRow.font  = { bold: true, size: 13 };

    sheet.addRow([]);

    const infoRows: [string, string][] = [
      ['Empresa',   empresa.nombre + (empresa.nif !== undefined ? `  ·  NIF: ${empresa.nif}` : '')],
      ['Empleado',  empleadoDisplay],
      ['Contrato',  `${contratoDisplay}${empleado.tiempoParcial ? ' · Tiempo parcial' : ''}`],
      ['Período',   `${fmtDate(from)} – ${fmtDate(to)}`],
      ['Generado',  generadoEn],
    ];

    for (const [label, value] of infoRows) {
      const row = sheet.addRow([label, value]);
      row.getCell(1).font = { bold: true, color: { argb: 'FF6B7280' } };
    }

    sheet.addRow([]);

    // ── Summary block ──
    const sumHeader = sheet.addRow(['RESUMEN DEL PERÍODO']);
    sumHeader.font  = { bold: true, color: { argb: 'FF92400E' }, size: 9 };

    const sumRow = sheet.addRow(['Horas trabajadas', 'Días con registro', 'Total eventos']);
    sumRow.font  = { bold: true };
    sumRow.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF8E1' } };

    const sumValues = sheet.addRow([fmtHoras(horasTrabajadas), String(diasConRegistro), String(fichajes.length)]);
    sumValues.font  = { bold: true, size: 11 };

    sheet.addRow([]);

    // ── Events table ──
    const detHeader = sheet.addRow(['DETALLE DE EVENTOS']);
    detHeader.font  = { bold: true, color: { argb: 'FF92400E' }, size: 9 };

    const colHeader = sheet.addRow(['Fecha/hora evento', 'Tipo', 'Fecha/hora servidor', 'Motivo / Corrección', 'Chain Hash']);
    colHeader.font  = { bold: true };
    colHeader.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
    colHeader.eachCell(cell => { cell.border = { bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } } }; });

    fichajes.forEach((f, i) => {
      const dataRow = sheet.addRow([
        f.timestampEvento,
        TIPO_LABEL[f.tipo] ?? f.tipo,
        f.timestampServidor,
        f.motivo ?? '',
        f.chainHash,
      ]);
      if (i % 2 !== 0) {
        dataRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFAFAFA' } };
      }
    });

    sheet.addRow([]);

    // ── Legal footer ──
    const legalRow = sheet.addRow([
      'Registro generado en cumplimiento del Art. 34.9 ET y RD-Ley 8/2019. '
      + 'Base legal tratamiento: Art. 6.1.c RGPD. '
      + 'Registros inmutables mediante cadena SHA-256. '
      + 'Conservación mínima 4 años (Art. 34.9 ET). Acceso RLT: Art. 64 ET.',
    ]);
    legalRow.font  = { italic: true, size: 7, color: { argb: 'FF9CA3AF' } };
    sheet.mergeCells(legalRow.number, 1, legalRow.number, 5);

    // ── Column widths & formats ──
    sheet.getColumn(1).width  = 22;
    sheet.getColumn(2).width  = 16;
    sheet.getColumn(3).width  = 22;
    sheet.getColumn(4).width  = 30;
    sheet.getColumn(5).width  = 68;
    sheet.getColumn(1).numFmt = 'dd/mm/yyyy hh:mm:ss';
    sheet.getColumn(3).numFmt = 'dd/mm/yyyy hh:mm:ss';

    sheet.commit();
  }

  await wb.commit();
  return passThrough;
}
