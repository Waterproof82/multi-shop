import { IStorageRepository, UploadResult } from "@/core/domain/repositories/IStorageRepository";
import { getPresignedUploadUrlAction, deleteFileAction } from "./actions";

export class R2StorageRepository implements IStorageRepository {
  
  async upload(file: File): Promise<UploadResult> {
    try {
      // 1. Solicitar URL firmada al servidor (Server Action)
      const { success, url, key, publicUrl } = await getPresignedUploadUrlAction(
        file.name,
        file.type,
        file.size
      );

      if (!success || !url) {
        throw new Error("No se pudo obtener la autorización de subida.");
      }

      // 2. Subir el archivo directamente a Cloudflare R2 desde el navegador
      // Es CRÍTICO que el Content-Type coincida con el que se usó para firmar
      const uploadResponse = await fetch(url, {
        method: "PUT",
        body: file,
        headers: {
          "Content-Type": file.type,
        },
      });

      if (!uploadResponse.ok) {
        throw new Error(`Error en la subida a R2: ${uploadResponse.statusText}`);
      }

      // 3. Retornar los datos del archivo guardado
      return {
        key: key || "",
        publicUrl: publicUrl || "",
      };

    } catch (error) {
      console.error("R2StorageRepository Upload Error:", error);
      throw error instanceof Error ? error : new Error("Error desconocido al subir archivo");
    }
  }

  async delete(fileKey: string): Promise<void> {
    try {
      await deleteFileAction(fileKey);
    } catch (error) {
      console.error("R2StorageRepository Delete Error:", error);
      throw error;
    }
  }
}
