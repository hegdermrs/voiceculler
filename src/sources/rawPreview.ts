// Browsers can't decode camera RAW files (CR2, NEF, ARW, ...) directly. But
// virtually every RAW format embeds one or more JPEG previews (often full or
// near-full resolution) inside its TIFF/EXIF structure. For a culling app that
// preview is exactly what we want: fast to extract and plenty good enough to
// judge framing, focus, and keepers.
//
// Rather than parse each vendor's IFD layout, we scan the file for embedded
// JPEG byte segments and pick the largest one that actually decodes. The RAW
// sensor data in CR2/NEF is itself a *lossless* JPEG (which the browser can't
// decode), so the decode check naturally skips it and lands on the real
// baseline JPEG preview.

const RAW_RE =
  /\.(cr2|cr3|crw|nef|nrw|arw|sr2|srf|raf|rw2|orf|pef|dng|raw|3fr|fff|iiq|rwl|mrw|mos|kdc|dcr|x3f|gpr)$/i;

export function isRawFile(name: string): boolean {
  return RAW_RE.test(name);
}

interface Segment {
  start: number;
  end: number; // exclusive
}

/** Finds candidate embedded JPEG segments (SOI..EOI), largest first. */
function findJpegSegments(buf: Uint8Array): Segment[] {
  const stack: number[] = [];
  const segs: Segment[] = [];
  for (let i = 0; i + 1 < buf.length; i++) {
    if (buf[i] !== 0xff) continue;
    const marker = buf[i + 1];
    if (marker === 0xd8) {
      // Start of Image
      stack.push(i);
    } else if (marker === 0xd9) {
      // End of Image — pair with most recent unmatched SOI.
      const start = stack.pop();
      if (start !== undefined) segs.push({ start, end: i + 2 });
    }
  }
  segs.sort((a, b) => b.end - b.start - (a.end - a.start));
  return segs;
}

/**
 * Extracts the largest decodable embedded JPEG preview from a RAW file.
 * Throws if none of the candidate segments decode.
 */
export async function extractRawPreviewBlob(file: Blob): Promise<Blob> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const segments = findJpegSegments(buf);

  // Try the biggest candidates first; the first that decodes is the best
  // available preview. Cap attempts so a pathological file can't spin forever.
  let attempts = 0;
  for (const seg of segments) {
    if (attempts >= 8) break;
    // Skip implausibly tiny segments (stray markers in sensor data).
    if (seg.end - seg.start < 1024) continue;
    attempts += 1;
    const blob = new Blob([buf.subarray(seg.start, seg.end)], { type: "image/jpeg" });
    try {
      const bitmap = await createImageBitmap(blob);
      bitmap.close();
      return blob;
    } catch {
      // Not a decodable baseline JPEG (e.g. lossless RAW data) — try the next.
    }
  }
  throw new Error("No embedded JPEG preview found in this RAW file.");
}
