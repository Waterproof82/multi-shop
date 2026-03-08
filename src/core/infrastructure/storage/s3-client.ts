import { S3Client, DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import https from "node:https";

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;
const R2_PUBLIC_DOMAIN = process.env.NEXT_PUBLIC_R2_DOMAIN;

let s3Client: S3Client | null = null;

export function getS3Client(): S3Client {
  if (s3Client) {
    return s3Client;
  }

  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    throw new Error('Configuración de R2 incompleta');
  }

  const isDev = process.env.NODE_ENV !== "production";

  s3Client = new S3Client({
    region: "auto",
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
    forcePathStyle: true,
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
    ...(isDev && {
      requestHandler: new NodeHttpHandler({
        httpsAgent: new https.Agent({ rejectUnauthorized: false }),
      }),
    }),
  });

  return s3Client;
}

export function getR2Config() {
  return {
    bucketName: R2_BUCKET_NAME,
    publicDomain: R2_PUBLIC_DOMAIN,
  };
}

export async function uploadToR2(
  key: string,
  buffer: Buffer,
  contentType: string,
): Promise<void> {
  const accountId = process.env.R2_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;

  if (apiToken && accountId && R2_BUCKET_NAME) {
    const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${R2_BUCKET_NAME}/objects/${key}`;
    const res = await fetch(url, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${apiToken}`, 'Content-Type': contentType },
      body: new Uint8Array(buffer),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new Error(`Cloudflare API error ${res.status}: ${text}`);
    }
    return;
  }

  // Fallback: AWS SDK S3-compatible
  const client = getS3Client();
  await client.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET_NAME!,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      ContentLength: buffer.byteLength,
    })
  );
}

export async function deleteImageFromR2(imageUrl: string): Promise<boolean> {
  if (!imageUrl || !R2_BUCKET_NAME) return false;
  
  try {
    // Extract key from URL (remove domain)
    const key = imageUrl.replace(`${R2_PUBLIC_DOMAIN}/`, '');
    
    const client = getS3Client();
    const command = new DeleteObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
    });
    
    await client.send(command);
    return true;
  } catch (error) {
    console.error('Error deleting image from R2:', error);
    return false;
  }
}
