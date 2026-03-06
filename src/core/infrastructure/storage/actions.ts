"use server";

import { PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { v4 as uuidv4 } from "uuid";
import { getS3Client, getR2Config } from "./s3-client";

const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_FILE_SIZE = 10 * 1024 * 1024;

export async function getPresignedUploadUrlAction(
  fileName: string,
  fileType: string,
  fileSize: number,
  empresaSlug: string = "default"
) {
  const s3Client = getS3Client();
  const { bucketName, publicDomain } = getR2Config();

  if (!bucketName || !publicDomain) {
    throw new Error("Configuración de R2 incompleta");
  }

  if (!ALLOWED_MIME_TYPES.has(fileType)) {
    throw new Error("Tipo de archivo no permitido");
  }

  if (fileSize > MAX_FILE_SIZE) {
    throw new Error("El archivo excede el tamaño máximo de 10MB");
  }

  const uuid = uuidv4();
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const key = `${empresaSlug}/${year}/${month}/${uuid}-${fileName}`;

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    ContentType: fileType,
    ContentLength: fileSize,
  });

  try {
    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 60 });
    const publicUrl = `${publicDomain}/${key}`;

    return { success: true, url: signedUrl, key, publicUrl };
  } catch (error) {
    console.error("[R2] Error generating presigned URL:", error);
    const message = error instanceof Error ? error.message : "Error desconocido";
    throw new Error(`Error interno al generar autorización de subida: ${message}`);
  }
}

export async function deleteFileAction(fileKey: string) {
  const s3Client = getS3Client();
  const { bucketName } = getR2Config();

  if (!bucketName) {
    throw new Error("R2_BUCKET_NAME no configurado");
  }

  const command = new DeleteObjectCommand({
    Bucket: bucketName,
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
