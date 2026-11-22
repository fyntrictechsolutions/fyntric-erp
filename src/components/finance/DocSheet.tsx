"use client";

import type { ReactNode } from "react";
import { CompanyLogo } from "@/components/common/CompanyLogo";
import { useSettings } from "@/components/settings/SettingsProvider";
import { cn } from "@/lib/cn";
import { formatCurrency } from "@/lib/format";

/** A document as paper (invoice, receipt): always light, so it prints the same in either theme. */
export function Sheet({ children, className }: { children: ReactNode; className?: string }) {
  return <article className={cn("print-sheet mx-auto max-w-4xl rounded-2xl border border-slate-200 bg-white p-6 text-slate-800 shadow-card sm:p-10", className)}>{children}</article>;
}

/** Company block on the left, document title and numbers on the right. */
export function SheetHeader({ title, meta }: { title: string; meta: [string, ReactNode][] }) {
  const b = useSettings().business;
  return (
    <header className="flex flex-col gap-6 border-b border-slate-200 pb-6 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <CompanyLogo />
        <p className="mt-3 font-semibold text-slate-900">{b.name}</p>
        <p className="mt-1 max-w-xs text-sm whitespace-pre-line text-slate-600">{b.address}</p>
        <p className="mt-1 text-sm text-slate-600">{[b.phone, b.email].filter(Boolean).join(" · ")}</p>
        {b.gstin && <p className="mt-1 text-sm text-slate-600">GSTIN: {b.gstin}</p>}
      </div>
      <div className="sm:text-right">
        <p className="text-2xl font-semibold tracking-tight text-slate-900">{title}</p>
        <dl className="mt-2 space-y-0.5 text-sm">
          {meta
            .filter(([, v]) => v !== null && v !== undefined && v !== "")
            .map(([k, v]) => (
              <div key={k}>
                <dt className="inline text-slate-500">{k} </dt>
                <dd className="inline font-medium text-slate-900">{v}</dd>
              </div>
            ))}
        </dl>
      </div>
    </header>
  );
}

export function SheetLabel({ children }: { children: ReactNode }) {
  return <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{children}</p>;
}

/** Label / amount rows; `strong` rows get a rule above and bold text. */
export function AmountRows({ rows, className }: { rows: { label: string; value: unknown; strong?: boolean; hint?: string }[]; className?: string }) {
  return (
    <dl className={cn("w-full max-w-xs space-y-1.5 text-sm", className)}>
      {rows.map((r) => (
        <div key={r.label} className={cn("flex justify-between gap-4", r.strong && "border-t border-slate-200 pt-2 text-base font-semibold text-slate-900")}>
          <dt className={r.strong ? "" : "text-slate-500"}>
            {r.label}
            {r.hint && <span className="block text-xs font-normal text-slate-400">{r.hint}</span>}
          </dt>
          <dd className="tabular-nums">{formatCurrency(r.value)}</dd>
        </div>
      ))}
    </dl>
  );
}

/** UPI and bank account from Settings, if filled in. */
export function PaymentDetails() {
  const b = useSettings().business;
  if (!b.upiId && !b.accountNumber) return null;
  return (
    <section className="mt-6 border-t border-slate-200 pt-6 text-sm text-slate-600">
      <SheetLabel>Payment details</SheetLabel>
      {b.upiId && <p className="mt-1">UPI: {b.upiId}</p>}
      {b.accountNumber && <p className="mt-1">{[b.accountName, b.bankName, `A/c ${b.accountNumber}`, b.ifsc && `IFSC ${b.ifsc}`].filter(Boolean).join(" · ")}</p>}
    </section>
  );
}

export function Signatory() {
  const b = useSettings().business;
  return (
    <div className="mt-10 flex justify-end text-sm">
      <div className="text-center">
        <p className="text-slate-600">For {b.name}</p>
        <div className="mt-12 w-56 border-t border-slate-300 pt-1 text-xs text-slate-500">Authorised signatory</div>
      </div>
    </div>
  );
}

/** First two digits of a GSTIN are the state code. */
export const gstState = (gstin: unknown) => {
  const m = /^(\d{2})/.exec(String(gstin ?? "").trim());
  return m ? m[1] : null;
};
