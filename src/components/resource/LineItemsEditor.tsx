"use client";

import { Plus, Trash2 } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useSettings } from "@/components/settings/SettingsProvider";
import { Button } from "@/components/ui/Button";
import { inputClasses } from "@/components/ui/fieldStyles";
import type { Billing, LineItem } from "@/config/modules";
import { useModuleRecords } from "@/hooks/useCollection";
import { cn } from "@/lib/cn";
import { formatCurrency } from "@/lib/format";
import { BILLING_GROUPS, billingOf, groupedTotals } from "@/lib/lineItems";

const cell = cn(inputClasses, "px-2 py-1.5");

/** Estimate lines: pick a product or service from the catalogue (fills rate, unit and GST) or type a custom line. */
export function LineItemsEditor({ value, onChange }: { value: LineItem[]; onChange: (items: LineItem[]) => void }) {
  const { profile } = useAuth();
  const settings = useSettings();
  const { data: products } = useModuleRecords("products", profile!);
  const active = products.filter((p) => p.status !== "inactive").sort((a, b) => String(a.name).localeCompare(String(b.name)));

  const update = (i: number, patch: Partial<LineItem>) => {
    const next = value.map((it, idx) => {
      if (idx !== i) return it;
      const merged = { ...it, ...patch };
      return { ...merged, amount: Math.round(Number(merged.qty || 0) * Number(merged.rate || 0) * 100) / 100 };
    });
    onChange(next);
  };

  const pick = (i: number, productId: string) => {
    const p = active.find((x) => x.id === productId);
    if (!p) return update(i, { productId: undefined });
    const cycle = p.isSubscription ? (p.billingCycle === "annually" ? "Billed annually" : "Billed monthly") : "";
    update(i, {
      productId: p.id,
      name: String(p.name),
      description: [cycle, p.description].filter(Boolean).join(" · "),
      unit: String(p.unit ?? (p.isSubscription ? (p.billingCycle === "annually" ? "Year" : "Month") : "Nos")),
      rate: Number(p.price) || 0,
      billing: (p.isSubscription ? (p.billingCycle === "annually" ? "annually" : "monthly") : "once") as Billing,
      taxRate: p.taxRate === undefined || p.taxRate === null ? settings.app.defaultTaxRate : Number(p.taxRate),
    });
  };

  const add = () =>
    onChange([...value, { name: "", qty: 1, unit: "Nos", rate: 0, taxRate: settings.app.defaultTaxRate, amount: 0, billing: "once" }]);
  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i));
  const groups = groupedTotals(value);

  return (
    <div className="rounded-xl border border-line">
      <div className="hidden grid-cols-[1fr_4.5rem_6.5rem_4.5rem_6.5rem_2rem] gap-2 border-b border-line bg-tint px-3 py-2 text-xs font-medium tracking-wide text-muted uppercase md:grid">
        <span>Item</span>
        <span>Qty</span>
        <span>Rate (₹)</span>
        <span>GST %</span>
        <span className="text-right">Amount</span>
        <span />
      </div>
      <ul className="divide-y divide-line">
        {value.map((it, i) => (
          <li key={i} className="grid grid-cols-2 gap-2 p-3 md:grid-cols-[1fr_4.5rem_6.5rem_4.5rem_6.5rem_2rem] md:items-start">
            <div className="col-span-2 space-y-1.5 md:col-span-1">
              <select className={cell} value={it.productId ?? ""} onChange={(e) => pick(i, e.target.value)} aria-label="Product or service">
                <option value="">Custom item…</option>
                {active.map((p) => (
                  <option key={p.id} value={p.id}>
                    {String(p.name)} · {formatCurrency(p.price)}
                  </option>
                ))}
              </select>
              <input className={cell} placeholder="Item name" required value={it.name} onChange={(e) => update(i, { name: e.target.value })} aria-label="Item name" />
              <input className={cell} placeholder="Description (optional)" value={it.description ?? ""} onChange={(e) => update(i, { description: e.target.value })} aria-label="Description" />
              <select className={cell} value={billingOf(it)} onChange={(e) => update(i, { billing: e.target.value as Billing })} aria-label="Billing">
                {BILLING_GROUPS.map((g) => (
                  <option key={g.key} value={g.key}>{g.key === "once" ? "One-time" : `${g.short} (recurring)`}</option>
                ))}
              </select>
            </div>
            <label className="text-xs text-muted md:text-[0px]">
              <span className="md:hidden">Qty</span>
              <input className={cell} type="number" min={0} step="any" value={it.qty} onChange={(e) => update(i, { qty: Number(e.target.value) })} aria-label="Quantity" />
            </label>
            <label className="text-xs text-muted md:text-[0px]">
              <span className="md:hidden">Rate (₹)</span>
              <input className={cell} type="number" min={0} step="any" value={it.rate} onChange={(e) => update(i, { rate: Number(e.target.value) })} aria-label="Rate" />
            </label>
            <label className="text-xs text-muted md:text-[0px]">
              <span className="md:hidden">GST %</span>
              <input className={cell} type="number" min={0} max={100} step="any" value={it.taxRate} onChange={(e) => update(i, { taxRate: Number(e.target.value) })} aria-label="GST percent" />
            </label>
            <p className="self-center text-right text-sm font-medium text-foreground tabular-nums">{formatCurrency(it.amount)}</p>
            <button type="button" onClick={() => remove(i)} className="justify-self-end rounded-lg p-1.5 text-muted hover:bg-tint-strong hover:text-red-600" aria-label="Remove item">
              <Trash2 className="size-4" />
            </button>
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-3 border-t border-line p-3 sm:flex-row sm:items-start sm:justify-between">
        <Button size="sm" variant="secondary" onClick={add}>
          <Plus className="size-3.5" /> Add item
        </Button>
        <div className="space-y-3">
          {groups.map((g) => (
            <dl key={g.key} className="grid grid-cols-[auto_8rem] gap-x-6 gap-y-1 text-sm">
              {groups.length > 1 && <dt className="col-span-2 text-xs font-semibold tracking-wide text-muted uppercase">{g.label}</dt>}
              <dt className="text-muted">Subtotal</dt>
              <dd className="text-right tabular-nums">{formatCurrency(g.subtotal)}</dd>
              <dt className="text-muted">GST</dt>
              <dd className="text-right tabular-nums">{formatCurrency(g.taxTotal)}</dd>
              <dt className="font-semibold text-foreground">Total{g.per}</dt>
              <dd className="text-right font-semibold text-foreground tabular-nums">{formatCurrency(g.total)}</dd>
            </dl>
          ))}
        </div>
      </div>
    </div>
  );
}
