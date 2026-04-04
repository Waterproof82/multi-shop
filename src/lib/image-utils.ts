const MAX_WIDTH = 480;
const MAX_HEIGHT = 480;
const QUALITY = 0.8;

export async function optimizeImage(file: File): Promise<{ file: File; type: string }> {
  return new Promise((resolve, reject) => {
    const img = document.createElement('img');
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      if (width > MAX_WIDTH) {
        height = (height * MAX_WIDTH) / width;
        width = MAX_WIDTH;
      }
      if (height > MAX_HEIGHT) {
        width = (width * MAX_HEIGHT) / height;
        height = MAX_HEIGHT;
      }

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas error'));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Compress error'));
            return;
          }
          resolve({ file: new File([blob], file.name, { type: 'image/webp' }), type: 'image/webp' });
        },
        'image/webp',
        QUALITY
      );
    };
    img.onerror = () => reject(new Error('Load error'));
    img.src = URL.createObjectURL(file);
  });
}
