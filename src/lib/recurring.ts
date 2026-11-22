import type { LineItem } from "@/config/modules/types";
import { formatDate } from "@/lib/format";

/**
 * Recurring charges (AMC, hosting, subscriptions) are billed on their own schedule, not on the first invoice.
 * Each schedule at recurring/{id} holds the lines, the frequency and the next billing date. The app only
 * reminds: someone raises each invoice, and saving it moves the next billing date one period on.
 */

export type Frequency = "annually" | "monthly";

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Adds whole months to a "YYYY-MM-DD" date; the 31st becomes the last day of a shorter month. */
export function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const target = new Date(y, m - 1 + months, 1);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(d, last));
  return iso(target);
}

const monthsIn = (f: unknown) => (f === "monthly" ? 1 : 12);

/** The billing date after this one. */
export const nextDueAfter = (date: string, frequency: unknown) => addMonths(date, monthsIn(frequency));

/** "1 Dec 2027 – 30 Nov 2028" for the period starting on `start`. */
export function periodLabel(start: string, frequency: unknown): string {
  const end = new Date(`${nextDueAfter(start, frequency)}T00:00:00`);
  end.setDate(end.getDate() - 1);
  return `${formatDate(start)} – ${formatDate(iso(end))}`;
}

/** Days from today to the billing date (negative when it has passed). */
export function daysUntil(date: unknown, today: string): number {
  if (!date) return Infinity;
  return Math.round((new Date(`${String(date)}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) / 86_400_000);
}

/** Shown on the dashboard this many days before the billing date. */
export const REMIND_DAYS = 14;

/** Lines for the invoice of one period: the same lines, each with the period it covers. */
export function linesForPeriod(items: LineItem[] | undefined, start: string, frequency: unknown): LineItem[] {
  const period = `Period: ${periodLabel(start, frequency)}`;
  return (items ?? []).map((it) => ({ ...it, description: [it.description, period].filter(Boolean).join("\n") }));
}
