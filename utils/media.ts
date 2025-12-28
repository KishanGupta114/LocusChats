
/**
 * Compresses an image file using Canvas to ensure it stays under the MQTT payload limit.
 */
export const compressImage = (file: File, maxW = 1080, maxH = 1080, quality = 0.7): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxW) {
            height *= maxW / width;
            width = maxW;
          }
        } else {
          if (height > maxH) {
            width *= maxH / height;
            height = maxH;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
    };
    reader.onerror = reject;
  });
};

/**
 * Converts a Blob/File to Base64 string.
 */
export const fileToBase64 = (file: Blob | File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = error => reject(error);
  });
};

/**
 * Validates if the Base64 string is within the safe limit for MQTT (approx 1MB).
 */
export const isSafePayloadSize = (base64String: string, limitMb = 0.9): boolean => {
  // Base64 is ~1.33x the size of binary. 1MB limit means ~750KB binary.
  const sizeInBytes = (base64String.length * 3) / 4;
  return sizeInBytes < limitMb * 1024 * 1024;
};
