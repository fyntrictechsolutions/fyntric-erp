import { collection, doc } from "firebase/firestore";
import { deleteObject, getDownloadURL, ref, uploadBytes, uploadBytesResumable } from "firebase/storage";
import { loggedDelete, loggedSet, loggedUpdate } from "@/lib/audit";
import { db, storage } from "@/lib/firebase";
import { makeThumbnail } from "@/lib/thumbnails";
import type { BaseRecord, UserProfile } from "@/types";

/**
 * Galleries of files (photos, brochures, demo videos, recordings). The files are in Firebase Storage
 * under gallery/<gallery>/<file id>/; Firestore's `gallery` collection keeps one entry per file, with
 * its name, product, tags and links. One collection serves every gallery, told apart by `gallery`.
 *
 * Public and private: every stored file has a download link with a secret token, which opens for
 * anyone who has it. Public files offer that link for sharing. Private files are only shown inside
 * the app (the list itself is visible to signed-in staff only). Making a public file private moves
 * it to a new place, so the link already shared stops working.
 */

export type GalleryKey = "sales";
export type FileKind = "image" | "video" | "audio" | "pdf" | "document";
export type Visibility = "public" | "private";

export interface GalleryFile extends BaseRecord {
  gallery: GalleryKey;
  name: string;
  description?: string;
  tags?: string[];
  productId?: string | null;
  productIdLabel?: string | null;
  kind: FileKind;
  mime: string;
  size: number;
  width?: number | null;
  height?: number | null;
  duration?: number | null;
  pages?: number | null;
  visibility: Visibility;
  provider: "firebase";
  /** Storage path of the file and of its thumbnail (if one could be made). */
  path: string;
  thumbPath?: string | null;
  url: string;
  thumbUrl?: string | null;
  fileName: string;
}

export const KIND_LABELS: Record<FileKind, string> = { image: "Image", video: "Video", audio: "Audio", pdf: "PDF", document: "Document" };

export function kindOf(file: { type: string; name: string }): FileKind {
  const t = file.type;
  if (t === "application/pdf" || /\.pdf$/i.test(file.name)) return "pdf";
  if (t.startsWith("image/")) return "image";
  if (t.startsWith("video/")) return "video";
  if (t.startsWith("audio/")) return "audio";
  return "document";
}

/** Largest file per kind. storage.rules enforces the same limits. */
export const MAX_BYTES: Record<FileKind, number> = {
  image: 25 * 1024 * 1024,
  pdf: 25 * 1024 * 1024,
  document: 25 * 1024 * 1024,
  video: 200 * 1024 * 1024,
  audio: 200 * 1024 * 1024,
};

export function formatBytes(bytes: unknown): string {
  const n = Number(bytes) || 0;
  if (n < 1000) return `${n} B`;
  if (n < 1_000_000) return `${Math.round(n / 1000)} KB`;
  if (n < 1_000_000_000) return `${(n / 1_000_000).toFixed(n < 10_000_000 ? 1 : 0)} MB`;
  return `${(n / 1_000_000_000).toFixed(2)} GB`;
}

export function formatDuration(seconds: unknown): string {
  const s = Math.round(Number(seconds) || 0);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

/** The name without its extension, used as the default title. */
export const baseName = (name: string) => name.replace(/\.[^.]+$/, "") || name;

/** A file name safe to use in a storage path and a download header. */
const safeName = (name: string) => name.replace(/[^\w.\- ()]+/g, "_").slice(-120) || "file";

/** The link to give people: public files only. */
export const publicLink = (f: GalleryFile) => (f.visibility === "private" ? null : f.url);

/** Saves the file to the device under its original name; falls back to opening it. */
export async function downloadFile(f: GalleryFile) {
  try {
    const res = await fetch(f.url);
    if (!res.ok) throw new Error(String(res.status));
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = f.fileName || f.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  } catch {
    // Without CORS on the bucket the browser can't fetch it; opening it still lets people save it.
    window.open(f.url, "_blank", "noopener");
  }
}

// ---------- Upload ----------

export interface UploadInput {
  file: File;
  name: string;
  visibility: Visibility;
  productId: string | null;
  productIdLabel: string | null;
  tags: string[];
  description: string;
}

function upload(path: string, data: Blob, contentType: string, fileName: string, onProgress?: (fraction: number) => void): Promise<string> {
  const target = ref(storage(), path);
  const metadata = { contentType, contentDisposition: `inline; filename="${fileName}"`, cacheControl: "private, max-age=31536000" };
  if (!onProgress) return uploadBytes(target, data, metadata).then(() => getDownloadURL(target));
  return new Promise((resolve, reject) => {
    const task = uploadBytesResumable(target, data, metadata);
    task.on(
      "state_changed",
      (s) => onProgress(s.totalBytes ? s.bytesTransferred / s.totalBytes : 0),
      (err) => reject(new Error(storageMessage(err))),
      () => getDownloadURL(target).then(resolve, reject),
    );
  });
}

/** Readable text for Firebase Storage errors. */
function storageMessage(err: unknown): string {
  const code = (err as { code?: string })?.code ?? "";
  if (code === "storage/unauthorized") return "Storage refused the file. It may be too large, or you may not be allowed to add files here.";
  if (code === "storage/quota-exceeded") return "The storage quota is used up. Ask an admin to check the Firebase plan.";
  if (code === "storage/retry-limit-exceeded") return "Upload failed. Check the internet connection and try again.";
  if (code === "storage/bucket-not-found" || code === "storage/no-default-bucket") return "File storage isn't set up yet. An admin needs to turn on Storage in the Firebase console.";
  return err instanceof Error ? err.message : "Upload failed.";
}

/** Uploads one file and its thumbnail, then adds its gallery entry. */
export async function uploadToGallery(gallery: GalleryKey, input: UploadInput, profile: UserProfile, onProgress: (fraction: number) => void) {
  const kind = kindOf(input.file);
  if (input.file.size > MAX_BYTES[kind]) {
    throw new Error(`${input.file.name} is ${formatBytes(input.file.size)}. ${KIND_LABELS[kind]} files can be up to ${formatBytes(MAX_BYTES[kind])}.`);
  }
  const entryRef = doc(collection(db(), "gallery"));
  const folder = `gallery/${gallery}/${entryRef.id}`;
  const fileName = safeName(input.file.name);
  const mime = input.file.type || "application/octet-stream";

  // Thumbnail and details (size, length, pages) come from the file itself, in the browser.
  const info = await makeThumbnail(input.file, kind).catch(() => null);
  const url = await upload(`${folder}/${fileName}`, input.file, mime, fileName, (f) => onProgress(f * 0.97));
  let thumbPath: string | null = null;
  let thumbUrl: string | null = null;
  if (info?.thumb) {
    try {
      thumbPath = `${folder}/thumb.${info.thumb.type === "image/png" ? "png" : "jpg"}`;
      thumbUrl = await upload(thumbPath, info.thumb, info.thumb.type, "thumbnail");
    } catch {
      thumbPath = null;
    }
  }
  onProgress(1);

  const now = Date.now();
  const entry: Omit<GalleryFile, "id"> = {
    gallery,
    name: input.name.trim() || baseName(input.file.name),
    description: input.description.trim(),
    tags: input.tags,
    productId: input.productId,
    productIdLabel: input.productIdLabel,
    kind,
    mime,
    size: input.file.size,
    width: info?.width ?? null,
    height: info?.height ?? null,
    duration: info?.duration ?? null,
    pages: info?.pages ?? null,
    visibility: input.visibility,
    provider: "firebase",
    path: `${folder}/${fileName}`,
    thumbPath,
    url,
    thumbUrl,
    fileName: input.file.name,
    userId: profile.id,
    userName: profile.displayName,
    createdBy: profile.id,
    createdAt: now,
    updatedAt: now,
  };
  await loggedSet(entryRef, entry as Record<string, unknown>);
  return entryRef;
}

// ---------- Changes ----------

export async function updateGalleryFile(f: GalleryFile, data: Partial<Pick<GalleryFile, "name" | "description" | "tags" | "productId" | "productIdLabel">>) {
  await loggedUpdate(doc(db(), "gallery", f.id), { ...data, updatedAt: Date.now() });
}

async function copyObject(fromUrl: string, toPath: string, contentType: string, fileName: string) {
  const res = await fetch(fromUrl).catch(() => null);
  if (!res?.ok) {
    throw new Error("Couldn't move the file. An admin needs to allow the app to read from Storage (CORS); see the setup guide.");
  }
  return upload(toPath, await res.blob(), contentType, fileName);
}

/**
 * Public: the file's link can be shared. Private: the link isn't offered, and when a public file
 * turns private it moves to a new place so the link people already have stops working.
 */
export async function setVisibility(f: GalleryFile, visibility: Visibility) {
  if (f.visibility === visibility) return;
  const entry = doc(db(), "gallery", f.id);
  if (visibility === "public") {
    await loggedUpdate(entry, { visibility, updatedAt: Date.now() }, "Made public");
    return;
  }
  const folder = `gallery/${f.gallery}/${f.id}-${Date.now().toString(36)}`;
  const fileName = f.path.split("/").pop() ?? safeName(f.fileName);
  const url = await copyObject(f.url, `${folder}/${fileName}`, f.mime, fileName);
  let thumbPath: string | null = null;
  let thumbUrl: string | null = null;
  if (f.thumbUrl && f.thumbPath) {
    thumbPath = `${folder}/${f.thumbPath.split("/").pop()}`;
    thumbUrl = await copyObject(f.thumbUrl, thumbPath, f.thumbPath.endsWith(".png") ? "image/png" : "image/jpeg", "thumbnail").catch(() => null);
    if (!thumbUrl) thumbPath = null;
  }
  const oldPaths = [f.path, f.thumbPath];
  await loggedUpdate(entry, { visibility, path: `${folder}/${fileName}`, url, thumbPath, thumbUrl, updatedAt: Date.now() }, "Made private (old link stopped)");
  await removeObjects(oldPaths);
}

async function removeObjects(paths: (string | null | undefined)[]) {
  await Promise.all(
    paths.filter((p): p is string => Boolean(p)).map((p) =>
      deleteObject(ref(storage(), p)).catch((e: { code?: string }) => {
        // Already gone is fine.
        if (e?.code !== "storage/object-not-found") throw e;
      }),
    ),
  );
}

export async function deleteGalleryFile(f: GalleryFile) {
  await removeObjects([f.path, f.thumbPath]);
  await loggedDelete(doc(db(), "gallery", f.id));
}
