import { callerRole, cloudinary, deliveryType, GALLERY_EDITORS, galleryFolder, isCloudinaryConfigured, sign } from "@/lib/server/cloudinary";

/** Whether file storage is set up (the page shows setup steps if not). */
export async function GET() {
  return Response.json({ configured: isCloudinaryConfigured() }, { headers: { "Cache-Control": "no-store" } });
}

/**
 * A signature for one direct upload from the browser to Cloudinary, into this gallery's folder.
 * Private files are uploaded as "authenticated", so their plain link doesn't open.
 */
export async function POST(request: Request) {
  if (!isCloudinaryConfigured()) return Response.json({ error: "File storage isn't set up yet." }, { status: 503 });
  const body = (await request.json().catch(() => ({}))) as { gallery?: string; visibility?: string };
  const gallery = body.gallery ?? "";
  const editors = GALLERY_EDITORS[gallery];
  if (!editors) return Response.json({ error: "Unknown gallery." }, { status: 400 });
  const caller = await callerRole(request);
  if (!caller) return Response.json({ error: "Please sign in again." }, { status: 401 });
  if (!editors.includes(caller.role)) return Response.json({ error: "You can't add files here." }, { status: 403 });

  const params = { folder: galleryFolder(gallery), timestamp: Math.floor(Date.now() / 1000), type: deliveryType(body.visibility) };
  return Response.json(
    { ...params, signature: sign(params), apiKey: cloudinary.apiKey, cloudName: cloudinary.cloudName },
    { headers: { "Cache-Control": "no-store" } },
  );
}
