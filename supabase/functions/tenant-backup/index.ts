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
    .select('id, nombre, dominio');

  if (empError) {
    return new Response(JSON.stringify({ error: empError.message }), { status: 500 });
  }

  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const errors: string[] = [];

  for (const empresa of empresas ?? []) {
    try {
      const [prodResult, catResult] = await Promise.all([
        supabase.from('productos').select('*').eq('empresa_id', empresa.id),
        supabase.from('categorias').select('*').eq('empresa_id', empresa.id),
      ]);

      if (prodResult.error) throw new Error(`productos: ${prodResult.error.message}`);
      if (catResult.error) throw new Error(`categorias: ${catResult.error.message}`);

      const snapshot = {
        empresa,
        productos: prodResult.data,
        categorias: catResult.data,
        exportedAt: new Date().toISOString(),
      };

      // Plain minified JSON — for a single tenant the payload is typically < 500 KB.
      // Gzip adds Deno complexity for marginal gain; revisit if snapshots exceed 2 MB.
      const body = JSON.stringify(snapshot);
      const key = `backups/${empresa.id}/${today}.json`;

      await s3.send(new PutObjectCommand({
        Bucket: Deno.env.get('R2_BUCKET_NAME')!,
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
