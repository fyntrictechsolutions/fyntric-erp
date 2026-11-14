import type { SelectOption } from "./types";

/** Fixed workflow options. Editable lists (departments, sources, categories…) live in Settings > Lists. */

export const YES_NO: SelectOption[] = [
  { value: "yes", label: "Yes", tone: "green" },
  { value: "no", label: "No", tone: "neutral" },
];

export const APPROVAL_STATUS: SelectOption[] = [
  { value: "pending", label: "Pending", tone: "amber" },
  { value: "approved", label: "Approved", tone: "green" },
  { value: "rejected", label: "Rejected", tone: "red" },
];

export const ACTIVE_STATUS: SelectOption[] = [
  { value: "active", label: "Active", tone: "green" },
  { value: "inactive", label: "Inactive", tone: "neutral" },
];

export const BILLING_CYCLES: SelectOption[] = [
  { value: "monthly", label: "Billed monthly" },
  { value: "annually", label: "Billed annually" },
];

/** Adds days to a "YYYY-MM-DD" date. */
export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Document number like INV-202611-4821. */
export function docNumber(prefix: string): string {
  const d = new Date();
  return `${prefix || "DOC"}-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}-${Math.floor(1000 + Math.random() * 9000)}`;
}
