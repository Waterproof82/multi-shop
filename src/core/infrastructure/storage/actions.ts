"use server";

import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { v4 as uuidv4 } from "uuid";

// Validación de entorno (Fail fast)
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;
const R2_PUBLIC_DOMAIN = process.env.NEXT_PUBLIC_R2_DOMAIN;

// Nota: En producción, asegura que estas variables estén definidas.
// Si no, lanzará error al iniciar la acción.

const s3Client = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID || "",
    secretAccessKey: R2_SECRET_ACCESS_KEY || "",
  },
  forcePathStyle: true, // Necesario para R2
});

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

/**
 * Genera una URL prefirmada para subida directa (PUT).
 * @param fileName - Nombre original del archivo
 * @param fileType - Tipo MIME del archivo
 * @param fileSize - Tamaño en bytes
 * @param empresaSlug - Slug de la empresa para organizar archivos (opcional)
 */
export async function getPresignedUploadUrlAction(
  fileName: string,
  fileType: string,
  fileSize: number,
  empresaSlug: string = 'default'
) {
  console.log('[R2] Starting upload:', { fileName, fileType, fileSize, empresaSlug });
  console.log('[R2] Env check:', { 
    R2_ACCOUNT_ID: !!R2_ACCOUNT_ID, 
    R2_ACCESS_KEY_ID: !!R2_ACCESS_KEY_ID, 
    R2_SECRET_ACCESS_KEY: !!R2_SECRET_ACCESS_KEY, 
    R2_BUCKET_NAME: !!R2_BUCKET_NAME,
    R2_PUBLIC_DOMAIN: R2_PUBLIC_DOMAIN
  });

  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME) {
    const errorMsg = "Missing R2 Environment Variables";
    console.error('[R2]', errorMsg);
    throw new Error(errorMsg);
  }

  // 1. Validaciones de Seguridad
  if (!ALLOWED_MIME_TYPES.includes(fileType)) {
    throw new Error("Tipo de archivo no permitido. Solo imágenes (JPEG, PNG, WEBP, GIF).");
  }

  if (fileSize > MAX_FILE_SIZE) {
    throw new Error(`El archivo excede el tamaño máximo permitido de ${MAX_FILE_SIZE / 1024 / 1024}MB.`);
  }

  // 2. Sanitización y Generación de Key única
  // Estructura: {empresaSlug}/year/month/uuid-filename.ext
  const date = new Date();
  const sanitizedSlug = empresaSlug.toLowerCase().replace(/[^a-z0-9]/g, '-');
  const path = `${sanitizedSlug}/${date.getFullYear()}/${date.getMonth() + 1}`;
  const cleanFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, "_");
  const uniqueKey = `${path}/${uuidv4()}-${cleanFileName}`;

  // 3. Generar Comando
  const command = new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: uniqueKey,
    ContentType: fileType,
    ContentLength: fileSize,
  });

  try {
    // 4. Firmar URL (Válida por 60 segundos)
    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 60 });
    
    // URL Pública final (CDN)
    const publicUrl = `${R2_PUBLIC_DOMAIN}/${uniqueKey}`;

    return { success: true, url: signedUrl, key: uniqueKey, publicUrl };
  } catch (error) {
    console.error('[R2] Error generating presigned URL:', error);
    const message = error instanceof Error ? error.message : 'Error desconocido';
    throw new Error(`Error interno al generar autorización de subida: ${message}`);
  }
}

/**
 * Elimina un archivo del bucket
 */
export async function deleteFileAction(fileKey: string) {
  if (!R2_BUCKET_NAME) throw new Error("Missing R2_BUCKET_NAME");

  const command = new DeleteObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: fileKey,
  });

  try {
    await s3Client.send(command);
    return { success: true };
  } catch (error) {
    console.error("Error deleting file:", error);
    throw new Error("No se pudo eliminar el archivo.");
  }
}
