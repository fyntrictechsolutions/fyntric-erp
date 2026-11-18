import { collection, doc } from "firebase/firestore";
import { loggedAdd, loggedDelete, loggedUpdate } from "@/lib/audit";
import { db, firebaseAuth } from "@/lib/firebase";
import type { BaseRecord, UserProfile } from "@/types";

/**
 * Galleries of files (photos, brochures, demo videos, recordings). The files are on Cloudinary;
 * Firestore's `gallery` collection keeps one entry per file, with its name, product and tags.
 * One collection serves every gallery, told apart by `gallery` ("sales" for now).
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
  provider: "cloudinary";
  cloudName: string;
  publicId: string;
  resourceType: "image" | "video" | "raw";
  format?: string | null;
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

/** Largest file Cloudinary's free plan takes, per kind. */
export const MAX_BYTES: Record<FileKind, number> = {
  image: 10_000_000,
  pdf: 10_000_000,
  document: 10_000_000,
  video: 100_000_000,
  audio: 100_000_000,
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

// ---------- Links ----------

export type Variant = "thumb" | "view" | "download";

/** Transformation for each kind of preview. Empty means the original file. */
function transformFor(f: GalleryFile, variant: Variant): { t: string; ext: string | null } {
  const original = f.resourceType === "raw" || !f.format ? null : f.format;
  if (variant === "download") return { t: f.resourceType === "raw" ? "" : "fl_attachment", ext: original };
  if (variant === "view") {
    if (f.kind === "image") return { t: "c_limit,w_2400,h_2400,q_auto", ext: original };
    return { t: "", ext: original };
  }
  switch (f.kind) {
    case "image":
      return { t: "c_fill,w_480,h_360,q_auto", ext: f.format === "gif" ? "jpg" : original };
    case "pdf":
      return { t: "pg_1,c_fill,g_north,w_480,h_360,q_auto", ext: "jpg" };
    case "video":
      return { t: "so_1,c_fill,w_480,h_360,q_auto", ext: "jpg" };
    case "audio":
      return { t: "fl_waveform,co_rgb:3b82f6,b_transparent,w_480,h_140", ext: "png" };
    default:
      return { t: "", ext: null };
  }
}

/** Whether a kind of file has a picture preview. */
export const hasThumb = (f: GalleryFile) => f.kind !== "document";

/** The part of the link a private file's signature covers. */
export function signedPath(f: GalleryFile, variant: Variant) {
  const { t, ext } = transformFor(f, variant);
  return `${t ? `${t}/` : ""}${f.publicId}${ext ? `.${ext}` : ""}`;
}

/**
 * A link to the file. Public files have plain links anyone can open. Private ones need a signature
 * from the server (see `useSignatures`); without one this returns null.
 */
export function fileUrl(f: GalleryFile, variant: Variant, signatures: Record<string, string> = {}): string | null {
  const path = signedPath(f, variant);
  const base = `https://res.cloudinary.com/${f.cloudName}/${f.resourceType}`;
  if (f.visibility !== "private") return `${base}/upload/${path}`;
  const sig = signatures[path];
  return sig ? `${base}/authenticated/${sig}/${path}` : null;
}

/** The link to give people: the original file, public files only. */
export const publicLink = (f: GalleryFile) => (f.visibility === "private" ? null : fileUrl(f, "view"));

// ---------- Server calls ----------

async function api<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const user = firebaseAuth().currentUser;
  if (!user) throw new Error("Please sign in again.");
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${await user.getIdToken()}` },
    body: JSON.stringify(body),
  });
  const out = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(out.error ?? "Something went wrong. Please try again.");
  return out;
}

export async function storageConfigured(): Promise<boolean> {
  try {
    const res = await fetch("/api/gallery/sign", { cache: "no-store" });
    return res.ok && Boolean(((await res.json()) as { configured?: boolean }).configured);
  } catch {
    return false;
  }
}

export const fetchSignatures = (gallery: GalleryKey, paths: string[]) =>
  api<{ signatures: Record<string, string> }>("/api/gallery/urls", { gallery, paths }).then((r) => r.signatures);

// ---------- Upload ----------

interface Signed {
  folder: string;
  timestamp: number;
  type: string;
  signature: string;
  apiKey: string;
  cloudName: string;
}

interface Uploaded {
  public_id: string;
  resource_type: "image" | "video" | "raw";
  format?: string;
  bytes: number;
  width?: number;
  height?: number;
  duration?: number;
  pages?: number;
}

function sendWithProgress(url: string, form: FormData, onProgress: (fraction: number) => void): Promise<Uploaded> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      let out: (Uploaded & { error?: { message?: string } }) | null = null;
      try {
        out = JSON.parse(xhr.responseText);
      } catch {
        /* not JSON */
      }
      if (xhr.status >= 200 && xhr.status < 300 && out?.public_id) resolve(out);
      else reject(new Error(out?.error?.message ?? `Upload failed (${xhr.status}).`));
    };
    xhr.onerror = () => reject(new Error("Upload failed. Check the internet connection."));
    xhr.send(form);
  });
}

export interface UploadInput {
  file: File;
  name: string;
  visibility: Visibility;
  productId: string | null;
  productIdLabel: string | null;
  tags: string[];
  description: string;
}

/** Sends one file to Cloudinary, then adds its gallery entry. */
export async function uploadToGallery(gallery: GalleryKey, input: UploadInput, profile: UserProfile, onProgress: (fraction: number) => void) {
  const kind = kindOf(input.file);
  if (input.file.size > MAX_BYTES[kind]) {
    throw new Error(`${input.file.name} is ${formatBytes(input.file.size)}. ${KIND_LABELS[kind]} files can be up to ${formatBytes(MAX_BYTES[kind])}.`);
  }
  const signed = await api<Signed>("/api/gallery/sign", { gallery, visibility: input.visibility });
  const form = new FormData();
  form.append("file", input.file);
  form.append("api_key", signed.apiKey);
  form.append("timestamp", String(signed.timestamp));
  form.append("folder", signed.folder);
  form.append("type", signed.type);
  form.append("signature", signed.signature);
  const up = await sendWithProgress(`https://api.cloudinary.com/v1_1/${signed.cloudName}/auto/upload`, form, onProgress);

  const now = Date.now();
  const entry: Omit<GalleryFile, "id"> = {
    gallery,
    name: input.name.trim() || baseName(input.file.name),
    description: input.description.trim(),
    tags: input.tags,
    productId: input.productId,
    productIdLabel: input.productIdLabel,
    kind,
    mime: input.file.type || "application/octet-stream",
    size: up.bytes ?? input.file.size,
    width: up.width ?? null,
    height: up.height ?? null,
    duration: up.duration ?? null,
    pages: up.pages ?? null,
    visibility: input.visibility,
    provider: "cloudinary",
    cloudName: signed.cloudName,
    publicId: up.public_id,
    resourceType: up.resource_type,
    format: up.format ?? null,
    fileName: input.file.name,
    userId: profile.id,
    userName: profile.displayName,
    createdBy: profile.id,
    createdAt: now,
    updatedAt: now,
  };
  return loggedAdd(collection(db(), "gallery"), entry as Record<string, unknown>);
}

// ---------- Changes ----------

export async function updateGalleryFile(f: GalleryFile, data: Partial<Pick<GalleryFile, "name" | "description" | "tags" | "productId" | "productIdLabel">>) {
  await loggedUpdate(doc(db(), "gallery", f.id), { ...data, updatedAt: Date.now() });
}

/** Public: anyone with the link can open it. Private: only signed-in team members. The old link stops working. */
export async function setVisibility(f: GalleryFile, visibility: Visibility) {
  if (f.visibility === visibility) return;
  await api("/api/gallery/visibility", { gallery: f.gallery, publicId: f.publicId, resourceType: f.resourceType, visibility });
  await loggedUpdate(doc(db(), "gallery", f.id), { visibility, updatedAt: Date.now() }, visibility === "public" ? "Made public" : "Made private");
}

export async function deleteGalleryFile(f: GalleryFile) {
  await api("/api/gallery/delete", { gallery: f.gallery, publicId: f.publicId, resourceType: f.resourceType, visibility: f.visibility });
  await loggedDelete(doc(db(), "gallery", f.id));
}
