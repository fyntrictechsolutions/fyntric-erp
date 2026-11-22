"use client";

import { collection, query, where } from "firebase/firestore";
import { ChevronRight, FileText, Plus, Wallet, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useProfile } from "@/components/auth/AuthProvider";
import { NoAccess } from "@/components/resource/ModulePage";
import { friendlyError } from "@/components/resource/RecordEditor";
import { useSettings } from "@/components/settings/SettingsProvider";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { inputClasses, labelClasses } from "@/components/ui/fieldStyles";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import { canRead, permissionFor } from "@/config/roles";
import { useLiveQuery, useModuleRecords } from "@/hooks/useCollection";
import { cn } from "@/lib/cn";
import { db } from "@/lib/firebase";
import { formatCurrency } from "@/lib/format";
import {
  commissionFor,
  currentMonth,
  draftPayslip,
  monthLabel,
  payslipId,
  prorate,
  round2,
  savePayslip,
  suggestDeductions,
  syncPayrollExpense,
  totalsOf,
  type PayLine,
  type Payslip,
  type PayslipData,
  type SavedStamp,
} from "@/lib/payroll";
import type { BaseRecord } from "@/types";

export function PayrollPage() {
  const profile = useProfile();
  if (!canRead(profile.role, "payroll")) return <NoAccess />;
  return permissionFor(profile.role, "payroll").read === "all" ? <PayrollRun /> : <MyPayslips />;
}

export const STATUS = { draft: { label: "Draft", tone: "amber" as const }, paid: { label: "Paid", tone: "green" as const } };

/** HR's view: every employee for the chosen month, with their payslip's state. */
function PayrollRun() {
  const profile = useProfile();
  const settings = useSettings();
  const router = useRouter();
  const [month, setMonth] = useState(currentMonth());
  const [editing, setEditing] = useState<PayslipData | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const employees = useModuleRecords("employees", profile);
  const slips = useLiveQuery<Payslip>(() => query(collection(db(), "payroll"), where("month", "==", month)), `payroll:${month}`);

  const rows = useMemo(() => {
    const byEmp = new Map(slips.data.map((s) => [s.employeeId, s]));
    const people = employees.data.filter((e) => e.status !== "exited" || byEmp.has(e.id));
    return people
      .map((e) => ({ employee: e, slip: byEmp.get(e.id) ?? null }))
      .sort((a, b) => String(a.employee.fullName ?? "").localeCompare(String(b.employee.fullName ?? "")));
  }, [employees.data, slips.data]);

  const paid = slips.data.filter((s) => s.status === "paid");
  const total = (k: "gross" | "totalDeductions" | "net") => round2(slips.data.reduce((t, s) => t + (Number(s[k]) || 0), 0));

  const prepare = async (employee: BaseRecord) => {
    setBusy(employee.id);
    setMessage(null);
    try {
      const draft = await draftPayslip(employee, month, settings);
      if (typeof draft === "string") setMessage(draft);
      else setEditing(draft);
    } catch (e) {
      setMessage(friendlyError(e));
    } finally {
      setBusy(null);
    }
  };

  const prepareAll = async () => {
    setBusy("all");
    setMessage(null);
    const skipped: string[] = [];
    let made = 0;
    try {
      for (const { employee, slip } of rows) {
        if (slip || employee.status === "exited") continue;
        const draft = await draftPayslip(employee, month, settings);
        if (typeof draft === "string") skipped.push(String(employee.fullName ?? "Unnamed"));
        else {
          await savePayslip(draft, profile);
          made++;
        }
      }
      setMessage(
        `${made} draft payslip${made === 1 ? "" : "s"} prepared.` +
          (skipped.length ? ` No salary structure yet for ${skipped.join(", ")}: add one on their employee page.` : ""),
      );
    } catch (e) {
      setMessage(friendlyError(e));
    } finally {
      setBusy(null);
    }
  };

  const pending = rows.filter((r) => !r.slip && r.employee.status !== "exited").length;

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Payroll"
        description="Monthly salary payments and payslips. Salaries come from each employee's salary structure; paid payslips are added to expenses automatically."
        actions={
          <>
            <label className="sr-only" htmlFor="pay-month">Month</label>
            <input id="pay-month" type="month" className={cn(inputClasses, "!w-44")} value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
            {pending > 0 && (
              <Button onClick={() => void prepareAll()} disabled={busy !== null}>
                <Plus className="size-4" /> {busy === "all" ? "Preparing…" : `Prepare all (${pending})`}
              </Button>
            )}
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Payslips paid" value={`${paid.length} of ${rows.filter((r) => r.employee.status !== "exited").length}`} />
        <Stat label="Gross pay" value={formatCurrency(total("gross"))} />
        <Stat label="Deductions" value={formatCurrency(total("totalDeductions"))} />
        <Stat label="Net pay" value={formatCurrency(total("net"))} />
      </div>

      {message && (
        <p className="mb-4 flex items-start justify-between gap-3 rounded-lg bg-accent-soft px-3 py-2 text-sm text-foreground">
          {message}
          <button type="button" onClick={() => setMessage(null)} aria-label="Dismiss" className="text-muted hover:text-foreground">
            <X className="size-4" />
          </button>
        </p>
      )}

      <Card className="overflow-hidden">
        <div className="border-b border-line px-5 py-4">
          <h2 className="font-display text-base font-semibold text-foreground">{monthLabel(month)}</h2>
        </div>
        {employees.loading || slips.loading ? (
          <p className="px-5 py-10 text-center text-sm text-muted">Loading…</p>
        ) : rows.length === 0 ? (
          <EmptyState icon={Wallet} title="No employees yet" description="Employees appear here once they're added under HR → Employees." />
        ) : (
          <ul className="divide-y divide-line">
            {rows.map(({ employee, slip }) => (
              <li key={employee.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground">{String(employee.fullName ?? "Unnamed")}</p>
                  <p className="truncate text-xs text-muted">{[employee.designation, employee.department].filter(Boolean).join(" · ") || "—"}</p>
                </div>
                {slip ? (
                  <>
                    <div className="text-right text-sm">
                      <p className="font-medium tabular-nums text-foreground">{formatCurrency(slip.net)}</p>
                      <p className="text-xs text-muted">
                        net{slip.commission?.amount ? ` · incl. ${formatCurrency(slip.commission.amount)} commission` : ""}
                      </p>
                    </div>
                    <Badge tone={STATUS[slip.status].tone}>{STATUS[slip.status].label}</Badge>
                    <Link href={`/hr/payroll/view?id=${slip.id}`} className="rounded-lg p-1.5 text-subtle hover:bg-tint-strong hover:text-foreground" aria-label={`Open ${employee.fullName}'s payslip`}>
                      <ChevronRight className="size-4" />
                    </Link>
                  </>
                ) : employee.status === "exited" ? (
                  <Badge>Exited</Badge>
                ) : (
                  <Button size="sm" variant="secondary" onClick={() => void prepare(employee)} disabled={busy !== null}>
                    <FileText className="size-4" /> {busy === employee.id ? "Preparing…" : "Prepare payslip"}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {editing && (
        <PayslipEditor
          slip={editing}
          onClose={() => setEditing(null)}
          onSaved={(id) => {
            setEditing(null);
            router.push(`/hr/payroll/view?id=${id}`);
          }}
        />
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-1 font-display text-xl font-semibold tabular-nums text-foreground">{value}</p>
    </Card>
  );
}

/** Staff: their own paid payslips. */
function MyPayslips() {
  const profile = useProfile();
  const slips = useLiveQuery<Payslip>(
    () => query(collection(db(), "payroll"), where("accountId", "==", profile.id), where("status", "==", "paid")),
    `payroll:mine:${profile.id}`,
  );
  const list = [...slips.data].sort((a, b) => b.month.localeCompare(a.month));
  return (
    <div className="animate-fade-up">
      <PageHeader title="My payslips" description="Your salary payments, month by month. Open one to download it as a PDF." />
      <Card className="overflow-hidden">
        {slips.loading ? (
          <p className="px-5 py-10 text-center text-sm text-muted">Loading…</p>
        ) : list.length === 0 ? (
          <EmptyState icon={Wallet} title="No payslips yet" description="They appear here once HR marks your salary as paid." />
        ) : (
          <ul className="divide-y divide-line">
            {list.map((s) => (
              <li key={s.id}>
                <Link href={`/hr/payroll/view?id=${s.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-tint">
                  <span className="font-medium text-foreground">{monthLabel(s.month)}</span>
                  <span className="flex items-center gap-3 text-sm tabular-nums text-foreground">
                    {formatCurrency(s.net)} <ChevronRight className="size-4 text-subtle" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

/** Lines of a payslip (earnings or deductions), each with a name and amount, editable. */
function LinesEditor({ title, lines, onChange, addLabel, suggestions }: { title: string; lines: PayLine[]; onChange: (l: PayLine[]) => void; addLabel: string; suggestions: string[] }) {
  const listId = `${title.toLowerCase()}-names`;
  return (
    <fieldset className="min-w-0">
      <legend className={labelClasses}>{title}</legend>
      <datalist id={listId}>
        {suggestions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      <div className="space-y-2">
        {lines.map((l, i) => (
          <div key={i} className="flex gap-2">
            <input
              aria-label={`${title} ${i + 1} name`}
              list={listId}
              className={cn(inputClasses, "!w-auto min-w-0 flex-1")}
              value={l.name}
              placeholder="Name"
              onChange={(e) => onChange(lines.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
            />
            <input
              aria-label={`${title} ${i + 1} amount`}
              type="number"
              min={0}
              className={cn(inputClasses, "!w-28 shrink-0 text-right tabular-nums sm:!w-32")}
              value={l.amount}
              onChange={(e) => onChange(lines.map((x, j) => (j === i ? { ...x, amount: Number(e.target.value) || 0 } : x)))}
            />
            <button type="button" onClick={() => onChange(lines.filter((_, j) => j !== i))} className="rounded-lg px-2 text-muted hover:bg-tint-strong hover:text-red-600" aria-label={`Remove ${l.name || "line"}`}>
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
      <Button size="sm" variant="ghost" className="mt-1" onClick={() => onChange([...lines, { name: "", amount: 0 }])}>
        <Plus className="size-4" /> {addLabel}
      </Button>
    </fieldset>
  );
}

/** Prepare or correct a payslip: unpaid days, earnings, commission and deductions, with live totals. */
export function PayslipEditor({ slip: initial, onClose, onSaved }: { slip: PayslipData & SavedStamp; onClose: () => void; onSaved: (id: string) => void }) {
  const profile = useProfile();
  const settings = useSettings();
  const [slip, setSlip] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Salary structure amounts for a full month, to cut again when unpaid days change.
  const [base] = useState(() => new Map((initial.structure ?? []).map((e) => [e.name, e.amount])));
  const totals = totalsOf(slip.earnings, slip.deductions, slip.commission);
  const set = (patch: Partial<PayslipData>) => setSlip((s) => ({ ...s, ...patch }));

  const setLop = (lop: number) => {
    const lopDays = Math.max(0, Math.min(slip.daysInMonth, lop));
    const paidDays = slip.daysInMonth - lopDays;
    const cut = prorate(
      slip.earnings.filter((e) => base.has(e.name)).map((e) => ({ ...e, amount: base.get(e.name)! })),
      paidDays,
      slip.daysInMonth,
    );
    set({ lopDays, paidDays, earnings: slip.earnings.map((e) => cut.find((c) => c.name === e.name) ?? e) });
  };

  const setSales = (sales: number) =>
    set({
      commission: {
        sales,
        invoices: slip.commission?.invoices ?? 0,
        mode: settings.app.commissionMode,
        amount: commissionFor(sales, settings.app.commissionSlabs, settings.app.commissionMode),
      },
    });

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const data = {
        ...slip,
        earnings: slip.earnings.filter((e) => e.name.trim()),
        deductions: slip.deductions.filter((d) => d.name.trim()),
      };
      const id = await savePayslip({ ...data, ...totalsOf(data.earnings, data.deductions, data.commission) }, profile);
      if (data.status === "paid") await syncPayrollExpense(data.month, profile);
      onSaved(id);
    } catch (e) {
      setError(friendlyError(e));
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={`Payslip: ${slip.employeeName}, ${monthLabel(slip.month)}`}
      footer={
        <>
          <span className="mr-auto text-sm text-muted">
            Net pay <span className="font-semibold tabular-nums text-foreground">{formatCurrency(totals.net)}</span>
          </span>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => void save()} disabled={saving}>{saving ? "Saving…" : initial.id ? "Save changes" : "Save draft"}</Button>
        </>
      }
    >
      {error && <p className="mb-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">{error}</p>}
      <div className="space-y-6">
        <div className="grid grid-cols-3 gap-3">
          <div>
            <p className={labelClasses}>Days in month</p>
            <p className="py-2 text-sm tabular-nums text-foreground">{slip.daysInMonth}</p>
          </div>
          <div>
            <label htmlFor="ps-lop" className={labelClasses}>Unpaid days (LOP)</label>
            <input id="ps-lop" type="number" min={0} max={slip.daysInMonth} step={0.5} className={inputClasses} value={slip.lopDays} onChange={(e) => setLop(Number(e.target.value) || 0)} />
          </div>
          <div>
            <p className={labelClasses}>Paid days</p>
            <p className="py-2 text-sm tabular-nums text-foreground">{slip.paidDays}</p>
          </div>
        </div>
        <p className="-mt-3 text-xs text-subtle">Salary structure: {formatCurrency(slip.structureTotal)} a month. Unpaid days cut each salary component in proportion.</p>

        <LinesEditor title="Earnings" lines={slip.earnings} onChange={(earnings) => set({ earnings })} addLabel="Add earning (bonus, overtime…)" suggestions={[...settings.lists.salaryComponents, "Bonus", "Overtime", "Incentive", "Arrears", "Reimbursement"]} />

        <div className="rounded-xl border border-line p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-foreground">Sales commission</p>
            {slip.commission ? (
              <button type="button" className="text-xs text-muted hover:text-red-600" onClick={() => set({ commission: null })}>Remove</button>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setSales(0)}>
                <Plus className="size-4" /> Add commission
              </Button>
            )}
          </div>
          {slip.commission ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="ps-sales" className={labelClasses}>Sales this month (before GST)</label>
                <input id="ps-sales" type="number" min={0} className={inputClasses} value={slip.commission.sales} onChange={(e) => setSales(Number(e.target.value) || 0)} />
                <p className="mt-1 text-xs text-subtle">
                  {slip.commission.invoices ? `From ${slip.commission.invoices} invoice${slip.commission.invoices === 1 ? "" : "s"} they raised this month. ` : ""}
                  Slabs are set in Settings → Defaults.
                </p>
              </div>
              <div>
                <label htmlFor="ps-comm" className={labelClasses}>Commission</label>
                <input id="ps-comm" type="number" min={0} className={inputClasses} value={slip.commission.amount} onChange={(e) => set({ commission: { ...slip.commission!, amount: Number(e.target.value) || 0 } })} />
                <p className="mt-1 text-xs text-subtle">{slip.commission.mode === "flat" ? "Whole amount at the slab reached." : "Each part of sales at its slab's rate."}</p>
              </div>
            </div>
          ) : (
            <p className="mt-1 text-xs text-muted">No invoices raised by this person this month.</p>
          )}
        </div>

        <div>
          <LinesEditor title="Deductions" lines={slip.deductions} onChange={(deductions) => set({ deductions })} addLabel="Add deduction (TDS, advance…)" suggestions={["Provident fund (PF)", "ESI", "Professional tax", "TDS (income tax)", "Salary advance", "Other"]} />
          <button type="button" className="mt-1 text-xs text-accent hover:underline" onClick={() => set({ deductions: suggestDeductions(slip.earnings, totals.gross, settings.app) })}>
            Recalculate PF, ESI and professional tax from Settings
          </button>
        </div>

        <div>
          <label htmlFor="ps-notes" className={labelClasses}>Note on the payslip (optional)</label>
          <textarea id="ps-notes" rows={2} className={inputClasses} value={slip.notes ?? ""} onChange={(e) => set({ notes: e.target.value || null })} />
        </div>

        <dl className="space-y-1 rounded-xl bg-tint p-4 text-sm">
          <div className="flex justify-between"><dt className="text-muted">Gross earnings</dt><dd className="tabular-nums">{formatCurrency(totals.gross)}</dd></div>
          <div className="flex justify-between"><dt className="text-muted">Deductions</dt><dd className="tabular-nums">−{formatCurrency(totals.totalDeductions)}</dd></div>
          <div className="flex justify-between border-t border-line pt-1.5 font-semibold text-foreground"><dt>Net pay</dt><dd className="tabular-nums">{formatCurrency(totals.net)}</dd></div>
        </dl>
      </div>
    </Modal>
  );
}

export { payslipId };
