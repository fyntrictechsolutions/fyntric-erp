const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const compactInr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", notation: "compact", maximumFractionDigits: 1 });
const dateFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" });

export function formatCurrency(value: unknown, compact = false): string {
  const n = Number(value);
  if (value === undefined || value === null || value === "" || Number.isNaN(n)) return "—";
  return (compact ? compactInr : inr).format(n);
}

/** Formats a "YYYY-MM-DD" string or a millisecond timestamp. */
export function formatDate(value: unknown): string {
  if (!value) return "—";
  const d = typeof value === "number" ? new Date(value) : new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? String(value) : dateFmt.format(d);
}

/** Today's date as "YYYY-MM-DD" in the user's own time zone. */
export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Current time as "HH:MM". */
export function nowTime(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Hours between two "HH:MM" times, rounded to 2 decimals. */
export function hoursBetween(start?: unknown, end?: unknown): number | undefined {
  if (typeof start !== "string" || typeof end !== "string" || !start || !end) return undefined;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const mins = eh * 60 + em - (sh * 60 + sm);
  return mins > 0 ? Math.round((mins / 60) * 100) / 100 : undefined;
}

/** Whole days from one "YYYY-MM-DD" date to another, counting both ends. */
export function daysInclusive(from?: unknown, to?: unknown): number | undefined {
  if (typeof from !== "string" || typeof to !== "string" || !from || !to) return undefined;
  const ms = new Date(`${to}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime();
  return ms >= 0 ? Math.round(ms / 86_400_000) + 1 : undefined;
}

/** "YYYY-MM" of a date string, for monthly totals. */
export function monthOf(value: unknown): string {
  return typeof value === "string" ? value.slice(0, 7) : "";
}
