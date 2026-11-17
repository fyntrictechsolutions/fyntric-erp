import { headers } from "next/headers";

/** The caller's IP address and rough location (from Vercel's edge headers), for the activity log. */
export async function GET() {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
  const part = (name: string) => {
    const v = h.get(name);
    if (!v) return "";
    try {
      return decodeURIComponent(v);
    } catch {
      return v;
    }
  };
  const location = [part("x-vercel-ip-city"), part("x-vercel-ip-country-region"), part("x-vercel-ip-country")].filter(Boolean).join(", ") || null;
  return Response.json({ ip, location }, { headers: { "Cache-Control": "no-store" } });
}
