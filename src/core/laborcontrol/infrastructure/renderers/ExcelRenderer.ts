import ExcelJS from 'exceljs';
import { PassThrough } from 'stream';
import type { Readable } from 'stream';
import type { FichajeEvento, PerfilLaboral } from '../../domain/types';

interface ExportRow {
  empleado: PerfilLaboral;
  fichajes: FichajeEvento[];
}

export async function renderFichajesExcel(
  rows: ExportRow[],
  from: Date,
  to: Date,
  empresaNombre: string,
): Promise<Readable> {
  const passThrough = new PassThrough();
  const stream = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: passThrough });

  for (const { empleado, fichajes } of rows) {
    const sheetName = empleado.empleadoId.slice(0, 25);
    const sheet = stream.addWorksheet(sheetName);

    sheet.addRow([`Registro de jornada — ${empresaNombre}`]).font = { bold: true, size: 12 };
    sheet.addRow([`Período: ${from.toLocaleDateString('es-ES')} – ${to.toLocaleDateString('es-ES')}`]);
    sheet.addRow([`Empleado ID: ${empleado.empleadoId}  |  Contrato: ${empleado.tipoContrato}  |  Parcial: ${empleado.tiempoParcial ? 'Sí' : 'No'}`]);
    sheet.addRow([]);

    const header = sheet.addRow(['Fecha/hora evento', 'Tipo', 'Acción', 'Fecha/hora servidor', 'Offline', 'Motivo', 'Chain Hash']);
    header.font = { bold: true };
    header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } };

    for (const f of fichajes) {
      sheet.addRow([
        f.timestampEvento,
        f.tipo,
        f.accion ?? '',
        f.timestampServidor,
        f.origenOffline ? 'Sí' : 'No',
        f.motivo ?? '',
        f.chainHash,
      ]);
    }

    sheet.getColumn(1).width = 22;
    sheet.getColumn(2).width = 14;
    sheet.getColumn(4).width = 22;
    sheet.getColumn(7).width = 68;
    sheet.getColumn(1).numFmt = 'dd/mm/yyyy hh:mm:ss';
    sheet.getColumn(4).numFmt = 'dd/mm/yyyy hh:mm:ss';

    await sheet.commit();
  }

  await stream.commit();
  return passThrough;
}
