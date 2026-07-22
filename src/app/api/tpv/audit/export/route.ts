import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole, type AuthResult } from '@/core/infrastructure/api/helpers';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';
import { verifyInspectorToken } from '@/lib/inspector-token';

export async function GET(req: NextRequest) {
  let empresaId: string | null = null;

  // Allow inspector token as alternative auth (for Hacienda inspectors)
  const inspectorToken = req.nextUrl.searchParams.get('inspector_token');
  if (inspectorToken) {
    const payload = await verifyInspectorToken(inspectorToken);
    if (!payload) return NextResponse.json({ error: 'Token de inspector inválido o expirado' }, { status: 401 });
    empresaId = payload.empresaId;
  } else {
    const auth = (await requireAuth(req)) as AuthResult;
    if (auth.error) return auth.error;
    const forbidden = requireRole(req, ['encargado', 'admin', 'superadmin']);
    if (forbidden) return forbidden;
    empresaId = auth.empresaId;
  }

  if (!empresaId) return NextResponse.json({ error: 'empresaId requerido' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const desde = searchParams.get('desde'); // YYYY-MM-DD
  const hasta = searchParams.get('hasta'); // YYYY-MM-DD

  const supabase = getSupabaseClient();

  const [cobrosResult, empresaResult] = await Promise.all([
    (() => {
      let query = supabase
        .from('tpv_cobros')
        .select(
          'id, serie, numero_ticket, metodo_pago, importe_cobrado_cents, propina_cents, descuento_cents, iva_porcentaje, base_imponible_cents, iva_cents, desglose_iva, detalle_items, rectifica_cobro_id, hash_anterior, hash, cobrado_at, turno_id, sesion_id, empleado_id'
        )
        .eq('empresa_id', empresaId)
        .order('numero_ticket', { ascending: true });
      if (desde) query = query.gte('cobrado_at', `${desde}T00:00:00Z`);
      if (hasta) query = query.lte('cobrado_at', `${hasta}T23:59:59Z`);
      return query;
    })(),
    supabase
      .from('empresas')
      .select('nombre, nif, razon_social, tipo_impuesto')
      .eq('id', empresaId)
      .single(),
  ]);

  if (cobrosResult.error) return NextResponse.json({ error: cobrosResult.error.message }, { status: 500 });

  const rows = (cobrosResult.data ?? []) as Record<string, unknown>[];
  const empresa = empresaResult.data as Record<string, unknown> | null;

  const exportData = {
    // ── Metadatos del export ──────────────────────────────────────────────
    exported_at: new Date().toISOString(),
    normativa: ['RD 1619/2012', 'Ley 11/2021 (Ley Antifraude)', 'RD 1007/2023 (Verifactu)'],
    periodo: { desde: desde ?? 'inicio', hasta: hasta ?? 'hoy' },
    total_cobros: rows.length,

    // ── Identificación del emisor ─────────────────────────────────────────
    emisor: {
      empresa_id: empresaId,
      nombre: empresa?.razon_social ?? empresa?.nombre ?? null,
      nif: empresa?.nif ?? null,
      tipo_impuesto: empresa?.tipo_impuesto ?? 'iva',
    },

    // ── Registros de venta ────────────────────────────────────────────────
    cobros: rows.map(r => ({
      // Identificación del ticket
      id: r.id,
      serie: r.serie,
      numero_ticket: r.numero_ticket,
      cobrado_at: r.cobrado_at,
      metodo_pago: r.metodo_pago,
      rectifica_cobro_id: r.rectifica_cobro_id ?? null,

      // Importes
      importe_cobrado_cents: r.importe_cobrado_cents,
      propina_cents: r.propina_cents,
      descuento_cents: r.descuento_cents ?? null,

      // Fiscalidad — totales
      iva_porcentaje: r.iva_porcentaje,
      base_imponible_cents: r.base_imponible_cents,
      iva_cents: r.iva_cents,

      // Fiscalidad — desglose por tipo impositivo (RD 1619/2012)
      desglose_iva: r.desglose_iva ?? null,

      // Líneas de venta — detalle de productos
      detalle_items: r.detalle_items ?? null,

      // Integridad — cadena de hashes SHA-256
      hash: r.hash,
      hash_anterior: r.hash_anterior,

      // Operador que procesó el cobro
      empleado_id: r.empleado_id ?? null,

      // Referencias internas
      turno_id: r.turno_id,
      sesion_id: r.sesion_id,
    })),
  };

  const filename = `tpv-cobros-${empresa?.nif ?? empresaId}-${new Date().toISOString().slice(0, 10)}.json`;

  return new NextResponse(JSON.stringify(exportData, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
