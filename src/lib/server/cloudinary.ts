import { createHash } from "node:crypto";

/**
 * Cloudinary keeps the gallery's files (the free Firebase plan has no file storage).
 * The secret stays on the server: the browser asks these routes for a one-time
 * signature to upload, and the server deletes files itself.
 */
export const cloudinary = {
  cloudName: process.env.CLOUDINARY_CLOUD_NAME ?? "",
  apiKey: process.env.CLOUDINARY_API_KEY ?? "",
  apiSecret: process.env.CLOUDINARY_API_SECRET ?? "",
};

export const isCloudinaryConfigured = () => Boolean(cloudinary.cloudName && cloudinary.apiKey && cloudinary.apiSecret);

/** Folder per gallery, so other galleries can be added later. */
export const galleryFolder = (gallery: string) => `fyntric-erp/${gallery}-gallery`;

/** Cloudinary's request signature: parameters sorted by name, joined, plus the secret, SHA-1. */
export function sign(params: Record<string, string | number>) {
  const text = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  return createHash("sha1").update(text + cloudinary.apiSecret).digest("hex");
}

const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "";
const useEmulators = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true";

/**
 * Who is calling, from their Firebase ID token. Instead of checking the token ourselves we read the
 * caller's own profile through Firestore's REST API with it: Firestore rejects a bad or expired token,
 * and the profile gives the role. No service account needed.
 */
export async function callerRole(request: Request): Promise<{ uid: string; role: string } | null> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token || !projectId) return null;
  let uid: string;
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")) as { user_id?: string; sub?: string };
    uid = payload.user_id ?? payload.sub ?? "";
  } catch {
    return null;
  }
  if (!uid) return null;
  const base = useEmulators ? "http://127.0.0.1:8080" : "https://firestore.googleapis.com";
  const res = await fetch(`${base}/v1/projects/${projectId}/databases/(default)/documents/users/${encodeURIComponent(uid)}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const doc = (await res.json()) as { fields?: Record<string, { stringValue?: string; booleanValue?: boolean }> };
  if (doc.fields?.active?.booleanValue !== true) return null;
  return { uid, role: doc.fields?.role?.stringValue ?? "none" };
}

/** Roles that may add, change or remove files, per gallery. Mirrors firestore.rules. */
export const GALLERY_EDITORS: Record<string, string[]> = { sales: ["admin", "sales"] };

/** Roles that may see a gallery's private files. Mirrors firestore.rules. */
export const GALLERY_READERS: Record<string, string[]> = {
  sales: ["admin", "project_manager", "hr_manager", "sales", "staff", "investor", "viewer"],
};

/**
 * Cloudinary delivery types: public files are "upload" (anyone with the link can open them),
 * private files are "authenticated" (opened only through a link the server signs).
 */
export type DeliveryType = "upload" | "authenticated";
export const deliveryType = (visibility: unknown): DeliveryType => (visibility === "private" ? "authenticated" : "upload");

export const resourceTypeOf = (value: unknown) => (value === "video" || value === "raw" ? value : "image");

/**
 * Signature component of a signed delivery URL ("s--abcd1234--"), over the part of the path after it:
 * "<transformation>/<public id>.<format>".
 */
export function deliverySignature(path: string) {
  const digest = createHash("sha1").update(path + cloudinary.apiSecret).digest("base64url");
  return `s--${digest.slice(0, 8)}--`;
}

/** A signed request to Cloudinary's admin/upload API. */
/** Every parameter is signed, as Cloudinary expects. */
export async function cloudinaryCall(resourceType: string, action: string, params: Record<string, string | number>) {
  const timestamp = Math.floor(Date.now() / 1000);
  const signed = { ...params, timestamp };
  const form = new URLSearchParams({
    ...Object.fromEntries(Object.entries(signed).map(([k, v]) => [k, String(v)])),
    api_key: cloudinary.apiKey,
    signature: sign(signed),
  });
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudinary.cloudName}/${resourceType}/${action}`, { method: "POST", body: form });
  const out = (await res.json().catch(() => ({}))) as Record<string, unknown> & { result?: string; error?: { message?: string } };
  return { ok: res.ok, out };
}
