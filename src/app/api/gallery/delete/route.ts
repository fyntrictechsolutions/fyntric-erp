import { callerRole, cloudinaryCall, deliveryType, GALLERY_EDITORS, galleryFolder, isCloudinaryConfigured, resourceTypeOf } from "@/lib/server/cloudinary";

/** Removes a file from Cloudinary. The browser deletes the gallery entry itself (checked by firestore.rules). */
export async function POST(request: Request) {
  if (!isCloudinaryConfigured()) return Response.json({ error: "File storage isn't set up yet." }, { status: 503 });
  const body = (await request.json().catch(() => ({}))) as { gallery?: string; publicId?: string; resourceType?: string; visibility?: string };
  const editors = GALLERY_EDITORS[body.gallery ?? ""];
  if (!editors) return Response.json({ error: "Unknown gallery." }, { status: 400 });
  const caller = await callerRole(request);
  if (!caller) return Response.json({ error: "Please sign in again." }, { status: 401 });
  if (!editors.includes(caller.role)) return Response.json({ error: "You can't delete files here." }, { status: 403 });

  const publicId = body.publicId ?? "";
  // Only files in this gallery's folder.
  if (!publicId.startsWith(`${galleryFolder(body.gallery!)}/`)) return Response.json({ error: "Not a file of this gallery." }, { status: 400 });

  const { ok, out } = await cloudinaryCall(resourceTypeOf(body.resourceType), "destroy", { public_id: publicId, type: deliveryType(body.visibility), invalidate: "true" });
  // "not found" is fine: the file is gone either way.
  if (!ok || (out.result !== "ok" && out.result !== "not found")) {
    return Response.json({ error: out.error?.message ?? "Cloudinary didn't delete the file." }, { status: 502 });
  }
  return Response.json({ ok: true });
}
