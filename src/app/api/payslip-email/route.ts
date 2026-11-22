import { createRemoteJWKSet, jwtVerify } from "jose";
import nodemailer from "nodemailer";

export const runtime = "nodejs";

const JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"));
const MAX_PDF_BYTES = 3 * 1024 * 1024;

interface Body {
  to?: string;
  subject?: string;
  text?: string;
  filename?: string;
  pdfBase64?: string;
}

const fail = (status: number, error: string) => Response.json({ error }, { status });

/**
 * Emails a payslip PDF to an employee. Only signed-in admins and HR managers may send: the caller's
 * Firebase ID token is checked here, and their role is read from Firestore with that same token,
 * so the security rules decide what they can see. Mail goes out through the SMTP account in the
 * SMTP_* environment variables (e.g. a Google Workspace mailbox with an app password).
 */
export async function POST(req: Request) {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !projectId) return fail(503, "Email sending isn't set up yet.");

  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return fail(401, "Sign in again and retry.");
  let uid: string;
  try {
    const { payload } = await jwtVerify(token, JWKS, { issuer: `https://securetoken.google.com/${projectId}`, audience: projectId });
    uid = String(payload.sub);
  } catch {
    return fail(401, "Your session has expired. Sign in again and retry.");
  }

  const res = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${uid}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const role = res.ok ? ((await res.json()) as { fields?: { role?: { stringValue?: string } } }).fields?.role?.stringValue : undefined;
  if (role !== "admin" && role !== "hr_manager") return fail(403, "Only admins and HR managers can email payslips.");

  const body = (await req.json().catch(() => ({}))) as Body;
  const to = String(body.to ?? "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return fail(400, "The employee has no valid email address.");
  if (!body.pdfBase64) return fail(400, "The payslip PDF is missing.");
  const pdf = Buffer.from(body.pdfBase64, "base64");
  if (pdf.length > MAX_PDF_BYTES) return fail(413, "The payslip PDF is too large to email.");

  const port = Number(SMTP_PORT) || 465;
  const transport = nodemailer.createTransport({ host: SMTP_HOST, port, secure: port === 465, auth: { user: SMTP_USER, pass: SMTP_PASS } });
  try {
    await transport.sendMail({
      from: SMTP_FROM || SMTP_USER,
      to,
      subject: String(body.subject ?? "Your payslip").slice(0, 200),
      text: String(body.text ?? "").slice(0, 5000),
      attachments: [{ filename: String(body.filename ?? "payslip.pdf").replace(/[^\w.-]+/g, "-"), content: pdf, contentType: "application/pdf" }],
    });
  } catch (e) {
    return fail(502, `The mail server refused the message: ${e instanceof Error ? e.message : String(e)}`);
  }
  return Response.json({ ok: true });
}
