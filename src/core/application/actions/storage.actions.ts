"use server";

import { getPresignedUploadUrlAction } from "@/core/infrastructure/storage/actions";

/**
 * Server Action para obtener URL de upload
 * Maneja la lógica de negocio y delega la implementación a infraestructura
 */
export async function uploadImageAction(
  fileName: string,
  fileType: string,
  fileSize: number
) {
  // Validaciones de negocio pueden ir aquí si es necesario
  // Las validaciones técnicas ya están en la infraestructura
  
  const result = await getPresignedUploadUrlAction(fileName, fileType, fileSize);
  
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
