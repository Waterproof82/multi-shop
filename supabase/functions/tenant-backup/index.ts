// supabase/functions/tenant-backup/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { S3Client, PutObjectCommand } from 'https://esm.sh/@aws-sdk/client-s3@3';

Deno.serve(async (req: Request) => {
  const authHeader = req.headers.get('Authorization');
  if (authHeader !== `Bearer ${Deno.env.get('BACKUP_SECRET')}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const s3 = new S3Client({
    region: 'auto',
    endpoint: Deno.env.get('R2_ENDPOINT')!,
    credentials: {
      accessKeyId: Deno.env.get('R2_ACCESS_KEY_ID')!,
      secretAccessKey: Deno.env.get('R2_SECRET_ACCESS_KEY')!,
    },
  });

  const { data: empresas, error: empError } = await supabase
    .from('empresas')
    .select('*');

  if (empError) {
    return new Response(JSON.stringify({ error: empError.message }), { status: 500 });
  }

  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const errors: string[] = [];

  for (const empresa of empresas ?? []) {
    try {
      const [prodResult, catResult, mesasResult, ingResult, empTpvResult] = await Promise.all([
        supabase.from('productos').select('*').eq('empresa_id', empresa.id),
        supabase.from('categorias').select('*').eq('empresa_id', empresa.id),
        supabase.from('mesas').select('*').eq('empresa_id', empresa.id),
        supabase.from('ingredientes').select('*').eq('empresa_id', empresa.id),
        supabase.from('empleados_tpv').select('*').eq('empresa_id', empresa.id),
      ]);

      if (prodResult.error) throw new Error(`productos: ${prodResult.error.message}`);
      if (catResult.error) throw new Error(`categorias: ${catResult.error.message}`);
      if (mesasResult.error) throw new Error(`mesas: ${mesasResult.error.message}`);
      if (ingResult.error) throw new Error(`ingredientes: ${ingResult.error.message}`);
      if (empTpvResult.error) throw new Error(`empleados_tpv: ${empTpvResult.error.message}`);

      // receta_items: no empresa_id, filter via producto_id
      const prodIds = (prodResult.data ?? []).map((p: { id: string }) => p.id);
      const recetaResult = prodIds.length > 0
        ? await supabase.from('receta_items').select('*').in('producto_id', prodIds)
        : { data: [], error: null };

      if (recetaResult.error) throw new Error(`receta_items: ${recetaResult.error.message}`);

      const snapshot = {
        empresa,
        categorias: catResult.data,
        productos: prodResult.data,
        mesas: mesasResult.data,
        ingredientes: ingResult.data,
        empleados_tpv: empTpvResult.data,
        receta_items: recetaResult.data,
        exportedAt: new Date().toISOString(),
      };

      // Plain minified JSON — single tenant payload typically < 500 KB.
      const body = JSON.stringify(snapshot);
      const key = `backups/${empresa.id}/${today}.json`;

      await s3.send(new PutObjectCommand({
        Bucket: Deno.env.get('R2_BACKUP_BUCKET_NAME')!,
        Key: key,
        Body: body,
        ContentType: 'application/json',
      }));
    } catch (err) {
      errors.push(`${empresa.id}: ${String(err)}`);
    }
  }

  if (errors.length > 0) {
    return new Response(JSON.stringify({ status: 'partial', errors }), { status: 207 });
  }

  return new Response(JSON.stringify({ status: 'ok', count: (empresas ?? []).length }), { status: 200 });
});
