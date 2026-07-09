import { type NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole } from '@/core/infrastructure/api/helpers';
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
  return process.env.R2_BUCKET_NAME!;
}

// GET — list available backup dates for an empresa
export async function GET(request: NextRequest) {
  const { empresaId, error: authError } = await requireAuth(request);
  if (authError) return authError;
  const roleError = requireRole(request, ['admin', 'superadmin']);
  if (roleError) return roleError;

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
  const { empresaId, error: authError } = await requireAuth(request);
  if (authError) return authError;
  const roleError = requireRole(request, ['admin', 'superadmin']);
  if (roleError) return roleError;

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

  const snapshot = JSON.parse(snapshotText) as {
    productos: Record<string, unknown>[];
    categorias: Record<string, unknown>[];
  };

  // SECURITY: force empresa_id on every row to match the authenticated tenant.
  // Prevents a malicious/corrupted snapshot from writing into another tenant's data.
  const categoriasSanitizadas = snapshot.categorias.map(c => ({
    ...c,
    empresa_id: empresaId,
  }));
  const productosSanitizados = snapshot.productos.map(p => ({
    ...p,
    empresa_id: empresaId,
  }));

  const supabase = getSupabaseClient();

  // FK-SAFE ORDER: categorias first (productos have a FK → categorias).
  // Promise.all would race and could violate the FK constraint.
  const catUpsert = await supabase
    .from('categorias')
    .upsert(categoriasSanitizadas, { onConflict: 'id' });

  if (catUpsert.error) {
    return NextResponse.json({
      error: 'Failed to restore categorias',
      details: catUpsert.error.message,
    }, { status: 500 });
  }

  const prodUpsert = await supabase
    .from('productos')
    .upsert(productosSanitizados, { onConflict: 'id' });

  if (prodUpsert.error) {
    return NextResponse.json({
      error: 'Failed to restore productos',
      details: prodUpsert.error.message,
    }, { status: 500 });
  }

  return NextResponse.json({
    restored: date,
    productosCount: productosSanitizados.length,
    categoriasCount: categoriasSanitizadas.length,
  });
}
