import type { Decision, Photo, PhotoSource } from "../types";
import {
  extractRawPreviewBlob,
  isRawFile,
  isViewableCacheFile,
  previewCacheFileName,
  toViewablePreviewBlob,
  VIEW_PREVIEW_MAX_BYTES,
} from "./rawPreview";

const IMAGE_RE = /\.(jpe?g|png|gif|webp|avif|bmp)$/i;
const THUMB_MAX = 200;
/** Hidden folder for extracted RAW previews (created inside the photo folder). */
export const PREVIEW_CACHE_DIR = ".voiceculler_previews";
/** Two at a time during RAW extract (CPU-heavy). */
const RAW_PREP_CONCURRENCY = 2;
/** Loading small cached JPEGs into memory before culling — keep this high. */
const WARM_CONCURRENCY = 8;

export function isFileSystemAccessSupported(): boolean {
  return typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";
}

export interface LocalEntry {
  /** File that gets moved on keep/reject (RAW or regular image). */
  name: string;
  handle: FileSystemFileHandle;
  dir: FileSystemDirectoryHandle;
  /** Matching sidecar JPEG in the source folder (display only — not moved to Kept/Rejected). */
  sidecarHandle?: FileSystemFileHandle;
  sidecarName?: string;
  /** Original sidecar filename before it was parked in `.voiceculler_previews/`. */
  originalSidecarName?: string;
}

export interface PickedFolder {
  dir: FileSystemDirectoryHandle;
  entries: LocalEntry[];
  /** RAW files that had a matching JPEG sidecar in the folder. */
  sidecarCount: number;
  rawCount: number;
}

export interface PrepareProgress {
  phase: "preparing" | "warming";
  done: number;
  total: number;
  currentName?: string;
  sidecarHits: number;
  extracted: number;
  skippedCache: number;
}

function stem(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(0, i) : name;
}

function isJpegSidecar(name: string): boolean {
  return /\.jpe?g$/i.test(name);
}

async function listFileNames(dir: FileSystemDirectoryHandle): Promise<Map<string, FileSystemFileHandle>> {
  const map = new Map<string, FileSystemFileHandle>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for await (const [name, handle] of (dir as any).entries() as AsyncIterable<
    [string, FileSystemHandle]
  >) {
    if (handle.kind === "file") map.set(name, handle as FileSystemFileHandle);
  }
  return map;
}

/**
 * Opens a directory picker and builds the cull list: one entry per photo to
 * sort. Sidecar JPEGs paired with a RAW are used for display only and are not
 * listed separately.
 */
export async function openImageFolder(): Promise<PickedFolder> {
  if (!window.showDirectoryPicker) {
    throw new Error("This browser does not support local folders. Use Chrome or Edge.");
  }
  const dir = await window.showDirectoryPicker({ mode: "readwrite" });
  const files = await listFileNames(dir);

  const rawByStem = new Map<string, string>();
  const jpegByStem = new Map<string, string>();
  for (const name of files.keys()) {
    if (isRawFile(name)) rawByStem.set(stem(name).toLowerCase(), name);
    else if (isJpegSidecar(name)) jpegByStem.set(stem(name).toLowerCase(), name);
  }

  const entries: LocalEntry[] = [];
  let sidecarCount = 0;
  let rawCount = 0;

  for (const [name, handle] of files) {
    if (isRawFile(name)) {
      rawCount += 1;
      const key = stem(name).toLowerCase();
      const sidecarName = jpegByStem.get(key);
      let sidecarHandle: FileSystemFileHandle | undefined;
      if (sidecarName && sidecarName !== name) {
        sidecarHandle = files.get(sidecarName);
        sidecarCount += 1;
      }
      entries.push({
        name,
        handle,
        dir,
        sidecarHandle,
        sidecarName: sidecarHandle ? sidecarName : undefined,
        originalSidecarName: sidecarHandle ? sidecarName : undefined,
      });
      continue;
    }

    if (!IMAGE_RE.test(name)) continue;
    // Skip JPEGs that pair with a RAW in this folder (used as display sidecars).
    if (isJpegSidecar(name) && rawByStem.has(stem(name).toLowerCase())) continue;

    entries.push({ name, handle, dir });
  }

  entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  return { dir, entries, sidecarCount, rawCount };
}

async function writeCacheFile(
  cacheDir: FileSystemDirectoryHandle,
  rawName: string,
  blob: Blob,
): Promise<FileSystemFileHandle> {
  const cacheName = previewCacheFileName(rawName);
  const handle = await cacheDir.getFileHandle(cacheName, { create: true });
  const writable = await handle.createWritable();
  await writable.write(await toViewablePreviewBlob(blob));
  await writable.close();
  return handle;
}

async function parallelForEach<T>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      await fn(items[index], index);
    }
  });
  await Promise.all(workers);
}

/** True when a sidecar preview cache file is still valid. */
function isSidecarCacheStillValid(sidecarFile: File, cacheFile: File): boolean {
  return isViewableCacheFile(cacheFile) && cacheFile.lastModified >= sidecarFile.lastModified;
}

async function ensureSidecarCached(
  cacheDir: FileSystemDirectoryHandle,
  entry: LocalEntry,
): Promise<FileSystemFileHandle> {
  const sidecarFile = await entry.sidecarHandle!.getFile();
  const cacheName = previewCacheFileName(entry.name);
  try {
    const existing = await cacheDir.getFileHandle(cacheName);
    const cacheFile = await existing.getFile();
    if (isSidecarCacheStillValid(sidecarFile, cacheFile)) return existing;
  } catch {
    // No cache yet.
  }
  return writeCacheFile(cacheDir, entry.name, sidecarFile);
}

/** True when an on-disk preview cache file is still valid for this RAW. */
function isCacheStillValid(rawFile: File, cacheFile: File): boolean {
  return (
    cacheFile.size > 512 &&
    cacheFile.size <= VIEW_PREVIEW_MAX_BYTES &&
    cacheFile.lastModified >= rawFile.lastModified
  );
}

export interface PrebuiltPreviewCache {
  previewHandles: Map<string, FileSystemFileHandle>;
  extracted: number;
  skippedCache: number;
}

/**
 * Extracts embedded JPEG previews from RAWs into `.voiceculler_previews/` (or
 * uses sidecar JPEGs). Skips files whose cache is already up to date. Safe to
 * call automatically when the user picks a folder — second runs are fast.
 */
export async function buildPreviewCache(
  picked: PickedFolder,
  onProgress?: (progress: PrepareProgress) => void,
): Promise<PrebuiltPreviewCache> {
  const cacheDir = await picked.dir.getDirectoryHandle(PREVIEW_CACHE_DIR, { create: true });
  const previewHandles = new Map<string, FileSystemFileHandle>();
  let extracted = 0;
  let skippedCache = 0;

  const rawsNeedingExtract = picked.entries.filter(
    (e) => isRawFile(e.name) && !e.sidecarHandle,
  );

  const sidecarEntries = picked.entries.filter((e) => e.sidecarHandle);
  const prepTotal = rawsNeedingExtract.length + sidecarEntries.length;

  onProgress?.({
    phase: "preparing",
    done: 0,
    total: prepTotal || picked.entries.length,
    sidecarHits: picked.sidecarCount,
    extracted: 0,
    skippedCache: 0,
  });

  let done = 0;
  let failed = 0;
  await parallelForEach(rawsNeedingExtract, RAW_PREP_CONCURRENCY, async (entry) => {
    try {
      const cacheName = previewCacheFileName(entry.name);
      const rawFile = await entry.handle.getFile();
      let usedCache = false;

      try {
        const existing = await cacheDir.getFileHandle(cacheName);
        const cacheFile = await existing.getFile();
        if (isCacheStillValid(rawFile, cacheFile)) {
          previewHandles.set(entry.name, existing);
          skippedCache += 1;
          usedCache = true;
        }
      } catch {
        // No cache file yet.
      }

      if (!usedCache) {
        const blob = await extractRawPreviewBlob(rawFile);
        const cacheHandle = await writeCacheFile(cacheDir, entry.name, blob);
        previewHandles.set(entry.name, cacheHandle);
        extracted += 1;
      }
    } catch (err) {
      failed += 1;
      console.warn(`Preview prep failed for ${entry.name}`, err);
    } finally {
      done += 1;
      onProgress?.({
        phase: "preparing",
        done,
        total: prepTotal || picked.entries.length,
        currentName: entry.name,
        sidecarHits: picked.sidecarCount,
        extracted,
        skippedCache,
      });
    }
  });

  if (failed > 0) {
    console.warn(`${failed} RAW preview(s) could not be prepared.`);
  }

  for (const entry of sidecarEntries) {
    try {
      const cacheHandle = await ensureSidecarCached(cacheDir, entry);
      previewHandles.set(entry.name, cacheHandle);
    } catch (err) {
      failed += 1;
      console.warn(`Sidecar preview failed for ${entry.name}`, err);
    } finally {
      done += 1;
      onProgress?.({
        phase: "preparing",
        done,
        total: prepTotal || picked.entries.length,
        currentName: entry.name,
        sidecarHits: picked.sidecarCount,
        extracted,
        skippedCache,
      });
    }
  }

  for (const entry of picked.entries) {
    if (!isRawFile(entry.name)) {
      previewHandles.set(entry.name, entry.handle);
    }
  }

  return { previewHandles, extracted, skippedCache };
}

/**
 * Warms an in-memory URL cache and returns a ready LocalSource. Pass
 * `prebuilt` from an earlier buildPreviewCache call to skip re-extraction.
 */
export async function prepareLocalSource(
  picked: PickedFolder,
  keptName: string,
  rejectedName: string,
  onProgress?: (progress: PrepareProgress) => void,
  prebuilt?: PrebuiltPreviewCache,
): Promise<LocalSource> {
  const keptDir = await picked.dir.getDirectoryHandle(keptName, { create: true });
  const rejectedDir = await picked.dir.getDirectoryHandle(rejectedName, { create: true });

  let previewHandles: Map<string, FileSystemFileHandle>;
  let extracted: number;
  let skippedCache: number;

  if (prebuilt) {
    previewHandles = prebuilt.previewHandles;
    extracted = prebuilt.extracted;
    skippedCache = prebuilt.skippedCache;
  } else {
    const built = await buildPreviewCache(picked, onProgress);
    previewHandles = built.previewHandles;
    extracted = built.extracted;
    skippedCache = built.skippedCache;
  }

  const source = new LocalSource(
    picked.dir,
    keptDir,
    rejectedDir,
    picked.entries,
    previewHandles,
  );

  onProgress?.({
    phase: "warming",
    done: 0,
    total: picked.entries.length,
    sidecarHits: picked.sidecarCount,
    extracted,
    skippedCache,
  });

  await source.warmPreviewCache((done, total, currentName) => {
    onProgress?.({
      phase: "warming",
      done,
      total,
      currentName,
      sidecarHits: picked.sidecarCount,
      extracted,
      skippedCache,
    });
  });

  return source;
}

/** @deprecated Use prepareLocalSource for RAW folders. */
export async function createLocalSource(
  picked: PickedFolder,
  keptName: string,
  rejectedName: string,
): Promise<LocalSource> {
  return prepareLocalSource(picked, keptName, rejectedName, () => {});
}

export class LocalSource implements PhotoSource {
  readonly kind = "local" as const;
  readonly name: string;
  readonly photos: Photo[];

  private readonly srcDir: FileSystemDirectoryHandle;
  private readonly keptDir: FileSystemDirectoryHandle;
  private readonly rejectedDir: FileSystemDirectoryHandle;
  private readonly entries = new Map<string, LocalEntry>();
  private readonly previewHandles = new Map<string, FileSystemFileHandle>();
  private readonly resolveInflight = new Map<string, Promise<FileSystemFileHandle>>();
  /** Loaded object URLs keyed by photo id. */
  private readonly previewUrls = new Map<string, string>();
  private readonly thumbUrls = new Map<string, string>();
  private readonly objectUrls = new Set<string>();

  constructor(
    srcDir: FileSystemDirectoryHandle,
    keptDir: FileSystemDirectoryHandle,
    rejectedDir: FileSystemDirectoryHandle,
    entries: LocalEntry[],
    previewHandles: Map<string, FileSystemFileHandle>,
  ) {
    this.srcDir = srcDir;
    this.keptDir = keptDir;
    this.rejectedDir = rejectedDir;
    this.name = srcDir.name;
    this.photos = entries.map((e) => ({ id: e.name, name: e.name }));
    for (const e of entries) this.entries.set(e.name, e);
    for (const [id, handle] of previewHandles) this.previewHandles.set(id, handle);
  }

  /** Loads every preview into memory so culling never waits on a decode. */
  async warmPreviewCache(
    onProgress?: (done: number, total: number, currentName?: string) => void,
  ): Promise<void> {
    const ids = this.photos.map((p) => p.id);
    let done = 0;
    await parallelForEach(ids, WARM_CONCURRENCY, async (id) => {
      try {
        await this.ensurePreviewLoaded(id);
      } catch (err) {
        console.warn(`Preview warm failed for ${id}`, err);
      } finally {
        done += 1;
        onProgress?.(done, ids.length, id);
      }
    });
  }

  private async resolvePreviewHandle(id: string): Promise<FileSystemFileHandle> {
    const existing = this.previewHandles.get(id);
    if (existing) return existing;

    const inflight = this.resolveInflight.get(id);
    if (inflight) return inflight;

    const work = this.resolvePreviewHandleInner(id).finally(() => {
      this.resolveInflight.delete(id);
    });
    this.resolveInflight.set(id, work);
    return work;
  }

  private async resolvePreviewHandleInner(id: string): Promise<FileSystemFileHandle> {
    const entry = this.entries.get(id);
    if (!entry) throw new Error(`Unknown photo: ${id}`);

    if (entry.sidecarHandle) {
      this.previewHandles.set(id, entry.sidecarHandle);
      return entry.sidecarHandle;
    }

    if (!isRawFile(id)) {
      this.previewHandles.set(id, entry.handle);
      return entry.handle;
    }

    const cacheDir = await this.srcDir.getDirectoryHandle(PREVIEW_CACHE_DIR, { create: true });
    const cacheName = previewCacheFileName(id);
    const rawFile = await entry.handle.getFile();

    try {
      const cached = await cacheDir.getFileHandle(cacheName);
      const cacheFile = await cached.getFile();
      if (isCacheStillValid(rawFile, cacheFile)) {
        this.previewHandles.set(id, cached);
        return cached;
      }
    } catch {
      // No cache yet — extract below (background prep may write it concurrently).
    }

    const blob = await extractRawPreviewBlob(rawFile);
    const handle = await writeCacheFile(cacheDir, id, blob);
    this.previewHandles.set(id, handle);
    return handle;
  }

  private async ensurePreviewLoaded(id: string): Promise<void> {
    if (this.previewUrls.has(id)) return;

    const handle = await this.resolvePreviewHandle(id);
    const file = await handle.getFile();
    const viewBlob = isViewableCacheFile(file) ? file : await toViewablePreviewBlob(file);
    const url = URL.createObjectURL(viewBlob);
    this.previewUrls.set(id, url);
    this.objectUrls.add(url);

    const thumbUrl = await makeThumbUrl(viewBlob);
    this.thumbUrls.set(id, thumbUrl);
    this.objectUrls.add(thumbUrl);
  }

  async getFullImage(id: string): Promise<string> {
    const url = this.previewUrls.get(id);
    if (url) return url;
    await this.ensurePreviewLoaded(id);
    const loaded = this.previewUrls.get(id);
    if (!loaded) throw new Error(`Preview not loaded: ${id}`);
    return loaded;
  }

  async getThumb(id: string): Promise<string> {
    const url = this.thumbUrls.get(id) ?? this.previewUrls.get(id);
    if (url) return url;
    await this.ensurePreviewLoaded(id);
    const loaded = this.thumbUrls.get(id) ?? this.previewUrls.get(id);
    if (!loaded) throw new Error(`Preview not loaded: ${id}`);
    return loaded;
  }

  async apply(id: string, decision: Decision): Promise<void> {
    const dest = decision === "keep" ? this.keptDir : this.rejectedDir;
    await this.moveEntry(id, dest);
  }

  async revert(id: string, decision: Decision): Promise<void> {
    void decision;
    await this.moveEntry(id, this.srcDir);
  }

  private async moveEntry(id: string, dest: FileSystemDirectoryHandle): Promise<void> {
    const entry = this.entries.get(id);
    if (!entry) throw new Error(`Unknown photo: ${id}`);
    if (entry.dir === dest) return;

    const fromDir = entry.dir;
    const movingToCullFolder = dest === this.keptDir || dest === this.rejectedDir;

    // Park sidecar JPEGs in the preview cache — Kept/Rejected hold RAWs only.
    if (movingToCullFolder && entry.sidecarHandle && entry.sidecarName && fromDir === this.srcDir) {
      await this.parkSidecarInPreviewCache(entry);
    }

    entry.handle = await moveFileHandle(entry.handle, entry.name, fromDir, dest);
    entry.dir = dest;

    if (dest === this.srcDir && entry.originalSidecarName) {
      await this.restoreSidecarBesideRaw(entry);
    }
  }

  /** Parks a compressed sidecar in `.voiceculler_previews/` and removes the full JPEG from the inbox. */
  private async parkSidecarInPreviewCache(entry: LocalEntry): Promise<void> {
    if (!entry.sidecarHandle || !entry.sidecarName) return;
    if (entry.dir !== this.srcDir) return;

    const cacheDir = await this.srcDir.getDirectoryHandle(PREVIEW_CACHE_DIR, { create: true });
    const cacheName = previewCacheFileName(entry.name);

    try {
      await cacheDir.getFileHandle(cacheName);
    } catch {
      const sidecarFile = await entry.sidecarHandle.getFile();
      await writeCacheFile(cacheDir, entry.name, sidecarFile);
    }

    try {
      await this.srcDir.removeEntry(entry.sidecarName);
    } catch {
      // Sidecar may already have been removed.
    }

    const cacheHandle = await cacheDir.getFileHandle(cacheName);
    entry.sidecarHandle = cacheHandle;
    entry.sidecarName = cacheName;
    this.previewHandles.set(entry.name, cacheHandle);
  }

  /** Restores a parked sidecar JPEG next to the RAW in the source folder (revert). */
  private async restoreSidecarBesideRaw(entry: LocalEntry): Promise<void> {
    const restoreName = entry.originalSidecarName;
    if (!restoreName || !entry.sidecarHandle || !entry.sidecarName) return;

    const cacheDir = await this.srcDir.getDirectoryHandle(PREVIEW_CACHE_DIR);
    entry.sidecarHandle = await moveFileHandle(
      entry.sidecarHandle,
      entry.sidecarName,
      cacheDir,
      this.srcDir,
      restoreName,
    );
    entry.sidecarName = restoreName;
    this.previewHandles.set(entry.name, entry.sidecarHandle);
  }

  dispose(): void {
    for (const url of this.objectUrls) URL.revokeObjectURL(url);
    this.objectUrls.clear();
    this.previewUrls.clear();
    this.thumbUrls.clear();
  }
}

async function moveFileHandle(
  handle: FileSystemFileHandle,
  name: string,
  fromDir: FileSystemDirectoryHandle,
  dest: FileSystemDirectoryHandle,
  destName?: string,
): Promise<FileSystemFileHandle> {
  const finalName = destName ?? name;
  if (typeof handle.move === "function") {
    await handle.move(dest, finalName);
    return handle;
  }
  const file = await handle.getFile();
  const destHandle = await dest.getFileHandle(finalName, { create: true });
  const writable = await destHandle.createWritable();
  await writable.write(file);
  await writable.close();
  await fromDir.removeEntry(name);
  return destHandle;
}

/** Downscales an image blob to a small JPEG object URL to keep memory low. */
async function makeThumbUrl(file: Blob): Promise<string> {
  try {
    const bitmap = await createImageBitmap(file, {
      resizeWidth: THUMB_MAX,
      resizeQuality: "low",
    });
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.62 });
    return URL.createObjectURL(blob);
  } catch {
    return URL.createObjectURL(file);
  }
}
