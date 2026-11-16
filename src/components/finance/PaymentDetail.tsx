"use client";

import { FileText, Mail, MessageCircle, Pencil, Printer } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useProfile } from "@/components/auth/AuthProvider";
import { BackLink, Loading, NotFound, WithRecordId } from "@/components/common/DetailShell";
import { NoAccess } from "@/components/resource/ModulePage";
import { RecordEditor } from "@/components/resource/RecordEditor";
import { useSettings } from "@/components/settings/SettingsProvider";
import { Button } from "@/components/ui/Button";
import { paymentsModule } from "@/config/modules/finance";
import { canRead } from "@/config/roles";
import { useRecord, useRecordsWhere } from "@/hooks/useCollection";
import { moduleAccess } from "@/lib/access";
import { amountInWords } from "@/lib/amountInWords";
import { formatCurrency, formatDate } from "@/lib/format";
import { joinLines, mailHref, whatsAppHref } from "@/lib/share";
import type { BaseRecord } from "@/types";
import { AmountRows, Sheet, SheetHeader, SheetLabel, Signatory } from "./DocSheet";
import { byDate } from "./InvoiceDetail";

const linkButton = "inline-flex h-10 items-center gap-2 rounded-lg border border-line-strong bg-surface px-4 text-sm font-medium text-foreground hover:bg-tint-strong";

export function PaymentDetailPage() {
  const profile = useProfile();
  if (!canRead(profile.role, "payments")) return <NoAccess />;
  return <WithRecordId>{(id) => <PaymentDetail id={id} />}</WithRecordId>;
}

/** Receipt numbers were added later; older payments get one from their id. */
const receiptNo = (p: BaseRecord) => String(p.receiptNumber || `${p.direction === "paid" ? "PAY" : "RCT"}-${p.id.slice(0, 6).toUpperCase()}`);

/**
 * Payment receipt (money received against an invoice) or payment voucher (paid out against a purchase bill).
 * Shows the bill's total, what has been paid up to and including this payment, and what is left.
 */
function PaymentDetail({ id }: { id: string }) {
  const profile = useProfile();
  const settings = useSettings();
  const { data: pay, loading } = useRecord("payments", id);
  const received = pay?.direction !== "paid";
  const targetId = ((received ? pay?.invoiceId : pay?.billId) as string | undefined) ?? null;
  const { data: target } = useRecord(received ? "invoices" : "purchases", canRead(profile.role, received ? "invoices" : "purchases") ? targetId : null);
  const partyModule = received ? "clients" : "suppliers";
  const partyId = ((received ? target?.clientId : target?.supplierId) as string | undefined) ?? null;
  const { data: party } = useRecord(partyModule, canRead(profile.role, partyModule) ? partyId : null);
  const all = useRecordsWhere("payments", received ? "invoiceId" : "billId", targetId);
  const [editing, setEditing] = useState(false);

  if (loading) return <Loading />;
  if (!pay) return <NotFound what="payment" />;

  const b = settings.business;
  const access = moduleAccess(paymentsModule, profile);
  const no = receiptNo(pay);
  const amount = Number(pay.amount) || 0;
  const docNo = String((received ? target?.invoiceNumber ?? pay.invoiceIdLabel : target?.billNumber ?? pay.billIdLabel) ?? "");
  const partyName = String((received ? party?.name ?? target?.clientIdLabel : party?.name ?? target?.supplierIdLabel) ?? "—");
  const project = received ? (target?.projectIdLabel as string | undefined) : undefined;

  // Paid up to and including this payment, so an older receipt still shows the balance as it was then.
  const sorted = [...all.data].sort(byDate);
  const upto = sorted.slice(0, Math.max(0, sorted.findIndex((p) => p.id === pay.id)) + 1);
  const total = Number(target?.total) || 0;
  const paidSoFar = Math.round(upto.reduce((t, p) => t + (Number(p.amount) || 0), 0) * 100) / 100;
  const balance = Math.round((total - paidSoFar) * 100) / 100;
  const earlier = upto.slice(0, -1);
  const showSummary = Boolean(target);

  const text = joinLines([
    `Hello ${String(party?.contactPerson || partyName)},`,
    "",
    received
      ? `We have received ${formatCurrency(amount)} on ${formatDate(pay.date)}${pay.mode ? ` by ${String(pay.mode)}` : ""}${pay.reference ? ` (ref ${String(pay.reference)})` : ""}. Thank you!`
      : `We have paid ${formatCurrency(amount)} on ${formatDate(pay.date)}${pay.mode ? ` by ${String(pay.mode)}` : ""}${pay.reference ? ` (ref ${String(pay.reference)})` : ""} against your bill ${docNo}.`,
    `Receipt no.: ${no}`,
    ...(showSummary
      ? ["", `${received ? `Invoice ${docNo}` : `Bill ${docNo}`}${project ? ` (${project})` : ""}`, `Total: ${formatCurrency(total)}`, `Paid so far: ${formatCurrency(paidSoFar)}`, `Balance: ${formatCurrency(balance)}`]
      : []),
    "",
    b.name,
  ]);
  const subject = `${received ? "Payment receipt" : "Payment advice"} ${no} from ${b.name}`;

  return (
    <div className="animate-fade-up">
      <div className="print:hidden">
        <BackLink href="/finance/payments" label="All payments" />
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">{received ? "Receipt" : "Payment"} {no}</h1>
            <p className="mt-1 text-sm text-muted">
              {formatCurrency(amount)} {received ? "from" : "to"} {partyName} · {formatDate(pay.date)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={() => window.print()}>
              <Printer className="size-4" /> Print / PDF
            </Button>
            <a href={whatsAppHref(party?.phone, text)} target="_blank" rel="noreferrer" className={linkButton}>
              <MessageCircle className="size-4" /> WhatsApp
            </a>
            <a href={mailHref(party?.email, subject, text)} className={linkButton}>
              <Mail className="size-4" /> Email
            </a>
            {received && targetId && canRead(profile.role, "invoices") && (
              <Link href={`/finance/invoices/view?id=${targetId}`} className={linkButton}>
                <FileText className="size-4" /> Invoice
              </Link>
            )}
            {access.canEdit(pay) && (
              <Button onClick={() => setEditing(true)}>
                <Pencil className="size-4" /> Edit
              </Button>
            )}
          </div>
        </div>
        <p className="mb-4 text-xs text-subtle">WhatsApp and Email open with a summary filled in. To send the receipt itself, use Print / PDF, save it as a PDF and attach it.</p>
      </div>

      <Sheet className="max-w-3xl">
        <SheetHeader title={received ? "Payment Receipt" : "Payment Voucher"} meta={[["No.", no], ["Date", formatDate(pay.date)]]} />

        <section className="py-6">
          <p className="text-sm text-slate-600">{received ? "Received with thanks from" : "Paid to"}</p>
          <p className="mt-1 text-lg font-semibold text-slate-900">{partyName}</p>
          {Boolean(party?.address) && <p className="max-w-sm text-sm whitespace-pre-line text-slate-600">{String(party!.address)}</p>}
          {Boolean(party?.gstin) && <p className="text-sm text-slate-600">GSTIN: {String(party!.gstin)}</p>}

          <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-5">
            <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Amount {received ? "received" : "paid"}</p>
            <p className="mt-1 text-3xl font-semibold tracking-tight text-slate-900 tabular-nums">{formatCurrency(amount)}</p>
            <p className="mt-1 text-sm text-slate-600">{amountInWords(amount)}</p>
          </div>

          <dl className="mt-6 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
            {[
              ["Payment mode", pay.mode],
              ["Transaction / UTR no.", pay.reference],
              [received ? "Against invoice" : "Against bill", docNo],
              ["Project", project],
            ]
              .filter(([, v]) => Boolean(v))
              .map(([k, v]) => (
                <div key={String(k)}>
                  <dt className="text-slate-500">{String(k)}</dt>
                  <dd className="font-medium text-slate-900">{String(v)}</dd>
                </div>
              ))}
          </dl>
        </section>

        {showSummary && (
          <section className="grid gap-6 border-t border-slate-200 pt-6 sm:grid-cols-2">
            <div>
              {earlier.length > 0 && (
                <>
                  <SheetLabel>Earlier payments</SheetLabel>
                  <ul className="mt-2 space-y-1 text-sm text-slate-600">
                    {earlier.map((p) => (
                      <li key={p.id} className="flex justify-between gap-4">
                        <span>{formatDate(p.date)} · {receiptNo(p)}</span>
                        <span className="tabular-nums">{formatCurrency(p.amount)}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {Boolean(pay.notes) && (
                <div className={earlier.length ? "mt-4" : ""}>
                  <SheetLabel>Notes</SheetLabel>
                  <p className="mt-1 text-sm whitespace-pre-line text-slate-700">{String(pay.notes)}</p>
                </div>
              )}
            </div>
            <div className="flex sm:justify-end">
              <AmountRows
                rows={[
                  { label: received ? "Total value (incl. GST)" : "Bill total", value: total, hint: docNo ? `${received ? "Invoice" : "Bill"} ${docNo}` : undefined },
                  { label: "Paid till date", value: paidSoFar, hint: earlier.length ? `Including this ${formatCurrency(amount)}` : undefined },
                  { label: balance > 0 ? "Balance to pay" : "Balance", value: Math.max(balance, 0), strong: true },
                ]}
              />
            </div>
          </section>
        )}
        {!showSummary && Boolean(pay.notes) && (
          <section className="border-t border-slate-200 pt-6">
            <SheetLabel>Notes</SheetLabel>
            <p className="mt-1 text-sm whitespace-pre-line text-slate-700">{String(pay.notes)}</p>
          </section>
        )}

        <Signatory />
        <p className="mt-6 text-center text-xs text-slate-400">This is a computer-generated {received ? "receipt" : "voucher"}.</p>
      </Sheet>

      {editing && <RecordEditor module={paymentsModule} record={pay} onClose={() => setEditing(false)} />}
    </div>
  );
}
