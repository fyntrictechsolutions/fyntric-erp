/** A phone number as wa.me wants it: digits only, with India's 91 added to 10-digit numbers. */
export function phoneForWhatsApp(phone: unknown) {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.length === 10 ? `91${digits}` : digits;
}

export const whatsAppHref = (phone: unknown, text: string) => `https://wa.me/${phoneForWhatsApp(phone)}?text=${encodeURIComponent(text)}`;

export const mailHref = (to: unknown, subject: string, body: string) =>
  `mailto:${String(to ?? "")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

/** Drops blank lines that follow another blank line. */
export const joinLines = (lines: string[]) => lines.filter((l, i, arr) => !(l === "" && arr[i - 1] === "")).join("\n");
