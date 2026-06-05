import type { Decision, DriveFolders, Photo, PhotoSource } from "../types";
import { fetchImageBlobUrl, moveFile } from "../drive/driveApi";

// Wraps the existing Google Drive REST helpers behind the PhotoSource interface.
export class DriveSource implements PhotoSource {
  readonly kind = "drive" as const;
  readonly name: string;
  readonly photos: Photo[];

  private readonly folders: DriveFolders;
  private readonly thumbs = new Map<string, string | undefined>();
  private readonly objectUrls = new Set<string>();

  constructor(folders: DriveFolders, photos: Photo[]) {
    this.folders = folders;
    this.name = folders.sourceName;
    this.photos = photos;
    for (const p of photos) this.thumbs.set(p.id, p.thumbnailLink);
  }

  async getFullImage(id: string): Promise<string> {
    const url = await fetchImageBlobUrl(id);
    this.objectUrls.add(url);
    return url;
  }

  async getThumb(id: string): Promise<string> {
    const link = this.thumbs.get(id);
    if (link) return link;
    return this.getFullImage(id);
  }

  async apply(id: string, decision: Decision): Promise<void> {
    const dest = decision === "keep" ? this.folders.keptId : this.folders.rejectedId;
    await moveFile(id, dest, this.folders.sourceId);
  }

  async revert(id: string, decision: Decision): Promise<void> {
    const from = decision === "keep" ? this.folders.keptId : this.folders.rejectedId;
    await moveFile(id, this.folders.sourceId, from);
  }

  dispose(): void {
    for (const url of this.objectUrls) URL.revokeObjectURL(url);
    this.objectUrls.clear();
  }
}
