// Downscale + convert a photo to JPEG base64 in the browser. Handles iPhone
// HEIC (the canvas re-encode produces JPEG, which the Claude API accepts) and
// keeps uploads small. The image never leaves memory except to the Claude API.
export async function fileToJpegBase64(file, maxDim = 1600) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('Could not read that image'));
      i.src = url;
    });
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    return { data: dataUrl.split(',')[1], media_type: 'image/jpeg' };
  } finally {
    URL.revokeObjectURL(url);
  }
}
