import type { SpecialDay } from '../app/specialDaysStore';
import { deleteImage, listImageIds } from './dayImageStore';
import { isCloudMode } from './createRepository';
import { deleteDayImage } from './cloudDayImages';

/**
 * Delete stored day images that no day references any more.
 *
 * Removing or replacing a background deliberately leaves its bytes behind, so
 * Ctrl+Z can put the photo back — undo history only spans a session, so the
 * bytes have to outlive the edit. This collects the leftovers at startup, when
 * the history is empty and nothing can reach them.
 *
 * Only ever called with the fully hydrated day list: a partial list would look
 * like every image is unreferenced and delete the lot.
 */
export async function sweepUnreferencedImages(specialDays: SpecialDay[]): Promise<number> {
  const referenced = new Set(
    specialDays
      .map((d) => d.image)
      .filter((img): img is NonNullable<SpecialDay['image']> => !!img)
      .map((img) => img.id),
  );

  const stored = await listImageIds();
  const orphans = stored.filter((id) => !referenced.has(id));

  for (const id of orphans) {
    await deleteImage(id);
    if (isCloudMode()) void deleteDayImage(id);
  }
  return orphans.length;
}
