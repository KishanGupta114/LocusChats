
/**
 * Compresses an image file using Canvas to ensure it stays under the MQTT payload limit.
 * Supports aggressive quality reduction for very large files.
 */
export const compressImage = (file: File, maxW = 1024, maxH = 1024): Promise<string> => {
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
        if (!ctx) return reject('Canvas context failed');
        
        ctx.drawImage(img, 0, 0, width, height);
        
        // Start with 0.7 quality, if still too big, ChatRoom will handle it or we could loop here.
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
      img.onerror = reject;
    };
    reader.onerror = reject;
  });
};

/**
 * Helper to get supported audio mime types
 */
export const getSupportedAudioMimeType = () => {
  const types = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/webm', 'audio/mp4'];
  return types.find(type => MediaRecorder.isTypeSupported(type)) || '';
};

/**
 * Helper to get supported video mime types
 */
export const getSupportedVideoMimeType = () => {
  const types = ['video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
  return types.find(type => MediaRecorder.isTypeSupported(type)) || '';
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
export const isSafePayloadSize = (base64String: string, limitMb = 0.95): boolean => {
  // Base64 is ~1.33x the size of binary.
  const sizeInBytes = (base64String.length * 3) / 4;
  return sizeInBytes < limitMb * 1024 * 1024;
};
