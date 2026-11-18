import { callerRole, deliverySignature, GALLERY_READERS, galleryFolder, isCloudinaryConfigured } from "@/lib/server/cloudinary";

/**
 * Signatures for opening private files inside the app. The browser sends the paths it wants
 * ("<transformation>/<public id>.<format>") and gets back one signature per path.
 */
export async function POST(request: Request) {
  if (!isCloudinaryConfigured()) return Response.json({ error: "File storage isn't set up yet." }, { status: 503 });
  const body = (await request.json().catch(() => ({}))) as { gallery?: string; paths?: unknown };
  const readers = GALLERY_READERS[body.gallery ?? ""];
  if (!readers) return Response.json({ error: "Unknown gallery." }, { status: 400 });
  const caller = await callerRole(request);
  if (!caller) return Response.json({ error: "Please sign in again." }, { status: 401 });
  if (!readers.includes(caller.role)) return Response.json({ error: "You can't open these files." }, { status: 403 });

  const folder = `${galleryFolder(body.gallery!)}/`;
  const paths = (Array.isArray(body.paths) ? body.paths : []).filter((p): p is string => typeof p === "string").slice(0, 500);
  const signatures: Record<string, string> = {};
  for (const path of paths) {
    // The public id (after any transformation) must be in this gallery's folder.
    if (path.includes("..") || !path.split("/").some((_, i, parts) => parts.slice(i).join("/").startsWith(folder))) continue;
    signatures[path] = deliverySignature(path);
  }
  return Response.json({ signatures }, { headers: { "Cache-Control": "no-store" } });
}
