import { fitWithin } from '../day-background/imageImport';

/** Target edge (px) for the stored avatar. Small enough to embed inline as a
 *  data URL in localStorage and the Supabase auth user's metadata. */
export const AVATAR_EDGE = 128;
const WEBP_QUALITY = 0.85;

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Could not read the image.'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Decode an image file, center-crop it to a square, downscale to {@link AVATAR_EDGE},
 * and re-encode as WebP. Returns both the WebP blob (for upload to cloud Storage)
 * and a data URL (the offline/local mirror). Never upscales beyond the source's
 * shorter edge, so tiny images stay crisp. Throws on a non-image or decode error.
 */
export async function avatarFromFile(file: File): Promise<{ blob: Blob; dataUrl: string }> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose an image file.');
  }
  const bitmap = await createImageBitmap(file);
  // Center-crop to the largest square the source allows.
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = Math.round((bitmap.width - side) / 2);
  const sy = Math.round((bitmap.height - side) / 2);
  // Downscale that square to at most AVATAR_EDGE (fitWithin never upscales).
  const { w: edge } = fitWithin(side, side, AVATAR_EDGE);

  const canvas = document.createElement('canvas');
  canvas.width = edge;
  canvas.height = edge;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable.');
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, edge, edge);
  bitmap.close?.();

  const blob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Image encode failed.'))),
      'image/webp',
      WEBP_QUALITY,
    ),
  );
  return { blob, dataUrl: await readAsDataUrl(blob) };
}
