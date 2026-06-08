import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { mkdir, rename, readDir } from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";
import type { Decision, Photo, PhotoSource } from "../types";
import { isRawFile, previewCacheFileName } from "./rawPreview";

import type { PrepareProgress } from "./localSource";

const IMAGE_RE = /\.(jpe?g|png|gif|webp|avif|bmp)$/i;
const PREVIEW_CACHE_DIR = ".voiceculler_previews";

export interface DesktopPickedFolder {
  path: string;
  name: string;
  entries: DesktopEntry[];
  sidecarCount: number;
  rawCount: number;
}

export interface DesktopEntry {
  name: string;
  rawPath: string;
  previewPath: string;
  sidecarPath?: string;
}

interface ExifExtractResult {
  ok: boolean;
  message: string;
  tool: string;
}

function stem(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(0, i) : name;
}

function isJpegSidecar(name: string): boolean {
  return /\.jpe?g$/i.test(name);
}

/** Grant read/write access to a user-picked folder (works on any drive letter). */
export async function allowFolderAccess(folderPath: string): Promise<void> {
  await invoke("allow_folder_access", { path: folderPath });
}

async function findSidecarPath(
  folderPath: string,
  rawName: string,
  jpegByStem: Map<string, string>,
): Promise<string | undefined> {
  const sidecarName = jpegByStem.get(stem(rawName).toLowerCase());
  if (!sidecarName) return undefined;
  return join(folderPath, sidecarName);
}

async function scanPhotoFolder(folderPath: string): Promise<DesktopEntry[]> {
  const dirEntries = await readDir(folderPath);
  const fileNames = dirEntries.filter((e) => !e.isDirectory).map((e) => e.name);

  const jpegByStem = new Map<string, string>();
  const rawNames: string[] = [];
  for (const name of fileNames) {
    if (isRawFile(name)) rawNames.push(name);
    else if (isJpegSidecar(name)) jpegByStem.set(stem(name).toLowerCase(), name);
  }

  const entries: DesktopEntry[] = [];

  for (const name of fileNames) {
    if (isRawFile(name)) {
      const sidecarPath = await findSidecarPath(folderPath, name, jpegByStem);
      const cacheName = previewCacheFileName(name);
      const cachePath = await join(folderPath, PREVIEW_CACHE_DIR, cacheName);
      entries.push({
        name,
        rawPath: await join(folderPath, name),
        previewPath: sidecarPath ?? cachePath,
        sidecarPath,
      });
      continue;
    }
    if (!IMAGE_RE.test(name)) continue;
    if (isJpegSidecar(name) && rawNames.some((r) => stem(r).toLowerCase() === stem(name).toLowerCase())) {
      continue;
    }
    const fullPath = await join(folderPath, name);
    entries.push({ name, rawPath: fullPath, previewPath: fullPath });
  }

  entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  return entries;
}

/** Runs ExifTool on specific RAW files that still need a sidecar JPEG. */
export async function runExifToolExtract(rawPaths: string[]): Promise<ExifExtractResult> {
  return invoke<ExifExtractResult>("extract_previews_exiftool", { rawPaths });
}

export function rawPathsNeedingExtract(entries: DesktopEntry[]): string[] {
  return entries.filter((e) => isRawFile(e.name) && !e.sidecarPath).map((e) => e.rawPath);
}

export async function rescanDesktopFolder(folderPath: string): Promise<DesktopPickedFolder> {
  const entries = await scanPhotoFolder(folderPath);
  const name = folderPath.replace(/^.*[/\\]/, "");
  return {
    path: folderPath,
    name,
    entries,
    rawCount: entries.filter((e) => isRawFile(e.name)).length,
    sidecarCount: entries.filter((e) => e.sidecarPath).length,
  };
}

/** Native folder picker — returns absolute path. */
export async function openDesktopPhotoFolder(): Promise<DesktopPickedFolder | null> {
  const picked = await open({
    directory: true,
    multiple: false,
    recursive: true,
    title: "Choose photo folder",
  });
  if (!picked || typeof picked !== "string") return null;

  await allowFolderAccess(picked);

  const path = picked;
  const name = path.replace(/^.*[/\\]/, "");
  const entries = await scanPhotoFolder(path);
  if (entries.length === 0) return null;

  const rawCount = entries.filter((e) => isRawFile(e.name)).length;
  const sidecarCount = entries.filter((e) => e.sidecarPath).length;
  return { path, name, entries, rawCount, sidecarCount };
}

export async function prepareDesktopSource(
  picked: DesktopPickedFolder,
  keptName: string,
  rejectedName: string,
  onProgress: (p: PrepareProgress) => void,
): Promise<DesktopSource> {
  await allowFolderAccess(picked.path);

  const keptPath = await join(picked.path, keptName);
  const rejectedPath = await join(picked.path, rejectedName);
  await mkdir(keptPath, { recursive: true });
  await mkdir(rejectedPath, { recursive: true });
  await mkdir(await join(picked.path, PREVIEW_CACHE_DIR), { recursive: true });

  const entries = await scanPhotoFolder(picked.path);
  const sidecarCount = entries.filter((e) => e.sidecarPath).length;
  const rawsWithoutSidecar = entries.filter((e) => isRawFile(e.name) && !e.sidecarPath);

  onProgress({
    phase: "preparing",
    done: 0,
    total: rawsWithoutSidecar.length,
    sidecarHits: sidecarCount,
    extracted: 0,
    skippedCache: 0,
  });

  if (rawsWithoutSidecar.length > 0) {
    const result = await runExifToolExtract(rawPathsNeedingExtract(entries));
    if (!result.ok) {
      throw new Error(result.message);
    }
  }

  const finalEntries = await scanPhotoFolder(picked.path);
  if (finalEntries.length === 0) {
    throw new Error("No photos found in that folder.");
  }

  const rawsStillMissing = finalEntries.filter((e) => isRawFile(e.name) && !e.sidecarPath);
  if (rawsStillMissing.length > 0) {
    const names = rawsStillMissing.slice(0, 3).map((e) => e.name).join(", ");
    const more = rawsStillMissing.length > 3 ? ` (+${rawsStillMissing.length - 3} more)` : "";
    throw new Error(
      `ExifTool could not create JPEG previews for: ${names}${more}. Try closing other apps using these files, then pick the folder again.`,
    );
  }

  const finalSidecarCount = finalEntries.filter((e) => e.sidecarPath).length;

  const source = new DesktopSource(picked.path, picked.name, keptPath, rejectedPath, finalEntries);

  onProgress({
    phase: "warming",
    done: 0,
    total: finalEntries.length,
    sidecarHits: finalSidecarCount,
    extracted: rawsWithoutSidecar.length,
    skippedCache: 0,
  });

  source.registerPreviewUrls((done, total, currentName) => {
    onProgress({
      phase: "warming",
      done,
      total,
      currentName,
      sidecarHits: finalSidecarCount,
      extracted: rawsWithoutSidecar.length,
      skippedCache: 0,
    });
  });

  return source;
}

export class DesktopSource implements PhotoSource {
  readonly kind = "local" as const;
  readonly name: string;
  readonly photos: Photo[];

  private readonly folderPath: string;
  private readonly keptPath: string;
  private readonly rejectedPath: string;
  private readonly entries = new Map<string, DesktopEntry>();
  private readonly previewUrls = new Map<string, string>();

  constructor(
    folderPath: string,
    folderName: string,
    keptPath: string,
    rejectedPath: string,
    entries: DesktopEntry[],
  ) {
    this.folderPath = folderPath;
    this.keptPath = keptPath;
    this.rejectedPath = rejectedPath;
    this.name = folderName;
    this.photos = entries.map((e) => ({ id: e.name, name: e.name }));
    for (const e of entries) this.entries.set(e.name, e);
  }

  /** Build asset:// URLs for every preview — no byte reads required. */
  registerPreviewUrls(
    onProgress?: (done: number, total: number, currentName?: string) => void,
  ): void {
    let done = 0;
    for (const entry of this.photos) {
      const path = this.entries.get(entry.id)?.previewPath;
      if (!path) continue;
      this.previewUrls.set(entry.id, convertFileSrc(path));
      done += 1;
      onProgress?.(done, this.photos.length, entry.id);
    }
  }

  async getFullImage(id: string): Promise<string> {
    const url = this.previewUrls.get(id);
    if (!url) throw new Error(`Preview not loaded: ${id}`);
    return url;
  }

  async getThumb(id: string): Promise<string> {
    return this.getFullImage(id);
  }

  async apply(id: string, decision: Decision): Promise<void> {
    const dest = decision === "keep" ? this.keptPath : this.rejectedPath;
    await this.moveEntry(id, dest);
  }

  async revert(id: string, decision: Decision): Promise<void> {
    void decision;
    await this.moveEntry(id, this.folderPath);
  }

  private async moveEntry(id: string, destDir: string): Promise<void> {
    const entry = this.entries.get(id);
    if (!entry) throw new Error(`Unknown photo: ${id}`);

    const destRaw = await join(destDir, entry.name);
    await rename(entry.rawPath, destRaw);
    entry.rawPath = destRaw;

    if (entry.sidecarPath) {
      const sidecarName = entry.sidecarPath.replace(/^.*[/\\]/, "");
      const destSidecar = await join(destDir, sidecarName);
      try {
        await rename(entry.sidecarPath, destSidecar);
        entry.sidecarPath = destSidecar;
        entry.previewPath = destSidecar;
        this.previewUrls.set(id, convertFileSrc(destSidecar));
      } catch {
        // Sidecar missing — RAW already moved.
      }
    }
  }

  dispose(): void {
    this.previewUrls.clear();
  }
}
