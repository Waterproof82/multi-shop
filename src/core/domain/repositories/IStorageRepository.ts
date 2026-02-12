export interface UploadResult {
  publicUrl: string;
  key: string;
}

export interface IStorageRepository {
  /**
   * Sube un archivo a la nube.
   * Internamente orquesta la obtención de la URL firmada y el PUT al storage.
   */
  upload(file: File): Promise<UploadResult>;

  /**
   * Elimina un archivo permanentemente.
   */
  delete(fileKey: string): Promise<void>;
}
