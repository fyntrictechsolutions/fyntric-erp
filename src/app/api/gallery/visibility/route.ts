import { callerRole, cloudinaryCall, deliveryType, GALLERY_EDITORS, galleryFolder, isCloudinaryConfigured, resourceTypeOf } from "@/lib/server/cloudinary";

/**
 * Makes a file public (anyone with the link) or private (team only), by moving it between
 * Cloudinary's "upload" and "authenticated" delivery types. The old link stops working.
 */
export async function POST(request: Request) {
  if (!isCloudinaryConfigured()) return Response.json({ error: "File storage isn't set up yet." }, { status: 503 });
  const body = (await request.json().catch(() => ({}))) as { gallery?: string; publicId?: string; resourceType?: string; visibility?: string };
  const editors = GALLERY_EDITORS[body.gallery ?? ""];
  if (!editors) return Response.json({ error: "Unknown gallery." }, { status: 400 });
  const caller = await callerRole(request);
  if (!caller) return Response.json({ error: "Please sign in again." }, { status: 401 });
  if (!editors.includes(caller.role)) return Response.json({ error: "You can't change files here." }, { status: 403 });
  if (body.visibility !== "public" && body.visibility !== "private") return Response.json({ error: "Choose public or private." }, { status: 400 });

  const publicId = body.publicId ?? "";
  if (!publicId.startsWith(`${galleryFolder(body.gallery!)}/`)) return Response.json({ error: "Not a file of this gallery." }, { status: 400 });

  const to = deliveryType(body.visibility);
  const from = to === "upload" ? "authenticated" : "upload";
  const { ok, out } = await cloudinaryCall(
    resourceTypeOf(body.resourceType),
    "rename",
    { from_public_id: publicId, to_public_id: publicId, type: from, to_type: to, invalidate: "true" },
  );
  if (!ok) return Response.json({ error: out.error?.message ?? "Cloudinary didn't change the file." }, { status: 502 });
  return Response.json({ ok: true, version: out.version ?? null });
}
