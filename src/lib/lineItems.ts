import type { LineItem } from "@/config/modules";

const round = (n: number) => Math.round(n * 100) / 100;

/** Subtotal (before tax), GST and grand total of estimate lines. */
export function lineTotals(items: LineItem[] | undefined) {
  const list = Array.isArray(items) ? items : [];
  const subtotal = round(list.reduce((t, it) => t + (Number(it.qty) || 0) * (Number(it.rate) || 0), 0));
  const taxTotal = round(list.reduce((t, it) => t + (Number(it.qty) || 0) * (Number(it.rate) || 0) * ((Number(it.taxRate) || 0) / 100), 0));
  return { subtotal, taxTotal, total: round(subtotal + taxTotal) };
}
