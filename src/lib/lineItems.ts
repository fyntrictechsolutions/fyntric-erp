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

/** Record fields holding the discount on each group of an estimate. */
export const DISCOUNT_FIELDS: Record<Billing, string> = { once: "discountOnce", annually: "discountAnnually", monthly: "discountMonthly" };

/**
 * Discounts of a record for groupedTotals: one per group, or for older estimates the single `discount`,
 * which came off the first group (the one-time charges, if any).
 */
export function discountsOf(record: Record<string, unknown>): Partial<Record<Billing, unknown>> | unknown {
  const keys = Object.keys(DISCOUNT_FIELDS) as Billing[];
  if (keys.some((k) => record[DISCOUNT_FIELDS[k]] !== undefined)) return Object.fromEntries(keys.map((k) => [k, record[DISCOUNT_FIELDS[k]]]));
  return record.discount;
}

/**
 * Lines split into one-time, yearly and monthly groups, each with its own totals, since adding them together means nothing.
 * `discounts` gives each group its own discount; a single number comes off the first group (older estimates).
 */
export function groupedTotals(items: LineItem[] | undefined, discounts?: Partial<Record<Billing, unknown>> | unknown): GroupTotals[] {
  const list = Array.isArray(items) ? items : [];
  const groups = BILLING_GROUPS.map((g) => ({ ...g, items: list.map((item, index) => ({ item, index })).filter(({ item }) => billingOf(item) === g.key) })).filter((g) => g.items.length);
  const perGroup = discounts !== null && typeof discounts === "object";
  return groups.map((g, i) => ({
    ...g,
    ...discountedTotals(
      g.items.map((x) => x.item),
      perGroup ? (discounts as Partial<Record<Billing, unknown>>)[g.key] : i === 0 ? discounts : 0,
    ),
  }));
}

/** Whether any line is billed this way (e.g. to show the discount box for monthly charges only when there are some). */
export const hasBilling = (items: unknown, billing: Billing) => Array.isArray(items) && (items as LineItem[]).some((it) => billingOf(it) === billing);

/** Flat fields saved on the record, so lists and reports can show each group without the items. */
export function groupFields(groups: GroupTotals[]) {
  const total = (k: Billing) => groups.find((g) => g.key === k)?.total ?? null;
  return { oneTimeTotal: total("once"), annualTotal: total("annually"), monthlyTotal: total("monthly") };
}
