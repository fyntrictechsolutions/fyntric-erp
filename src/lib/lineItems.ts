import type { LineItem } from "@/config/modules";

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
