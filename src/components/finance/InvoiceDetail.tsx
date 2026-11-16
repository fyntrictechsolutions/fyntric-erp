"use client";

import { HandCoins, Mail, MessageCircle, Pencil, Printer } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useProfile } from "@/components/auth/AuthProvider";
import { BackLink, Loading, NotFound, WithRecordId } from "@/components/common/DetailShell";
import { NoAccess } from "@/components/resource/ModulePage";
import { RecordEditor } from "@/components/resource/RecordEditor";
import { useSettings } from "@/components/settings/SettingsProvider";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import type { LineItem } from "@/config/modules";
import { invoicesModule, paymentsModule } from "@/config/modules/finance";
import { canRead } from "@/config/roles";
import { useRecord, useRecordsWhere } from "@/hooks/useCollection";
import { moduleAccess } from "@/lib/access";
import { amountInWords } from "@/lib/amountInWords";
import { formatCurrency, formatDate } from "@/lib/format";
import { joinLines, mailHref, whatsAppHref } from "@/lib/share";
import type { BaseRecord } from "@/types";
import { AmountRows, gstState, PaymentDetails, Sheet, SheetHeader, SheetLabel, Signatory } from "./DocSheet";

const linkButton = "inline-flex h-10 items-center gap-2 rounded-lg border border-line-strong bg-surface px-4 text-sm font-medium text-foreground hover:bg-tint-strong";

export function InvoiceDetailPage() {
  const profile = useProfile();
  if (!canRead(profile.role, "invoices")) return <NoAccess />;
  return <WithRecordId>{(id) => <InvoiceDetail id={id} />}</WithRecordId>;
}

/** Payments against an invoice, oldest first. */
export const byDate = (a: BaseRecord, b: BaseRecord) => String(a.date ?? "").localeCompare(String(b.date ?? "")) || (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0);

function InvoiceDetail({ id }: { id: string }) {
  const profile = useProfile();
  const settings = useSettings();
  const { data: inv, loading } = useRecord("invoices", id);
  const { data: client } = useRecord("clients", canRead(profile.role, "clients") ? ((inv?.clientId as string) ?? null) : null);
  const seesPayments = canRead(profile.role, "payments");
  const payments = useRecordsWhere("payments", "invoiceId", seesPayments ? id : null);
  const [editing, setEditing] = useState(false);
  const [paying, setPaying] = useState(false);

  if (loading) return <Loading />;
  if (!inv) return <NotFound what="invoice" />;

  const access = moduleAccess(invoicesModule, profile);
  const payAccess = moduleAccess(paymentsModule, profile);
  const status = invoicesModule.fields.find((f) => f.name === "status")?.options?.find((o) => o.value === inv.status);
  const total = Number(inv.total) || 0;
  const paid = Number(inv.amountPaid) || 0;
  const balance = Number(inv.balance ?? total - paid) || 0;
  const b = settings.business;

  const text = joinLines([
    `Hello ${String(client?.contactPerson || inv.clientIdLabel || "")},`,
    "",
    `Invoice ${String(inv.invoiceNumber ?? "")}${inv.projectIdLabel ? ` for ${String(inv.projectIdLabel)}` : ""}, dated ${formatDate(inv.issueDate)}:`,
    `Total: ${formatCurrency(total)} (including GST)`,
    paid ? `Paid so far: ${formatCurrency(paid)}` : "",
    `Balance due: ${formatCurrency(balance)}${inv.dueDate && balance > 0 ? ` by ${formatDate(inv.dueDate)}` : ""}`,
    b.upiId && balance > 0 ? `UPI: ${b.upiId}` : "",
    "",
    "Thank you,",
    b.name,
  ]);
  const subject = `Invoice ${String(inv.invoiceNumber ?? "")} from ${b.name}`;

  return (
    <div className="animate-fade-up">
      <div className="print:hidden">
        <BackLink href="/finance/invoices" label="All invoices" />
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">{String(inv.invoiceNumber ?? "Invoice")}</h1>
              {status && <Badge tone={status.tone}>{status.label}</Badge>}
            </div>
            <p className="mt-1 text-sm text-muted">
              {String(inv.clientIdLabel ?? "—")} · {formatCurrency(total)} · balance {formatCurrency(balance)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={() => window.print()}>
              <Printer className="size-4" /> Print / PDF
            </Button>
            <a href={whatsAppHref(client?.phone, text)} target="_blank" rel="noreferrer" className={linkButton}>
              <MessageCircle className="size-4" /> WhatsApp
            </a>
            <a href={mailHref(client?.email, subject, text)} className={linkButton}>
              <Mail className="size-4" /> Email
            </a>
            {access.canEdit(inv) && (
              <Button variant="secondary" onClick={() => setEditing(true)}>
                <Pencil className="size-4" /> Edit
              </Button>
            )}
            {payAccess.canCreate && balance > 0 && inv.status !== "cancelled" && (
              <Button onClick={() => setPaying(true)}>
                <HandCoins className="size-4" /> Record payment
              </Button>
            )}
          </div>
        </div>
        <p className="mb-4 text-xs text-subtle">WhatsApp and Email open with a summary filled in. To send the full invoice, use Print / PDF, save it as a PDF and attach it.</p>
      </div>

      <InvoiceSheet inv={inv} client={client} payments={seesPayments ? [...payments.data].sort(byDate) : null} />

      {editing && <RecordEditor module={invoicesModule} record={inv} onClose={() => setEditing(false)} />}
      {paying && (
        <RecordEditor
          module={paymentsModule}
          record={null}
          title="Record payment"
          preset={{ direction: "received", invoiceId: inv.id, invoiceIdLabel: inv.invoiceNumber, amount: balance }}
          onClose={() => setPaying(false)}
        />
      )}
    </div>
  );
}

function InvoiceSheet({ inv, client, payments }: { inv: BaseRecord; client: BaseRecord | null; payments: BaseRecord[] | null }) {
  const b = useSettings().business;
  const items = (inv.items as LineItem[] | undefined) ?? [];
  const legacy = !items.length;
  const rows: LineItem[] = legacy
    ? [{ name: String(inv.projectIdLabel || "Professional services"), qty: 1, rate: Number(inv.amount) || 0, taxRate: Number(inv.taxRate) || 0, amount: Number(inv.amount) || 0 }]
    : items;
  const discount = Number(inv.discount) || 0;
  const subtotal = rows.reduce((t, r) => t + (Number(r.amount) || 0), 0);
  const tax = Number(inv.taxTotal) || 0;
  const total = Number(inv.total) || 0;
  const paid = Number(inv.amountPaid) || 0;
  const balance = Number(inv.balance ?? total - paid) || 0;
  // Same state (or unknown) → CGST + SGST; different state → IGST.
  const ours = gstState(b.gstin);
  const theirs = gstState(client?.gstin);
  const igst = Boolean(ours && theirs && ours !== theirs);
  const half = Math.round((tax / 2) * 100) / 100;
  const taxRows = !tax ? [] : igst ? [{ label: "IGST", value: tax }] : [{ label: "CGST", value: half }, { label: "SGST", value: Math.round((tax - half) * 100) / 100 }];

  return (
    <Sheet>
      <SheetHeader
        title={b.gstin ? "Tax Invoice" : "Invoice"}
        meta={[
          ["No.", String(inv.invoiceNumber ?? "—")],
          ["Date", formatDate(inv.issueDate)],
          ["Due", inv.dueDate ? formatDate(inv.dueDate) : null],
        ]}
      />

      <section className="grid gap-6 py-6 sm:grid-cols-2">
        <div>
          <SheetLabel>Bill to</SheetLabel>
          <p className="mt-1 font-medium text-slate-900">{String(client?.name ?? inv.clientIdLabel ?? "—")}</p>
          {Boolean(client?.contactPerson) && <p className="text-sm text-slate-600">{String(client!.contactPerson)}</p>}
          {Boolean(client?.address) && <p className="max-w-xs text-sm whitespace-pre-line text-slate-600">{String(client!.address)}</p>}
          {Boolean(client?.phone) && <p className="text-sm text-slate-600">{String(client!.phone)}</p>}
          {Boolean(client?.gstin) && <p className="text-sm text-slate-600">GSTIN: {String(client!.gstin)}</p>}
        </div>
        {Boolean(inv.projectIdLabel) && (
          <div className="sm:text-right">
            <SheetLabel>Project</SheetLabel>
            <p className="mt-1 font-medium text-slate-900">{String(inv.projectIdLabel)}</p>
          </div>
        )}
      </section>

      <div className="-mx-6 overflow-x-auto sm:mx-0">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead>
            <tr className="border-y border-slate-200 bg-slate-50 text-xs tracking-wide text-slate-500 uppercase">
              <th className="px-3 py-2 font-medium">#</th>
              <th className="px-3 py-2 font-medium">Item</th>
              <th className="px-3 py-2 text-right font-medium">Qty</th>
              <th className="px-3 py-2 text-right font-medium">Rate</th>
              <th className="px-3 py-2 text-right font-medium">GST</th>
              <th className="px-3 py-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((it, i) => (
              <tr key={i} className="align-top">
                <td className="px-3 py-3 text-slate-500">{i + 1}</td>
                <td className="px-3 py-3">
                  <p className="font-medium text-slate-900">{it.name}</p>
                  {it.description && <p className="mt-0.5 text-xs whitespace-pre-line text-slate-500">{it.description}</p>}
                </td>
                <td className="px-3 py-3 text-right tabular-nums">{it.qty}{it.unit ? ` ${it.unit}` : ""}</td>
                <td className="px-3 py-3 text-right tabular-nums">{formatCurrency(it.rate)}</td>
                <td className="px-3 py-3 text-right tabular-nums">{it.taxRate}%</td>
                <td className="px-3 py-3 text-right font-medium tabular-nums text-slate-900">{formatCurrency(it.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-col-reverse gap-6 sm:flex-row sm:items-end sm:justify-between">
        <p className="max-w-sm text-sm text-slate-600">
          <span className="block text-xs font-semibold tracking-wide text-slate-500 uppercase">Amount in words</span>
          {amountInWords(total)}
        </p>
        <div className="flex w-full max-w-xs flex-col gap-3 self-end">
          <AmountRows
            rows={[
              { label: "Subtotal", value: subtotal },
              ...(discount ? [{ label: "Discount", value: -discount }] : []),
              ...taxRows,
              { label: "Total", value: total, strong: true },
            ]}
          />
          {(paid > 0 || inv.status !== "draft") && (
            <AmountRows
              className="rounded-xl bg-slate-50 p-3"
              rows={[
                { label: "Paid", value: paid },
                { label: "Balance due", value: balance, strong: true },
              ]}
            />
          )}
        </div>
      </div>

      {payments && payments.length > 0 && (
        <section className="mt-8 border-t border-slate-200 pt-6">
          <SheetLabel>Payments received</SheetLabel>
          <table className="mt-2 w-full text-left text-sm">
            <tbody className="divide-y divide-slate-100">
              {payments.map((p) => (
                <tr key={p.id}>
                  <td className="py-2 pr-3 whitespace-nowrap">{formatDate(p.date)}</td>
                  <td className="py-2 pr-3 text-slate-600">
                    <Link href={`/finance/payments/view?id=${p.id}`} className="hover:underline print:no-underline">{String(p.receiptNumber ?? "Receipt")}</Link>
                  </td>
                  <td className="py-2 pr-3 text-slate-600">{[p.mode, p.reference].filter(Boolean).join(" · ")}</td>
                  <td className="py-2 text-right font-medium tabular-nums text-slate-900">{formatCurrency(p.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {Boolean(inv.notes) && (
        <section className="mt-8 border-t border-slate-200 pt-6">
          <SheetLabel>Notes</SheetLabel>
          <p className="mt-1 text-sm whitespace-pre-line text-slate-700">{String(inv.notes)}</p>
        </section>
      )}

      {balance > 0 && <PaymentDetails />}
      <Signatory />
    </Sheet>
  );
}

