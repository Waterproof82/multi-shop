import { S3Client, DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { logger } from "@/core/infrastructure/logging/logger";

let s3Client: S3Client | null = null;

export function getS3Client(): S3Client {
  if (s3Client) {
    return s3Client;
  }

  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error('Configuración de R2 incompleta');
  }

  s3Client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
    forcePathStyle: true,
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });

  return s3Client;
}

export function getR2Config() {
  return {
    bucketName: process.env.R2_BUCKET_NAME,
    publicDomain: process.env.NEXT_PUBLIC_R2_DOMAIN,
  };
}

export async function uploadToR2(
  key: string,
  buffer: Buffer,
  contentType: string,
): Promise<void> {
  const accountId = process.env.R2_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  const bucketName = process.env.R2_BUCKET_NAME;

  if (apiToken && accountId && bucketName) {
    const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${bucketName}/objects/${key}`;
    const res = await fetch(url, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${apiToken}`, 'Content-Type': contentType },
      body: new Uint8Array(buffer),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new Error(`Cloudflare API error ${res.status}: ${text.slice(0, 200)}`);
    }
    return;
  }

  // Fallback: AWS SDK S3-compatible
  if (!bucketName) {
    throw new Error('R2_BUCKET_NAME is not configured');
  }
  const client = getS3Client();
  await client.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      ContentLength: buffer.byteLength,
    })
  );
}

export async function deleteImageFromR2(imageUrl: string): Promise<boolean> {
  const bucketName = process.env.R2_BUCKET_NAME;
  const publicDomain = process.env.NEXT_PUBLIC_R2_DOMAIN;

  if (!imageUrl || !bucketName) return false;

  if (!publicDomain) {
    await logger.logError({ codigo: 'STORAGE_CONFIG_ERROR', mensaje: 'R2_PUBLIC_DOMAIN not set — cannot derive key from URL', modulo: 'repository' });
    return false;
  }

  // Extract key by removing the public domain prefix — use startsWith+slice
  // instead of replace() to avoid partial substitution when the domain appears
  // more than once in the URL.
  const prefix = publicDomain.endsWith('/') ? publicDomain : `${publicDomain}/`;
  if (!imageUrl.startsWith(prefix)) {
    await logger.logError({ codigo: 'STORAGE_INVALID_KEY', mensaje: 'Image URL does not match configured R2 domain', modulo: 'repository', metadata: { imageUrl: imageUrl.slice(0, 100) } });
    return false;
  }
  const key = imageUrl.slice(prefix.length);

  // Guard: key must be a valid relative path with no traversal or forbidden chars
  if (!key || key.includes('..') || !/^[a-zA-Z0-9_\-/.]+$/.test(key)) {
    await logger.logError({ codigo: 'STORAGE_INVALID_KEY', mensaje: 'Invalid R2 key derived from URL', modulo: 'repository', metadata: { imageUrl: imageUrl.slice(0, 100) } });
    return false;
  }

  try {
    const client = getS3Client();
    const command = new DeleteObjectCommand({
      Bucket: bucketName,
      Key: key,
    });

    await client.send(command);
    return true;
  } catch (error) {
    await logger.logFromCatch(error, 'repository', 'deleteImageFromR2', { details: { imageUrl: imageUrl.slice(0, 100) } });
    return false;
  }
}
