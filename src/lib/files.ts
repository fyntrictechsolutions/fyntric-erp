import { addDoc, collection, deleteDoc, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { UserProfile } from "@/types";

/**
 * Small documents (certificates, signed letters) stored inside Firestore, because file storage
 * needs Firebase's paid plan. Each file must fit in one document, so photos are shrunk first.
 */
export const MAX_FILE_BYTES = 700_000;

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

/** Approximate size in bytes of a data: URL's contents. */
function dataUrlBytes(url: string) {
  return Math.round(((url.length - url.indexOf(",") - 1) * 3) / 4);
}

async function shrinkImage(file: File): Promise<string> {
  const src = await readAsDataUrl(file);
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("This image can't be read."));
    i.src = src;
  });
  let maxSide = 2000;
  let quality = 0.85;
  for (let attempt = 0; attempt < 8; attempt++) {
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const out = canvas.toDataURL("image/jpeg", quality);
    if (dataUrlBytes(out) <= MAX_FILE_BYTES) return out;
    maxSide = Math.round(maxSide * 0.8);
    quality = Math.max(0.5, quality - 0.08);
  }
  throw new Error("This photo is too large even after shrinking it.");
}

/** Turns a picked file into a data: URL that fits in a document, or throws a readable error. */
export async function prepareFile(file: File): Promise<{ data: string; type: string; size: number }> {
  if (file.type.startsWith("image/")) {
    const data = await shrinkImage(file);
    return { data, type: "image/jpeg", size: dataUrlBytes(data) };
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`${file.name} is ${(file.size / 1_000_000).toFixed(1)} MB. Files up to 0.7 MB can be stored; scan PDFs at a lower quality or upload photos instead.`);
  }
  const data = await readAsDataUrl(file);
  return { data, type: file.type || "application/octet-stream", size: file.size };
}

export interface StoredFile {
  id: string;
  ownerType: string;
  ownerId: string;
  kind: string;
  name: string;
  type: string;
  size: number;
  data: string;
  userName?: string;
  createdAt?: number;
}

export async function saveFile(
  owner: { ownerType: string; ownerId: string; kind: string },
  file: File,
  profile: UserProfile,
) {
  const prepared = await prepareFile(file);
  const now = Date.now();
  return addDoc(collection(db(), "files"), {
    ...owner,
    name: file.name,
    ...prepared,
    userId: profile.id,
    userName: profile.displayName,
    createdBy: profile.id,
    createdAt: now,
    updatedAt: now,
  });
}

export function deleteFile(id: string) {
  return deleteDoc(doc(db(), "files", id));
}

/** Opens a stored file in a new tab (browsers block opening data: URLs directly). */
export async function openFile(f: Pick<StoredFile, "data" | "name">) {
  const blob = await (await fetch(f.data)).blob();
  const url = URL.createObjectURL(blob);
  const w = window.open(url, "_blank", "noopener");
  if (!w) {
    const a = document.createElement("a");
    a.href = url;
    a.download = f.name;
    a.click();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
