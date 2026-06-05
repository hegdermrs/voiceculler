export type Decision = "keep" | "reject";

export type MoveStatus = "pending" | "done" | "failed";

/** How the user drives culling: on-screen buttons, voice, or both. */
export type InputMode = "keys" | "voice" | "both";

export interface Photo {
  id: string;
  name: string;
  /** Optional remote thumbnail URL (Drive). Local source generates thumbs lazily. */
  thumbnailLink?: string;
}

export interface PhotoState {
  photo: Photo;
  /** Decision the user made, if any. */
  decision?: Decision;
  /** Status of the background Drive move for this photo. */
  moveStatus?: MoveStatus;
  /** Object URL for a prefetched full-resolution blob, if loaded. */
  fullSrc?: string;
}

export interface DriveFolders {
  sourceId: string;
  sourceName: string;
  keptId: string;
  rejectedId: string;
}

/**
 * Abstraction over where photos live and how decisions are applied, so the
 * gallery works identically with Google Drive or a local folder.
 */
export interface PhotoSource {
  kind: "drive" | "local";
  /** Display name of the source (input folder). */
  name: string;
  photos: Photo[];
  /** Full-resolution image URL for the center stage. */
  getFullImage(id: string): Promise<string>;
  /** Small thumbnail URL for the filmstrip. */
  getThumb(id: string): Promise<string>;
  /** Apply a decision: move the photo into the kept/rejected destination. */
  apply(id: string, decision: Decision): Promise<void>;
  /** Reverse a previously applied decision (move back to source). */
  revert(id: string, decision: Decision): Promise<void>;
  /** Release any held resources (object URLs, etc.). */
  dispose(): void;
}
