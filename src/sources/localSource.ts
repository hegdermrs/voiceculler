import type { Decision, Photo, PhotoSource } from "../types";
import { extractRawPreviewBlob, isRawFile } from "./rawPreview";

const IMAGE_RE = /\.(jpe?g|png|gif|webp|avif|bmp)$/i;
const THUMB_MAX = 200;

function isSupportedImage(name: string): boolean {
  return IMAGE_RE.test(name) || isRawFile(name);
}

export function isFileSystemAccessSupported(): boolean {
  return typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";
}

export interface LocalEntry {
  name: string;
  /** Live handle to the file; updated as it moves between folders. */
  handle: FileSystemFileHandle;
  /** Directory the file currently lives in. */
  dir: FileSystemDirectoryHandle;
}

export interface PickedFolder {
  dir: FileSystemDirectoryHandle;
  entries: LocalEntry[];
}

/**
 * Opens a directory picker and enumerates the images inside it. Must be called
 * from a user gesture (e.g. a button click). Does not create anything yet.
 */
export async function openImageFolder(): Promise<PickedFolder> {
  if (!window.showDirectoryPicker) {
    throw new Error("This browser does not support local folders. Use Chrome or Edge.");
  }
  const dir = await window.showDirectoryPicker({ mode: "readwrite" });

  const entries: LocalEntry[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for await (const [name, handle] of (dir as any).entries() as AsyncIterable<
    [string, FileSystemHandle]
  >) {
    if (handle.kind === "file" && isSupportedImage(name)) {
      entries.push({ name, handle: handle as FileSystemFileHandle, dir });
    }
  }
  entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

  return { dir, entries };
}

/** Creates the kept/rejected subfolders and builds the source. */
export async function createLocalSource(
  picked: PickedFolder,
  keptName: string,
  rejectedName: string,
): Promise<LocalSource> {
  const keptDir = await picked.dir.getDirectoryHandle(keptName, { create: true });
  const rejectedDir = await picked.dir.getDirectoryHandle(rejectedName, { create: true });
  return new LocalSource(picked.dir, keptDir, rejectedDir, picked.entries);
}

export class LocalSource implements PhotoSource {
  readonly kind = "local" as const;
  readonly name: string;
  readonly photos: Photo[];

  private readonly srcDir: FileSystemDirectoryHandle;
  private readonly keptDir: FileSystemDirectoryHandle;
  private readonly rejectedDir: FileSystemDirectoryHandle;
  private readonly entries = new Map<string, LocalEntry>();
  private readonly objectUrls = new Set<string>();
  // Cache extracted RAW previews so each RAW file is scanned/decoded only once.
  private readonly rawPreviews = new Map<string, Promise<Blob>>();

  constructor(
    srcDir: FileSystemDirectoryHandle,
    keptDir: FileSystemDirectoryHandle,
    rejectedDir: FileSystemDirectoryHandle,
    entries: LocalEntry[],
  ) {
    this.srcDir = srcDir;
    this.keptDir = keptDir;
    this.rejectedDir = rejectedDir;
    this.name = srcDir.name;
    this.photos = entries.map((e) => ({ id: e.name, name: e.name }));
    for (const e of entries) this.entries.set(e.name, e);
  }

  private async fileFor(id: string): Promise<File> {
    const entry = this.entries.get(id);
    if (!entry) throw new Error(`Unknown photo: ${id}`);
    return entry.handle.getFile();
  }

  /**
   * Returns a browser-displayable blob for the photo: the raw file itself for
   * normal images, or the extracted embedded JPEG preview for RAW files.
   */
  private async displayableBlob(id: string): Promise<Blob> {
    const file = await this.fileFor(id);
    if (!isRawFile(id)) return file;

    let preview = this.rawPreviews.get(id);
    if (!preview) {
      preview = extractRawPreviewBlob(file);
      this.rawPreviews.set(id, preview);
    }
    try {
      return await preview;
    } catch (err) {
      // Let a later attempt retry rather than caching the failure forever.
      this.rawPreviews.delete(id);
      throw err;
    }
  }

  async getFullImage(id: string): Promise<string> {
    const blob = await this.displayableBlob(id);
    const url = URL.createObjectURL(blob);
    this.objectUrls.add(url);
    return url;
  }

  async getThumb(id: string): Promise<string> {
    const blob = await this.displayableBlob(id);
    const url = await makeThumbUrl(blob);
    this.objectUrls.add(url);
    return url;
  }

  async apply(id: string, decision: Decision): Promise<void> {
    const dest = decision === "keep" ? this.keptDir : this.rejectedDir;
    await this.moveEntry(id, dest);
  }

  async revert(id: string, decision: Decision): Promise<void> {
    // `decision` is unused for local (we always move back to source) but kept
    // for interface symmetry with the Drive source.
    void decision;
    await this.moveEntry(id, this.srcDir);
  }

  private async moveEntry(id: string, dest: FileSystemDirectoryHandle): Promise<void> {
    const entry = this.entries.get(id);
    if (!entry) throw new Error(`Unknown photo: ${id}`);
    if (entry.dir === dest) return;

    const handle = entry.handle;
    if (typeof handle.move === "function") {
      // Native, fast, same-filesystem move.
      await handle.move(dest, entry.name);
      entry.dir = dest;
      return;
    }

    // Fallback: copy bytes into destination, then remove the original.
    const file = await handle.getFile();
    const destHandle = await dest.getFileHandle(entry.name, { create: true });
    const writable = await destHandle.createWritable();
    await writable.write(file);
    await writable.close();
    await entry.dir.removeEntry(entry.name);
    entry.handle = destHandle;
    entry.dir = dest;
  }

  dispose(): void {
    for (const url of this.objectUrls) URL.revokeObjectURL(url);
    this.objectUrls.clear();
  }
}

/** Downscales an image blob to a small JPEG object URL to keep memory low. */
async function makeThumbUrl(file: Blob): Promise<string> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, THUMB_MAX / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.7 });
    return URL.createObjectURL(blob);
  } catch {
    // Fallback to the full file if thumbnailing isn't available.
    return URL.createObjectURL(file);
  }
}
