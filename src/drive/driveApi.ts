import { getAccessToken } from "./auth";
import type { Photo } from "../types";

const API = "https://www.googleapis.com/drive/v3";
const UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";
const FOLDER_MIME = "application/vnd.google-apps.folder";

export interface DriveFolder {
  id: string;
  name: string;
}

async function driveFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  const resp = await fetch(input, { ...init, headers });
  if (!resp.ok) {
    let detail = "";
    try {
      const body = await resp.json();
      detail = body?.error?.message ?? "";
    } catch {
      // ignore
    }
    throw new Error(`Drive API ${resp.status}: ${detail || resp.statusText}`);
  }
  return resp;
}

/** Extracts a folder ID from a raw ID or a Drive folder URL. */
export function parseFolderId(input: string): string {
  const trimmed = input.trim();
  const match = trimmed.match(/folders\/([a-zA-Z0-9_-]+)/);
  if (match) return match[1];
  const idMatch = trimmed.match(/[-\w]{20,}/);
  return idMatch ? idMatch[0] : trimmed;
}

/** Lists immediate subfolders of a parent folder (default: My Drive root). */
export async function listFolders(parentId = "root"): Promise<DriveFolder[]> {
  const q = encodeURIComponent(
    `'${parentId}' in parents and mimeType = '${FOLDER_MIME}' and trashed = false`,
  );
  const folders: DriveFolder[] = [];
  let pageToken: string | undefined;
  do {
    const url =
      `${API}/files?q=${q}` +
      `&fields=nextPageToken,files(id,name)` +
      `&orderBy=name&pageSize=200&spaces=drive` +
      (pageToken ? `&pageToken=${pageToken}` : "");
    const resp = await driveFetch(url);
    const data = await resp.json();
    for (const f of data.files ?? []) folders.push({ id: f.id, name: f.name });
    pageToken = data.nextPageToken;
  } while (pageToken);
  return folders;
}

/** Returns folder metadata (name + parents) for breadcrumbs. */
export async function getFolder(id: string): Promise<{ id: string; name: string; parents?: string[] }> {
  if (id === "root") return { id: "root", name: "My Drive" };
  const url = `${API}/files/${id}?fields=id,name,parents`;
  const resp = await driveFetch(url);
  return resp.json();
}

/** Finds a direct child folder by name, or creates it. */
export async function findOrCreateFolder(name: string, parentId: string): Promise<DriveFolder> {
  const q = encodeURIComponent(
    `'${parentId}' in parents and mimeType = '${FOLDER_MIME}' and name = '${name.replace(/'/g, "\\'")}' and trashed = false`,
  );
  const resp = await driveFetch(`${API}/files?q=${q}&fields=files(id,name)&pageSize=1`);
  const data = await resp.json();
  if (data.files?.length) return { id: data.files[0].id, name: data.files[0].name };
  return createFolder(name, parentId);
}

export async function createFolder(name: string, parentId: string): Promise<DriveFolder> {
  const resp = await driveFetch(`${API}/files?fields=id,name`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parentId] }),
  });
  const data = await resp.json();
  return { id: data.id, name: data.name };
}

/** Lists all image files in a folder (paginated). */
export async function listImages(folderId: string): Promise<Photo[]> {
  const q = encodeURIComponent(
    `'${folderId}' in parents and mimeType contains 'image/' and trashed = false`,
  );
  const photos: Photo[] = [];
  let pageToken: string | undefined;
  do {
    const url =
      `${API}/files?q=${q}` +
      `&fields=nextPageToken,files(id,name,thumbnailLink)` +
      `&orderBy=name&pageSize=200&spaces=drive` +
      (pageToken ? `&pageToken=${pageToken}` : "");
    const resp = await driveFetch(url);
    const data = await resp.json();
    for (const f of data.files ?? []) {
      photos.push({
        id: f.id,
        name: f.name,
        thumbnailLink: f.thumbnailLink,
      });
    }
    pageToken = data.nextPageToken;
  } while (pageToken);
  return photos;
}

/** Moves a file by swapping its parent folder. */
export async function moveFile(
  fileId: string,
  addParentId: string,
  removeParentId: string,
): Promise<void> {
  const url =
    `${API}/files/${fileId}` +
    `?addParents=${addParentId}&removeParents=${removeParentId}&fields=id,parents`;
  await driveFetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
}

/** Fetches full-resolution image bytes as an object URL (for the center stage). */
export async function fetchImageBlobUrl(fileId: string): Promise<string> {
  const resp = await driveFetch(`${API}/files/${fileId}?alt=media`);
  const blob = await resp.blob();
  return URL.createObjectURL(blob);
}

export { UPLOAD_API };
