"use client";

import { doc } from "firebase/firestore";
import { loggedSet } from "@/lib/audit";
import { History, Plus, TrendingUp, Wallet, X } from "lucide-react";
import { useState } from "react";
import { useProfile } from "@/components/auth/AuthProvider";
import { Loading } from "@/components/common/DetailShell";
import { friendlyError } from "@/components/resource/RecordEditor";
import { useSettings } from "@/components/settings/SettingsProvider";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { inputClasses, labelClasses } from "@/components/ui/fieldStyles";
import { Modal } from "@/components/ui/Modal";
import { permissionFor } from "@/config/roles";
import { useRecord } from "@/hooks/useCollection";
import { addDays } from "@/config/modules/options";
import { cn } from "@/lib/cn";
import { db } from "@/lib/firebase";
import { formatCurrency, formatDate, todayISO } from "@/lib/format";
import type { BaseRecord } from "@/types";

interface Component {
  name: string;
  amount: number;
}

/** One salary structure: monthly components that add up to the total. */
export interface SalaryStructure {
  components: Component[];
  total: number;
  effectiveFrom: string;
  notes?: string;
  savedBy: string;
  savedAt: number;
  /** Set when a revision replaced it. */
  endedOn?: string;
}

/** Stored at salaries/{employeeId}: the current structure and every earlier one. */
interface SalaryDoc extends BaseRecord {
  current?: SalaryStructure;
  history?: SalaryStructure[];
}

const sumOf = (list: Component[]) => Math.round(list.reduce((t, c) => t + (Number(c.amount) || 0), 0) * 100) / 100;

export function SalaryTab({ employee }: { employee: BaseRecord }) {
  const profile = useProfile();
  const { data, loading } = useRecord<SalaryDoc>("salaries", employee.id);
  const [mode, setMode] = useState<"set" | "revise" | null>(null);
  const canEdit = permissionFor(profile.role, "salaries").update === "all";

  if (loading) return <Loading />;
  const current = data?.current;
  const history = [...(data?.history ?? [])].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));

  return (
    <div className="space-y-6">
      <Card className="p-5 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold text-foreground">Current salary structure</h2>
            {current && <p className="text-sm text-muted">In effect from {formatDate(current.effectiveFrom)}</p>}
          </div>
          {canEdit && current && (
            <Button onClick={() => setMode("revise")}>
              <TrendingUp className="size-4" /> Revise salary
            </Button>
          )}
        </div>
        {current ? (
          <StructureTable s={current} />
        ) : (
          <EmptyState
            icon={Wallet}
            title="No salary structure yet"
            description={canEdit ? "Add the salary components and the date they apply from." : undefined}
            action={canEdit ? <Button onClick={() => setMode("set")}><Plus className="size-4" /> Add salary structure</Button> : undefined}
          />
        )}
      </Card>

      <Card className="overflow-hidden">
        <div className="flex items-center gap-2 border-b border-line px-5 py-4">
          <History className="size-4 text-subtle" aria-hidden />
          <h2 className="font-display text-base font-semibold text-foreground">Salary history</h2>
        </div>
        {history.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted">No earlier salaries. Each revision moves the old structure here.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-tint text-xs tracking-wide text-muted uppercase">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Period</th>
                  <th className="px-4 py-2.5 font-medium">Components</th>
                  <th className="px-4 py-2.5 text-right font-medium">Monthly</th>
                  <th className="px-4 py-2.5 text-right font-medium">Yearly</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {history.map((h, i) => (
                  <tr key={i} className="align-top">
                    <td className="px-4 py-3 whitespace-nowrap text-body">
                      {formatDate(h.effectiveFrom)} to {formatDate(h.endedOn)}
                      {h.notes && <p className="mt-0.5 text-xs text-subtle">{h.notes}</p>}
                    </td>
                    <td className="px-4 py-3 text-muted">{h.components.map((c) => `${c.name} ${formatCurrency(c.amount)}`).join(" · ")}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-foreground">{formatCurrency(h.total)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-body">{formatCurrency(h.total * 12)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {mode && <SalaryForm employee={employee} existing={data ?? null} revise={mode === "revise"} onClose={() => setMode(null)} />}
    </div>
  );
}

function StructureTable({ s }: { s: SalaryStructure }) {
  return (
    <div className="max-w-xl">
      <table className="w-full text-sm">
        <tbody className="divide-y divide-line">
          {s.components.map((c, i) => (
            <tr key={i}>
              <td className="py-2 text-body">{c.name}</td>
              <td className="py-2 text-right tabular-nums text-foreground">{formatCurrency(c.amount)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t-2 border-line font-semibold text-foreground">
          <tr>
            <td className="py-2">Total per month</td>
            <td className="py-2 text-right tabular-nums">{formatCurrency(s.total)}</td>
          </tr>
          <tr className="font-normal text-muted">
            <td className="py-1">Per year (CTC)</td>
            <td className="py-1 text-right tabular-nums">{formatCurrency(s.total * 12)}</td>
          </tr>
        </tfoot>
      </table>
      {s.notes && <p className="mt-3 text-sm whitespace-pre-line text-muted">{s.notes}</p>}
      <p className="mt-3 text-xs text-subtle">Saved by {s.savedBy} on {formatDate(s.savedAt)}</p>
    </div>
  );
}

function SalaryForm({ employee, existing, revise, onClose }: { employee: BaseRecord; existing: SalaryDoc | null; revise: boolean; onClose: () => void }) {
  const profile = useProfile();
  const settings = useSettings();
  const current = existing?.current;
  const [rows, setRows] = useState<Component[]>(() =>
    current?.components.map((c) => ({ ...c })) ?? settings.lists.salaryComponents.slice(0, 3).map((name) => ({ name, amount: 0 })),
  );
  const [effectiveFrom, setEffectiveFrom] = useState(revise ? todayISO() : (employee.joiningDate as string) || todayISO());
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const total = sumOf(rows);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = rows.filter((r) => r.name.trim()).map((r) => ({ name: r.name.trim(), amount: Number(r.amount) || 0 }));
    if (!clean.length) return setMessage("Add at least one component.");
    if (revise && current && effectiveFrom <= current.effectiveFrom) return setMessage(`The revision must start after ${formatDate(current.effectiveFrom)}.`);
    setSaving(true);
    setMessage(null);
    try {
      const next: SalaryStructure = { components: clean, total: sumOf(clean), effectiveFrom, notes: notes.trim() || "", savedBy: profile.displayName, savedAt: Date.now() };
      const history = [...(existing?.history ?? [])];
      if (revise && current) history.push({ ...current, endedOn: addDays(effectiveFrom, -1) });
      await loggedSet(doc(db(), "salaries", employee.id), {
        employeeId: employee.id,
        employeeName: employee.fullName ?? "",
        current: next,
        history,
        updatedAt: Date.now(),
      });
      onClose();
    } catch (err) {
      setMessage(friendlyError(err));
    } finally {
      setSaving(false);
    }
  };

  const update = (i: number, patch: Partial<Component>) => setRows((r) => r.map((row, j) => (j === i ? { ...row, ...patch } : row)));

  return (
    <Modal
      open
      wide
      title={revise ? "Revise salary" : "Add salary structure"}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="salary-form" disabled={saving}>{saving ? "Saving…" : revise ? "Revise" : "Save"}</Button>
        </>
      }
    >
      <form id="salary-form" onSubmit={save} className="space-y-4">
        {message && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">{message}</p>}
        {revise && current && (
          <p className="rounded-lg bg-tint px-3 py-2 text-sm text-muted">
            The current salary ({formatCurrency(current.total)} a month) moves to the history, ending the day before the new one starts.
          </p>
        )}
        <datalist id="salary-components">
          {settings.lists.salaryComponents.map((c) => <option key={c} value={c} />)}
        </datalist>
        <div>
          <p className={labelClasses}>Components (monthly)</p>
          <ul className="space-y-2">
            {rows.map((r, i) => (
              <li key={i} className="flex gap-2">
                <input list="salary-components" className={inputClasses} value={r.name} onChange={(e) => update(i, { name: e.target.value })} placeholder="Component" aria-label="Component name" />
                <input type="number" min={0} step="any" className={cn(inputClasses, "!w-40 text-right")} value={r.amount || ""} onChange={(e) => update(i, { amount: Number(e.target.value) })} placeholder="0" aria-label="Amount" />
                <button type="button" onClick={() => setRows((x) => x.filter((_, j) => j !== i))} className="rounded-lg px-2 text-subtle hover:text-red-600" aria-label="Remove component">
                  <X className="size-4" />
                </button>
              </li>
            ))}
          </ul>
          <Button size="sm" variant="ghost" className="mt-2" onClick={() => setRows((x) => [...x, { name: "", amount: 0 }])}>
            <Plus className="size-3.5" /> Add component
          </Button>
        </div>
        <div className="flex items-center justify-between rounded-lg bg-tint px-3 py-2 text-sm">
          <span className="font-medium text-foreground">Total per month</span>
          <span className="font-semibold tabular-nums text-foreground">{formatCurrency(total)} <span className="font-normal text-muted">· {formatCurrency(total * 12)} a year</span></span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="sal-from" className={labelClasses}>Effective from</label>
            <input id="sal-from" type="date" required className={inputClasses} value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
          </div>
          <div>
            <label htmlFor="sal-notes" className={labelClasses}>Note (optional)</label>
            <input id="sal-notes" className={inputClasses} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={revise ? "e.g. Annual appraisal 2026" : ""} />
          </div>
        </div>
      </form>
    </Modal>
  );
}
