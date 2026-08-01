/**
 * Shrink a photo before it is uploaded.
 *
 * Every picture in this app -- an item reference shot, a loaner kit, a task's
 * before/after -- exists to be looked at on a phone, and a modern phone camera
 * produces 3-4 MB for something that will never be displayed above about
 * 800px. Supabase's free tier allows 1 GB of file storage, so at full size a
 * few hundred photos fills it, and the failure mode is an upload that starts
 * failing in the middle of a case.
 *
 * 1600px on the long edge is roughly a tenth the bytes and still resolves a
 * REF printed on a box label, which is the smallest thing anyone zooms in to
 * read.
 *
 * This is deliberately forgiving: anything that is not an image, or any
 * browser that cannot do the work, gets the original file back rather than an
 * error. Losing the photo would be far worse than storing a large one.
 */

const MAX_EDGE = 1600;
const QUALITY = 0.82;

export async function downscaleImage(file: File, maxEdge = MAX_EDGE): Promise<File> {
  if (!file.type.startsWith("image/")) return file;

  try {
    // `from-image` so a photo taken in portrait is not silently rotated:
    // the EXIF orientation flag is applied here rather than left for the
    // renderer, which is the usual source of sideways uploads.
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));

    // Already small enough. Re-encoding would only lose quality for nothing.
    if (scale === 1) {
      bitmap.close();
      return file;
    }

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", QUALITY),
    );
    if (!blob || blob.size >= file.size) return file;

    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    return file;
  }
}
