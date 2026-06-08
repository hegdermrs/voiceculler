// Browsers can't decode camera RAW files (CR2, NEF, ARW, ...) directly. But
// virtually every RAW format embeds one or more JPEG previews inside its
// structure. We scan for embedded JPEG segments and pick the largest decodable
// one. For large files (e.g. 50 MB CR3) we read only the first chunk first —
// the preview is almost always near the front.

const RAW_RE =
  /\.(cr2|cr3|crw|nef|nrw|arw|sr2|srf|raf|rw2|orf|pef|dng|raw|3fr|fff|iiq|rwl|mrw|mos|kdc|dcr|x3f|gpr)$/i;

/** First bytes to read before falling back to the full file. */
const PARTIAL_READ_BYTES = 16 * 1024 * 1024;

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

async function decodeLargestSegment(buf: Uint8Array): Promise<Blob | null> {
  const segments = findJpegSegments(buf);
  let attempts = 0;
  for (const seg of segments) {
    if (attempts >= 8) break;
    if (seg.end - seg.start < 1024) continue;
    attempts += 1;
    const blob = new Blob([Uint8Array.from(buf.subarray(seg.start, seg.end))], {
      type: "image/jpeg",
    });
    try {
      const bitmap = await createImageBitmap(blob);
      bitmap.close();
      return blob;
    } catch {
      // Not a decodable baseline JPEG — try the next segment.
    }
  }
  return null;
}

/**
 * Extracts the largest decodable embedded JPEG preview from a RAW file.
 * Reads only the first ~16 MB when possible to avoid loading 50 MB CR3s.
 */
export async function extractRawPreviewBlob(file: File | Blob): Promise<Blob> {
  const size = file.size;
  if (size <= PARTIAL_READ_BYTES) {
    const buf = new Uint8Array(await file.arrayBuffer());
    const preview = await decodeLargestSegment(buf);
    if (preview) return preview;
    throw new Error("No embedded JPEG preview found in this RAW file.");
  }

  const partial = file.slice(0, PARTIAL_READ_BYTES);
  const partialBuf = new Uint8Array(await partial.arrayBuffer());
  const fromPartial = await decodeLargestSegment(partialBuf);
  if (fromPartial) return fromPartial;

  // Preview may sit late in the file — read the rest once.
  const fullBuf = new Uint8Array(await file.arrayBuffer());
  const fromFull = await decodeLargestSegment(fullBuf);
  if (fromFull) return fromFull;
  throw new Error("No embedded JPEG preview found in this RAW file.");
}

/** Max long edge for culling previews — viewable on screen, not print quality. */
export const VIEW_PREVIEW_MAX_EDGE = 1440;

export const VIEW_PREVIEW_JPEG_QUALITY = 0.62;

/** Rebuild on-disk cache files larger than this (legacy full-resolution previews). */
export const VIEW_PREVIEW_MAX_BYTES = 700_000;

/** Cache file name for a RAW inside `.voiceculler_previews/`. */
export function previewCacheFileName(rawFileName: string): string {
  return `${rawFileName}.preview_${VIEW_PREVIEW_MAX_EDGE}.jpg`;
}

/** Downscale and recompress any image to a small JPEG suitable for culling. */
export async function toViewablePreviewBlob(source: Blob): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(source);
    const scale = Math.min(1, VIEW_PREVIEW_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    return await canvas.convertToBlob({
      type: "image/jpeg",
      quality: VIEW_PREVIEW_JPEG_QUALITY,
    });
  } catch {
    return source;
  }
}
