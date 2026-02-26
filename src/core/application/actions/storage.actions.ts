"use server";

import { getPresignedUploadUrlAction } from "@/core/infrastructure/storage/actions";

/**
 * Server Action para obtener URL de upload
 * Maneja la lógica de negocio y delega la implementación a infraestructura
 * @param fileName - Nombre del archivo
 * @param fileType - Tipo MIME
 * @param fileSize - Tamaño en bytes
 * @param empresaSlug - Slug de la empresa (usa 'default' si no se provee)
 */
export async function uploadImageAction(
  fileName: string,
  fileType: string,
  fileSize: number,
  empresaSlug: string = 'default'
) {
  // Las validaciones técnicas ya están en la infraestructura
  const result = await getPresignedUploadUrlAction(fileName, fileType, fileSize, empresaSlug);
  
  if (!result.success) {
    throw new Error("No se pudo obtener la autorización de subida");
  }
  
  return result;
}

/**
 * Server Action para eliminar imagen
 */
export async function deleteImageAction(fileKey: string) {
  const { deleteFileAction } = await import("@/core/infrastructure/storage/actions");
  return deleteFileAction(fileKey);
}
