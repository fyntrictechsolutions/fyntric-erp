import type { Billing, LineItem } from "@/config/modules";

const round = (n: number) => Math.round(n * 100) / 100;

/** Subtotal (before tax), GST and grand total of estimate lines. */
export function lineTotals(items: LineItem[] | undefined) {
  const list = Array.isArray(items) ? items : [];
  const subtotal = round(list.reduce((t, it) => t + (Number(it.qty) || 0) * (Number(it.rate) || 0), 0));
  const taxTotal = round(list.reduce((t, it) => t + (Number(it.qty) || 0) * (Number(it.rate) || 0) * ((Number(it.taxRate) || 0) / 100), 0));
  return { subtotal, taxTotal, total: round(subtotal + taxTotal) };
}

/** Totals after a discount on the pre-GST value; GST shrinks in proportion to the discount. */
export function discountedTotals(items: LineItem[], discountInput: unknown) {
  const { subtotal, taxTotal } = lineTotals(items);
  const discount = Math.min(Number(discountInput) || 0, subtotal);
  const ratio = subtotal ? (subtotal - discount) / subtotal : 1;
  const tax = Math.round(taxTotal * ratio * 100) / 100;
  return { subtotal, discount, taxable: Math.round((subtotal - discount) * 100) / 100, taxTotal: tax, total: Math.round((subtotal - discount + tax) * 100) / 100 };
}

export const BILLING_GROUPS: { key: Billing; label: string; short: string; per: string }[] = [
  { key: "once", label: "One-time charges", short: "One-time", per: "" },
  { key: "annually", label: "Annual recurring charges", short: "Yearly", per: " / year" },
  { key: "monthly", label: "Monthly recurring charges", short: "Monthly", per: " / month" },
];

/** How a line is billed. Older lines have no `billing`, so read it from the unit or description the product filled in. */
export function billingOf(it: LineItem): Billing {
  if (it.billing) return it.billing;
  const unit = String(it.unit ?? "").toLowerCase();
  const desc = String(it.description ?? "").toLowerCase();
  if (unit === "year" || desc.includes("billed annually")) return "annually";
  if (unit === "month" || desc.includes("billed monthly")) return "monthly";
  return "once";
}

export interface GroupTotals extends ReturnType<typeof discountedTotals> {
  key: Billing;
  label: string;
  short: string;
  per: string;
  items: { item: LineItem; index: number }[];
}

/**
 * Lines split into one-time, yearly and monthly groups, each with its own totals, since adding them together means nothing.
 * The discount comes off the one-time charges, or the first group there is when nothing is one-time.
 */
export function groupedTotals(items: LineItem[] | undefined, discountInput?: unknown): GroupTotals[] {
  const list = Array.isArray(items) ? items : [];
  const groups = BILLING_GROUPS.map((g) => ({ ...g, items: list.map((item, index) => ({ item, index })).filter(({ item }) => billingOf(item) === g.key) })).filter((g) => g.items.length);
  return groups.map((g, i) => ({ ...g, ...discountedTotals(g.items.map((x) => x.item), i === 0 ? discountInput : 0) }));
}

/** Flat fields saved on the record, so lists and reports can show each group without the items. */
export function groupFields(groups: GroupTotals[]) {
  const total = (k: Billing) => groups.find((g) => g.key === k)?.total ?? null;
  return { oneTimeTotal: total("once"), annualTotal: total("annually"), monthlyTotal: total("monthly") };
}
