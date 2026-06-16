// Browsers can't decode camera RAW files (CR2, NEF, ARW, ...) directly. But
// virtually every RAW format embeds one or more JPEG previews inside its
// structure. We scan for embedded JPEG segments and pick the largest decodable
// one. For large files (e.g. 50 MB CR3) we read only the first chunk first —
// the preview is almost always near the front.

const RAW_RE =
  /\.(cr2|cr3|crw|nef|nrw|arw|sr2|srf|raf|rw2|orf|pef|dng|raw|3fr|fff|iiq|rwl|mrw|mos|kdc|dcr|x3f|gpr)$/i;

/** First bytes to read — CR3 previews are usually in the first few MB. */
const HEAD_READ_BYTES = 4 * 1024 * 1024;

/** Last bytes to read when the preview is not in the file header. */
const TAIL_READ_BYTES = 4 * 1024 * 1024;

export function isRawFile(name: string): boolean {
  return RAW_RE.test(name);
}

interface Segment {
  start: number;
  end: number;
}

function findJpegSegments(buf: Uint8Array): Segment[] {
  const stack: number[] = [];
  const segs: Segment[] = [];
  for (let i = 0; i + 1 < buf.length; i++) {
    if (buf[i] !== 0xff) continue;
    const marker = buf[i + 1];
    if (marker === 0xd8) stack.push(i);
    else if (marker === 0xd9) {
      const start = stack.pop();
      if (start !== undefined) segs.push({ start, end: i + 2 });
    }
  }
  segs.sort((a, b) => b.end - b.start - (a.end - a.start));
  return segs;
}

function segmentBlob(buf: Uint8Array, seg: Segment): Blob {
  return new Blob([buf.slice(seg.start, seg.end)], { type: "image/jpeg" });
}

/** Validate/decode with a tiny resize so we never allocate a full-resolution bitmap. */
async function isDecodableJpeg(blob: Blob): Promise<boolean> {
  try {
    const bitmap = await createImageBitmap(blob, { resizeWidth: 128, resizeQuality: "low" });
    bitmap.close();
    return true;
  } catch {
    return false;
  }
}

async function decodeLargestSegment(buf: Uint8Array): Promise<Blob | null> {
  const segments = findJpegSegments(buf);
  let attempts = 0;
  for (const seg of segments) {
    if (attempts >= 4) break;
    if (seg.end - seg.start < 1024) continue;
    attempts += 1;
    const blob = segmentBlob(buf, seg);
    if (await isDecodableJpeg(blob)) return blob;
  }
  return null;
}

async function previewFromChunks(chunks: Blob[]): Promise<Blob | null> {
  for (const chunk of chunks) {
    const buf = new Uint8Array(await chunk.arrayBuffer());
    const preview = await decodeLargestSegment(buf);
    if (preview) return preview;
  }
  return null;
}

/**
 * Extracts the largest decodable embedded JPEG preview from a RAW file.
 * Reads only the first ~16 MB when possible to avoid loading 50 MB CR3s.
 */
export async function extractRawPreviewBlob(file: File | Blob): Promise<Blob> {
  const size = file.size;
  if (size <= HEAD_READ_BYTES) {
    const preview = await previewFromChunks([file]);
    if (preview) return preview;
    throw new Error("No embedded JPEG preview found in this RAW file.");
  }

  const fromHead = await previewFromChunks([file.slice(0, HEAD_READ_BYTES)]);
  if (fromHead) return fromHead;

  const tailStart = Math.max(HEAD_READ_BYTES, size - TAIL_READ_BYTES);
  if (tailStart < size) {
    const fromTail = await previewFromChunks([file.slice(tailStart, size)]);
    if (fromTail) return fromTail;
  }

  // Skip full-file reads on huge RAWs — too slow; head+tail covers virtually all CR3/NEF.
  throw new Error("No embedded JPEG preview found in this RAW file.");
}

/** Max long edge for culling previews — viewable on screen, not print quality. */
export const VIEW_PREVIEW_MAX_EDGE = 1080;

export const VIEW_PREVIEW_JPEG_QUALITY = 0.55;

/** Rebuild on-disk cache files larger than this (legacy full-resolution previews). */
export const VIEW_PREVIEW_MAX_BYTES = 500_000;

/** True when a file is already a small culling JPEG (skip re-encoding). */
export function isViewableCacheFile(file: File | Blob): boolean {
  return file.size > 512 && file.size <= VIEW_PREVIEW_MAX_BYTES;
}

/** Cache file name for a RAW inside `.voiceculler_previews/`. */
export function previewCacheFileName(rawFileName: string): string {
  return `${rawFileName}.preview_${VIEW_PREVIEW_MAX_EDGE}.jpg`;
}

/** Downscale and recompress any image to a small JPEG suitable for culling. */
export async function toViewablePreviewBlob(source: Blob): Promise<Blob> {
  try {
    // Resize while decoding — avoids hanging on multi‑MP embedded CR3 previews.
    const bitmap = await createImageBitmap(source, {
      resizeWidth: VIEW_PREVIEW_MAX_EDGE,
      resizeQuality: "low",
    });
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    return await canvas.convertToBlob({
      type: "image/jpeg",
      quality: VIEW_PREVIEW_JPEG_QUALITY,
    });
  } catch {
    return source;
  }
}
