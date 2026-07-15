import { type NextRequest, NextResponse } from 'next/server';
import { resolveAdminContext } from '@/core/infrastructure/api/helpers';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';
import { S3Client, GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';

function getS3Client() {
  return new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT!,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
}

function getR2Bucket() {
  return process.env.R2_BACKUP_BUCKET_NAME!;
}

type SnapshotRow = Record<string, unknown>;

type Snapshot = {
  empresa: SnapshotRow;
  categorias: SnapshotRow[];
  productos: SnapshotRow[];
  mesas: SnapshotRow[];
  ingredientes: SnapshotRow[];
  empleados_tpv: SnapshotRow[];
  receta_items: SnapshotRow[];
};

// GET — list available backup dates for an empresa
export async function GET(request: NextRequest) {
  const ctx = await resolveAdminContext(request);
  if (ctx.error) return ctx.error;
  const { empresaId } = ctx;

  const s3 = getS3Client();
  const { Contents } = await s3.send(new ListObjectsV2Command({
    Bucket: getR2Bucket(),
    Prefix: `backups/${empresaId}/`,
  }));

  const dates = (Contents ?? [])
    .map(obj => obj.Key?.split('/').pop()?.replace('.json', '') ?? '')
    .filter(Boolean)
    .sort()
    .reverse();

  return NextResponse.json({ dates });
}

// POST — restore from a specific date's backup
export async function POST(request: NextRequest) {
  const ctx = await resolveAdminContext(request);
  if (ctx.error) return ctx.error;
  const { empresaId } = ctx;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const { date } = body as { date?: string };
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 });
  }

  const s3 = getS3Client();
  const key = `backups/${empresaId}/${date}.json`;

  let snapshotText: string;
  try {
    const obj = await s3.send(new GetObjectCommand({ Bucket: getR2Bucket(), Key: key }));
    snapshotText = await obj.Body!.transformToString();
  } catch {
    return NextResponse.json({ error: `Backup ${date} not found` }, { status: 404 });
  }

  const snapshot = JSON.parse(snapshotText) as Snapshot;
  const supabase = getSupabaseClient();

  // SECURITY: force empresa_id on every row to match the authenticated tenant.
  // Prevents a malicious/corrupted snapshot from writing into another tenant's data.
  const sanitize = (rows: SnapshotRow[]) =>
    rows.map(r => ({ ...r, empresa_id: empresaId }));

  // empresas: UPDATE only (row always exists, avoid unique constraint conflicts on dominio/slug)
  const { error: empErr } = await supabase
    .from('empresas')
    .update({ ...snapshot.empresa, id: empresaId })
    .eq('id', empresaId);
  if (empErr) return NextResponse.json({ error: 'Failed to restore empresa', details: empErr.message }, { status: 500 });

  // mesas: null out sesion_id — sessions are transient, FK would fail on restore
  const mesasSanitizadas = sanitize(snapshot.mesas ?? []).map(m => ({ ...m, sesion_id: null }));
  const { error: mesasErr } = await supabase.from('mesas').upsert(mesasSanitizadas, { onConflict: 'id' });
  if (mesasErr) return NextResponse.json({ error: 'Failed to restore mesas', details: mesasErr.message }, { status: 500 });

  // ingredientes
  const { error: ingErr } = await supabase.from('ingredientes').upsert(sanitize(snapshot.ingredientes ?? []), { onConflict: 'id' });
  if (ingErr) return NextResponse.json({ error: 'Failed to restore ingredientes', details: ingErr.message }, { status: 500 });

  // FK-SAFE ORDER: categorias before productos (productos FK → categorias)
  const { error: catErr } = await supabase.from('categorias').upsert(sanitize(snapshot.categorias ?? []), { onConflict: 'id' });
  if (catErr) return NextResponse.json({ error: 'Failed to restore categorias', details: catErr.message }, { status: 500 });

  const { error: prodErr } = await supabase.from('productos').upsert(sanitize(snapshot.productos ?? []), { onConflict: 'id' });
  if (prodErr) return NextResponse.json({ error: 'Failed to restore productos', details: prodErr.message }, { status: 500 });

  // empleados_tpv
  const { error: tpvErr } = await supabase.from('empleados_tpv').upsert(sanitize(snapshot.empleados_tpv ?? []), { onConflict: 'id' });
  if (tpvErr) return NextResponse.json({ error: 'Failed to restore empleados_tpv', details: tpvErr.message }, { status: 500 });

  // receta_items: last — depends on productos + ingredientes.
  // No empresa_id column, so validate by FK: only allow rows whose producto_id and
  // ingrediente_id belong to the productos/ingredientes we just restored for this tenant.
  const validProductoIds = new Set((snapshot.productos ?? []).map(r => r['id'] as string));
  const validIngredienteIds = new Set((snapshot.ingredientes ?? []).map(r => r['id'] as string));
  const recetaItemsSanitized = (snapshot.receta_items ?? []).filter(r =>
    validProductoIds.has(r['producto_id'] as string) &&
    (r['ingrediente_id'] === null || r['ingrediente_id'] === undefined || validIngredienteIds.has(r['ingrediente_id'] as string))
  );
  const { error: recetaErr } = await supabase.from('receta_items').upsert(recetaItemsSanitized, { onConflict: 'id' });
  if (recetaErr) return NextResponse.json({ error: 'Failed to restore receta_items', details: recetaErr.message }, { status: 500 });

  return NextResponse.json({
    restored: date,
    counts: {
      mesas: mesasSanitizadas.length,
      ingredientes: (snapshot.ingredientes ?? []).length,
      categorias: (snapshot.categorias ?? []).length,
      productos: (snapshot.productos ?? []).length,
      empleados_tpv: (snapshot.empleados_tpv ?? []).length,
      receta_items: recetaItemsSanitized.length,
    },
  });
}
