"use client";

import { CheckCircle2, Download, Mail, Pencil, Printer, RotateCcw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useProfile } from "@/components/auth/AuthProvider";
import { BackLink, Loading, NotFound, WithRecordId } from "@/components/common/DetailShell";
import { Sheet, SheetHeader, SheetLabel } from "@/components/finance/DocSheet";
import { NoAccess } from "@/components/resource/ModulePage";
import { friendlyError } from "@/components/resource/RecordEditor";
import { useSettings } from "@/components/settings/SettingsProvider";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { inputClasses, labelClasses } from "@/components/ui/fieldStyles";
import { Modal } from "@/components/ui/Modal";
import { canRead, permissionFor } from "@/config/roles";
import { useRecord } from "@/hooks/useCollection";
import { firebaseAuth } from "@/lib/firebase";
import { formatCurrency, formatDate, todayISO } from "@/lib/format";
import { deletePayslip, monthLabel, rupeesInWords, savePayslip, syncPayrollExpense, type Payslip } from "@/lib/payroll";
import { payslipFileName, payslipPdf } from "@/lib/payslipPdf";
import { mailHref } from "@/lib/share";
import { PayslipEditor, STATUS } from "./Payroll";

export function PayslipPage() {
  const profile = useProfile();
  if (!canRead(profile.role, "payroll")) return <NoAccess />;
  return <WithRecordId>{(id) => <PayslipView id={id} />}</WithRecordId>;
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

function PayslipView({ id }: { id: string }) {
  const profile = useProfile();
  const settings = useSettings();
  const router = useRouter();
  const { data: slip, loading } = useRecord<Payslip>("payroll", id);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ text: string; tone: "ok" | "error" } | null>(null);
  const [mode, setMode] = useState<"edit" | "pay" | null>(null);
  const manages = permissionFor(profile.role, "payroll").update === "all";

  if (loading) return <Loading />;
  if (!slip) return <NotFound what="payslip" />;

  const b = settings.business;
  const earnings = slip.earnings.filter((e) => Number(e.amount));
  const deductions = slip.deductions.filter((d) => Number(d.amount));
  const subject = `Payslip for ${monthLabel(slip.month)}: ${b.name}`;
  const text = [
    `Dear ${slip.employeeName},`,
    "",
    `Please find attached your payslip for ${monthLabel(slip.month)}.`,
    `Net pay: ${formatCurrency(slip.net)}${slip.paidOn ? `, paid on ${formatDate(slip.paidOn)}` : ""}.`,
    "",
    "Regards,",
    b.name,
  ].join("\n");

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setNote(null);
    try {
      await fn();
    } catch (e) {
      setNote({ text: friendlyError(e), tone: "error" });
    } finally {
      setBusy(null);
    }
  };

  const doDownload = () => run("pdf", async () => download(await payslipPdf(slip, b), payslipFileName(slip)));

  const doEmail = () =>
    run("email", async () => {
      if (!slip.email) throw new Error("This employee has no email address. Add one on their employee page.");
      const pdf = await payslipPdf(slip, b);
      const token = await firebaseAuth().currentUser?.getIdToken();
      const res = await fetch("/api/payslip-email", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}` },
        body: JSON.stringify({ to: slip.email, subject, text, filename: payslipFileName(slip), pdfBase64: await toBase64(pdf) }),
      }).catch(() => null);
      if (res?.ok) {
        await savePayslip({ ...slip, emailedAt: Date.now(), emailedTo: slip.email }, profile);
        setNote({ text: `Payslip emailed to ${slip.email}.`, tone: "ok" });
        return;
      }
      const reason = res ? ((await res.json().catch(() => ({}))) as { error?: string }).error : null;
      if (!res || res.status === 503 || res.status === 404) {
        // No mail server set up: hand over the PDF and an email draft to attach it to.
        download(pdf, payslipFileName(slip));
        window.location.href = mailHref(slip.email, subject, `${text}\n\n(Payslip PDF attached.)`);
        setNote({ text: "Automatic email isn't set up yet, so the PDF was downloaded and an email draft opened. Attach the PDF and send.", tone: "ok" });
        return;
      }
      throw new Error(reason || "The payslip couldn't be emailed.");
    });

  const markUnpaid = () =>
    run("unpaid", async () => {
      if (!window.confirm("Mark this payslip as not paid? It will be taken out of this month's salary expense.")) return;
      await savePayslip({ ...slip, status: "draft", paidOn: null, paymentMode: null, reference: null }, profile);
      await syncPayrollExpense(slip.month, profile);
    });

  const doDelete = () =>
    run("delete", async () => {
      if (!window.confirm(`Delete ${slip.employeeName}'s payslip for ${monthLabel(slip.month)}? This can't be undone.`)) return;
      await deletePayslip(slip, profile);
      router.push("/hr/payroll");
    });

  return (
    <div className="animate-fade-up">
      <div className="print:hidden">
        <BackLink href="/hr/payroll" label={manages ? "Payroll" : "My payslips"} />
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Badge tone={STATUS[slip.status].tone}>{STATUS[slip.status].label}</Badge>
          {slip.emailedAt ? <span className="text-xs text-muted">Emailed {formatDate(slip.emailedAt)} to {slip.emailedTo}</span> : null}
          <div className="ml-auto flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => void doDownload()} disabled={busy !== null}>
              <Download className="size-4" /> {busy === "pdf" ? "Making PDF…" : "Download PDF"}
            </Button>
            <Button variant="secondary" onClick={() => window.print()}>
              <Printer className="size-4" /> Print
            </Button>
            {manages && (
              <>
                <Button variant="secondary" onClick={() => void doEmail()} disabled={busy !== null}>
                  <Mail className="size-4" /> {busy === "email" ? "Sending…" : "Email to employee"}
                </Button>
                <Button variant="secondary" onClick={() => setMode("edit")}>
                  <Pencil className="size-4" /> Edit
                </Button>
                {slip.status === "paid" ? (
                  <Button variant="ghost" onClick={() => void markUnpaid()} disabled={busy !== null}>
                    <RotateCcw className="size-4" /> Mark not paid
                  </Button>
                ) : (
                  <Button onClick={() => setMode("pay")}>
                    <CheckCircle2 className="size-4" /> Mark as paid
                  </Button>
                )}
                <Button variant="ghost" onClick={() => void doDelete()} disabled={busy !== null} aria-label="Delete payslip" title="Delete" className="hover:text-red-600">
                  <Trash2 className="size-4" />
                </Button>
              </>
            )}
          </div>
        </div>
        {note && (
          <p className={`mb-4 rounded-lg px-3 py-2 text-sm ${note.tone === "error" ? "bg-red-500/10 text-red-700 dark:text-red-300" : "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"}`}>{note.text}</p>
        )}
      </div>

      <Sheet className="max-w-3xl">
        <SheetHeader
          title="Payslip"
          meta={[
            ["Month", monthLabel(slip.month)],
            ["Paid on", slip.paidOn ? formatDate(slip.paidOn) : "Not paid yet"],
          ]}
        />
        <section className="grid grid-cols-2 gap-x-6 gap-y-2 py-5 text-sm sm:grid-cols-4">
          {[
            ["Employee", slip.employeeName],
            ["Employee ID", slip.employeeCode || "—"],
            ["Designation", slip.designation || "—"],
            ["Department", slip.department || "—"],
            ["Days in month", String(slip.daysInMonth)],
            ["Paid days", `${slip.paidDays}${slip.lopDays ? ` (${slip.lopDays} unpaid)` : ""}`],
            ["Payment", [slip.paymentMode, slip.reference].filter(Boolean).join(", ") || "—"],
          ].map(([k, v]) => (
            <div key={k}>
              <SheetLabel>{k}</SheetLabel>
              <p className="mt-0.5 font-medium text-slate-900">{v}</p>
            </div>
          ))}
        </section>
        <section className="grid gap-4 border-t border-slate-200 pt-5 sm:grid-cols-2">
          <PayTable
            title="Earnings"
            rows={[
              ...earnings,
              ...(slip.commission?.amount ? [{ name: `Sales commission (on ${formatCurrency(slip.commission.sales)} sales)`, amount: slip.commission.amount }] : []),
            ]}
            totalLabel="Gross earnings"
            total={slip.gross}
          />
          <PayTable title="Deductions" rows={deductions} totalLabel="Total deductions" total={slip.totalDeductions} />
        </section>
        <section className="mt-5 flex flex-wrap items-end justify-between gap-2 rounded-xl bg-blue-50 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">Net pay</p>
            <p className="text-xs text-slate-600">{rupeesInWords(slip.net)}</p>
          </div>
          <p className="text-xl font-semibold tabular-nums text-slate-900">{formatCurrency(slip.net)}</p>
        </section>
        {slip.notes && <p className="mt-4 text-sm text-slate-600">Note: {slip.notes}</p>}
        <p className="mt-8 text-center text-xs text-slate-400">This is a computer-generated payslip and does not need a signature.</p>
      </Sheet>

      {mode === "edit" && <PayslipEditor slip={slip} onClose={() => setMode(null)} onSaved={() => setMode(null)} />}
      {mode === "pay" && <MarkPaid slip={slip} onClose={() => setMode(null)} />}
    </div>
  );
}

function PayTable({ title, rows, totalLabel, total }: { title: string; rows: { name: string; amount: number }[]; totalLabel: string; total: number }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="bg-slate-50 text-left text-xs tracking-wide text-slate-500 uppercase">
          <th className="px-3 py-2 font-semibold">{title}</th>
          <th className="px-3 py-2 text-right font-semibold">Amount</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {rows.length ? (
          rows.map((r, i) => (
            <tr key={i}>
              <td className="px-3 py-1.5 text-slate-700">{r.name}</td>
              <td className="px-3 py-1.5 text-right tabular-nums text-slate-900">{formatCurrency(r.amount)}</td>
            </tr>
          ))
        ) : (
          <tr>
            <td className="px-3 py-1.5 text-slate-400" colSpan={2}>None</td>
          </tr>
        )}
      </tbody>
      <tfoot>
        <tr className="border-t border-slate-200 font-semibold text-slate-900">
          <td className="px-3 py-2">{totalLabel}</td>
          <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(total)}</td>
        </tr>
      </tfoot>
    </table>
  );
}

function MarkPaid({ slip, onClose }: { slip: Payslip; onClose: () => void }) {
  const profile = useProfile();
  const settings = useSettings();
  const [paidOn, setPaidOn] = useState(todayISO());
  const [paymentMode, setPaymentMode] = useState("Bank transfer");
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await savePayslip({ ...slip, status: "paid", paidOn, paymentMode, reference: reference || null }, profile);
      await syncPayrollExpense(slip.month, profile);
      onClose();
    } catch (e) {
      setError(friendlyError(e));
      setSaving(false);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title="Mark salary as paid"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => void save()} disabled={saving || !paidOn}>{saving ? "Saving…" : `Paid ${formatCurrency(slip.net)}`}</Button>
        </>
      }
    >
      {error && <p className="mb-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">{error}</p>}
      <div className="space-y-4">
        <p className="text-sm text-muted">
          {slip.employeeName}&apos;s salary for {monthLabel(slip.month)}. Once paid, it&apos;s added to this month&apos;s &quot;Salaries&quot; expense, so reports and the dashboard include it, and {slip.employeeName.split(" ")[0]} can see the payslip in the app.
        </p>
        <div>
          <label htmlFor="mp-date" className={labelClasses}>Paid on</label>
          <input id="mp-date" type="date" className={inputClasses} value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
        </div>
        <div>
          <label htmlFor="mp-mode" className={labelClasses}>Payment mode</label>
          <select id="mp-mode" className={inputClasses} value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)}>
            {settings.lists.paymentModes.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="mp-ref" className={labelClasses}>Reference (optional)</label>
          <input id="mp-ref" className={inputClasses} placeholder="UTR / cheque no." value={reference} onChange={(e) => setReference(e.target.value)} />
        </div>
      </div>
    </Modal>
  );
}
