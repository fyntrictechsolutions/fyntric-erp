"use client";

import { Mail, MessageCircle, Pencil, Printer } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import logoColor from "@/assets/brand/logo-color.png";
import { useProfile } from "@/components/auth/AuthProvider";
import { BackLink, Loading, NotFound, WithRecordId } from "@/components/common/DetailShell";
import { NoAccess } from "@/components/resource/ModulePage";
import { friendlyError, RecordEditor } from "@/components/resource/RecordEditor";
import { useSettings } from "@/components/settings/SettingsProvider";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { inputClasses } from "@/components/ui/fieldStyles";
import type { LineItem } from "@/config/modules";
import { ESTIMATE_STATUS, estimatesModule } from "@/config/modules/sales";
import { canRead } from "@/config/roles";
import { useRecord } from "@/hooks/useCollection";
import { moduleAccess } from "@/lib/access";
import { cn } from "@/lib/cn";
import { formatCurrency, formatDate } from "@/lib/format";
import { updateRecord } from "@/lib/records";
import type { BaseRecord } from "@/types";

export function EstimateDetailPage() {
  const profile = useProfile();
  if (!canRead(profile.role, "estimates")) return <NoAccess />;
  return <WithRecordId>{(id) => <EstimateDetail id={id} />}</WithRecordId>;
}

function phoneForWhatsApp(phone: unknown) {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.length === 10 ? `91${digits}` : digits;
}

function summaryText(est: BaseRecord, lead: BaseRecord | null, businessName: string) {
  const items = (est.items as LineItem[] | undefined) ?? [];
  const lines = [
    `Hello ${lead?.name ?? est.leadIdLabel ?? ""},`,
    "",
    `Here is our estimate ${est.estimateNumber ?? ""}${est.title ? ` for ${est.title}` : ""}:`,
    ...items.map((i) => `• ${i.name}${i.qty > 1 ? ` × ${i.qty}` : ""}: ${formatCurrency(i.amount)}`),
    "",
    `Total: ${formatCurrency(est.total)} (including GST)`,
    est.validUntil ? `Valid until: ${formatDate(est.validUntil)}` : "",
    "",
    "Please let us know if you'd like any changes.",
    businessName,
  ];
  return lines.filter((l, i, arr) => !(l === "" && arr[i - 1] === "")).join("\n");
}

function EstimateDetail({ id }: { id: string }) {
  const profile = useProfile();
  const settings = useSettings();
  const { data: est, loading } = useRecord("estimates", id);
  const leadId = (est?.leadId as string | undefined) ?? null;
  // Some roles (e.g. investors) can read estimates but not leads; the lead's name is saved on the estimate anyway.
  const { data: lead } = useRecord("leads", canRead(profile.role, "leads") ? leadId : null);
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (loading) return <Loading />;
  if (!est) return <NotFound what="estimate" />;

  const access = moduleAccess(estimatesModule, profile);
  const canEdit = access.canEdit(est);
  const status = ESTIMATE_STATUS.find((o) => o.value === est.status);
  const b = settings.business;
  const text = summaryText(est, lead, b.name);

  const setStatus = async (value: string) => {
    setMessage(null);
    try {
      await updateRecord("estimates", est.id, { status: value, ...(value === "sent" && !est.sentAt ? { sentAt: Date.now() } : {}) });
    } catch (e) {
      setMessage(friendlyError(e));
    }
  };

  // Sharing counts as sending: move a draft to "sent".
  const markSentIfDraft = () => {
    if (canEdit && (est.status === "draft" || est.status === "revision")) void setStatus("sent");
  };

  const wa = phoneForWhatsApp(lead?.phone);
  const waHref = `https://wa.me/${wa}?text=${encodeURIComponent(text)}`;
  const mailHref = `mailto:${(lead?.email as string) ?? ""}?subject=${encodeURIComponent(`Estimate ${est.estimateNumber ?? ""} from ${b.name}`)}&body=${encodeURIComponent(text)}`;

  return (
    <div className="animate-fade-up">
      <div className="print:hidden">
        <BackLink href="/crm/estimates" label="All estimates" />
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">{String(est.estimateNumber ?? "Estimate")}</h1>
              {status && <Badge tone={status.tone}>{status.label}</Badge>}
            </div>
            <p className="mt-1 text-sm text-muted">
              For {String(est.leadIdLabel ?? "—")}
              {est.sentAt ? ` · sent ${formatDate(est.sentAt)}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canEdit && (
              <select
                value={String(est.status ?? "draft")}
                onChange={(e) => setStatus(e.target.value)}
                className={cn(inputClasses.replace("w-full ", ""), "h-10 w-auto")}
                aria-label="Status"
              >
                {ESTIMATE_STATUS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            )}
            <Button variant="secondary" onClick={() => window.print()}>
              <Printer className="size-4" /> Print / PDF
            </Button>
            <a href={waHref} target="_blank" rel="noreferrer" onClick={markSentIfDraft} className={cn("inline-flex h-10 items-center gap-2 rounded-lg border border-line-strong bg-surface px-4 text-sm font-medium text-foreground hover:bg-tint-strong")}>
              <MessageCircle className="size-4" /> WhatsApp
            </a>
            <a href={mailHref} onClick={markSentIfDraft} className="inline-flex h-10 items-center gap-2 rounded-lg border border-line-strong bg-surface px-4 text-sm font-medium text-foreground hover:bg-tint-strong">
              <Mail className="size-4" /> Email
            </a>
            {canEdit && (
              <Button onClick={() => setEditing(true)}>
                <Pencil className="size-4" /> Edit
              </Button>
            )}
          </div>
        </div>
        {message && <p className="mb-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">{message}</p>}
        <p className="mb-4 text-xs text-subtle">
          WhatsApp and Email open with a summary filled in. To send the full estimate, use Print / PDF, save it as a PDF and attach it.
        </p>
      </div>

      <EstimateSheet est={est} lead={lead} />

      {editing && <RecordEditor module={estimatesModule} record={est} onClose={() => setEditing(false)} />}
    </div>
  );
}

/** The estimate as a paper document: always light, so it prints the same in either theme. */
function EstimateSheet({ est, lead }: { est: BaseRecord; lead: BaseRecord | null }) {
  const settings = useSettings();
  const b = settings.business;
  const items = (est.items as LineItem[] | undefined) ?? [];
  const discount = Number(est.discount) || 0;
  const rows: [string, unknown][] = [
    ["Subtotal", est.subtotal],
    ...(discount ? ([["Discount", -discount]] as [string, unknown][]) : []),
    ["GST", est.taxTotal],
  ];

  return (
    <article className="print-sheet mx-auto max-w-4xl rounded-2xl border border-slate-200 bg-white p-6 text-slate-800 shadow-card sm:p-10">
      <header className="flex flex-col gap-6 border-b border-slate-200 pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Image src={logoColor} alt={b.name} className="h-10 w-auto" sizes="200px" />
          <p className="mt-3 font-semibold text-slate-900">{b.name}</p>
          <p className="mt-1 max-w-xs text-sm whitespace-pre-line text-slate-600">{b.address}</p>
          <p className="mt-1 text-sm text-slate-600">{[b.phone, b.email].filter(Boolean).join(" · ")}</p>
          {b.gstin && <p className="mt-1 text-sm text-slate-600">GSTIN: {b.gstin}</p>}
        </div>
        <div className="sm:text-right">
          <p className="text-2xl font-semibold tracking-tight text-slate-900">Estimate</p>
          <dl className="mt-2 space-y-0.5 text-sm">
            <div><dt className="inline text-slate-500">No. </dt><dd className="inline font-medium text-slate-900">{String(est.estimateNumber ?? "—")}</dd></div>
            <div><dt className="inline text-slate-500">Date </dt><dd className="inline">{formatDate(est.issueDate)}</dd></div>
            {Boolean(est.validUntil) && <div><dt className="inline text-slate-500">Valid until </dt><dd className="inline">{formatDate(est.validUntil)}</dd></div>}
          </dl>
        </div>
      </header>

      <section className="grid gap-6 py-6 sm:grid-cols-2">
        <div>
          <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Prepared for</p>
          <p className="mt-1 font-medium text-slate-900">{String(lead?.name ?? est.leadIdLabel ?? "—")}</p>
          {Boolean(lead?.company) && <p className="text-sm text-slate-600">{String(lead!.company)}</p>}
          {Boolean(lead?.phone) && <p className="text-sm text-slate-600">{String(lead!.phone)}</p>}
          {Boolean(lead?.email) && <p className="text-sm text-slate-600">{String(lead!.email)}</p>}
        </div>
        {Boolean(est.title) && (
          <div className="sm:text-right">
            <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Project</p>
            <p className="mt-1 font-medium text-slate-900">{String(est.title)}</p>
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
            {items.map((it, i) => (
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

      <div className="mt-4 flex justify-end">
        <dl className="w-full max-w-xs space-y-1.5 text-sm">
          {rows.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4">
              <dt className="text-slate-500">{label}</dt>
              <dd className="tabular-nums">{formatCurrency(value)}</dd>
            </div>
          ))}
          <div className="flex justify-between gap-4 border-t border-slate-200 pt-2 text-base font-semibold text-slate-900">
            <dt>Total</dt>
            <dd className="tabular-nums">{formatCurrency(est.total)}</dd>
          </div>
        </dl>
      </div>

      {(Boolean(est.notes) || Boolean(est.terms)) && (
        <section className="mt-8 grid gap-6 border-t border-slate-200 pt-6 sm:grid-cols-2">
          {Boolean(est.notes) && (
            <div>
              <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Notes</p>
              <p className="mt-1 text-sm whitespace-pre-line text-slate-700">{String(est.notes)}</p>
            </div>
          )}
          {Boolean(est.terms) && (
            <div>
              <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Terms</p>
              <p className="mt-1 text-sm whitespace-pre-line text-slate-700">{String(est.terms)}</p>
            </div>
          )}
        </section>
      )}

      {(b.upiId || b.accountNumber) && (
        <section className="mt-6 border-t border-slate-200 pt-6 text-sm text-slate-600">
          <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Payment details</p>
          {b.upiId && <p className="mt-1">UPI: {b.upiId}</p>}
          {b.accountNumber && (
            <p className="mt-1">
              {[b.accountName, b.bankName, `A/c ${b.accountNumber}`, b.ifsc && `IFSC ${b.ifsc}`].filter(Boolean).join(" · ")}
            </p>
          )}
        </section>
      )}
    </article>
  );
}
