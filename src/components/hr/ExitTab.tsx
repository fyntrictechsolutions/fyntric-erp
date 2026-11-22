"use client";

import { doc } from "firebase/firestore";
import { loggedSet, loggedUpdate } from "@/lib/audit";
import { Check, CheckCircle2, ClipboardList, Copy, LogOut, MessageCircle, Pencil, Plus, Undo2, X } from "lucide-react";
import { useState } from "react";
import { useProfile } from "@/components/auth/AuthProvider";
import { DetailGrid, Loading } from "@/components/common/DetailShell";
import { friendlyError } from "@/components/resource/RecordEditor";
import { ReferenceSelect } from "@/components/resource/ReferenceSelect";
import { useSettings } from "@/components/settings/SettingsProvider";
import { Badge, type Tone } from "@/components/ui/Badge";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { inputClasses, labelClasses } from "@/components/ui/fieldStyles";
import { Modal } from "@/components/ui/Modal";
import type { FieldDefinition } from "@/config/modules";
import { addDays } from "@/config/modules/options";
import { permissionFor } from "@/config/roles";
import { useRecord } from "@/hooks/useCollection";
import { db } from "@/lib/firebase";
import { formatDate, todayISO } from "@/lib/format";
import { updateRecord } from "@/lib/records";
import { phoneForWhatsApp, whatsAppHref } from "@/lib/share";
import { isCoolingOff, type ChecklistItem, type ExitDoc } from "@/lib/resignation";
import type { BaseRecord } from "@/types";

const STATUS: Record<NonNullable<ExitDoc["status"]>, { label: string; tone: Tone }> = {
  requested: { label: "Resignation received", tone: "amber" },
  processing: { label: "Serving notice", tone: "blue" },
  completed: { label: "Exit completed", tone: "neutral" },
  withdrawn: { label: "Withdrawn", tone: "green" },
};

const INTERVIEWER: FieldDefinition = { name: "exitInterviewerId", label: "Exit interviewer", type: "reference", reference: { module: "employees", labelField: "fullName" } };

export function ExitTab({ employee }: { employee: BaseRecord }) {
  const profile = useProfile();
  const { data: stored, loading } = useRecord<ExitDoc>("exits", employee.id);
  // One the employee submitted is private to them for its first 24 hours.
  const exit = isCoolingOff(stored) ? null : stored;
  const [form, setForm] = useState<"record" | "process" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const canEdit = permissionFor(profile.role, "exits").update === "all";
  const canEditEmployee = permissionFor(profile.role, "employees").update === "all";

  if (loading) return <Loading />;

  const ref = doc(db(), "exits", employee.id);
  const run = async (fn: () => Promise<unknown>) => {
    setMessage(null);
    try {
      await fn();
    } catch (e) {
      setMessage(friendlyError(e));
    }
  };

  if (!exit || exit.status === "withdrawn") {
    return (
      <Card className="p-5 sm:p-6">
        {exit?.status === "withdrawn" && (
          <p className="mb-4 text-sm text-muted">
            An earlier resignation (received {formatDate(exit.receivedOn)}) was withdrawn{exit.withdrawnBy ? ` by ${exit.withdrawnBy}` : ""}{exit.withdrawnOn ? ` on ${formatDate(exit.withdrawnOn)}` : ""}.
          </p>
        )}
        <EmptyState
          icon={LogOut}
          title="No resignation"
          description="Team members resign from Help & support → Leaving the company, and it shows up here. If they tell you directly, send them the link; or record one received by email or letter."
          action={
            canEdit ? (
              <div className="flex flex-wrap justify-center gap-2">
                <Button onClick={() => setForm("record")}><Plus className="size-4" /> Record resignation</Button>
                <ResignLink employee={employee} />
              </div>
            ) : undefined
          }
        />
        {form === "record" && <RecordForm employee={employee} onClose={() => setForm(null)} />}
      </Card>
    );
  }

  const st = STATUS[exit.status ?? "requested"];
  const checklist = exit.checklist ?? [];
  const done = checklist.filter((c) => c.done).length;

  const toggle = (i: number) =>
    run(() => loggedUpdate(ref, { checklist: checklist.map((c, j) => (j === i ? { ...c, done: !c.done } : c)), updatedAt: Date.now() }));

  const complete = () =>
    run(async () => {
      if (!window.confirm(`Mark ${employee.fullName}'s exit as complete?${canEditEmployee ? " Their employee status changes to Exited." : ""}`)) return;
      await loggedUpdate(ref, { status: "completed", completedOn: todayISO(), updatedAt: Date.now() });
      if (canEditEmployee) await updateRecord("employees", employee.id, { status: "exited", exitDate: exit.lastWorkingDay ?? todayISO() });
    });

  const withdraw = () =>
    run(async () => {
      if (!window.confirm("Mark this resignation as withdrawn?")) return;
      await loggedUpdate(ref, { status: "withdrawn", updatedAt: Date.now() });
    });

  return (
    <div className="space-y-6">
      {message && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">{message}</p>}
      <Card className="p-5 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="font-display text-base font-semibold text-foreground">Resignation request</h2>
            <Badge tone={st.tone}>{st.label}</Badge>
          </div>
          {canEdit && exit.status === "requested" && (
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={withdraw}><Undo2 className="size-3.5" /> Withdrawn</Button>
              <Button onClick={() => setForm("process")}><ClipboardList className="size-4" /> Process</Button>
            </div>
          )}
        </div>
        <DetailGrid
          items={[
            { label: "Received on", value: formatDate(exit.receivedOn) },
            { label: "Last day they asked for", value: formatDate(exit.requestedLastDay) },
            { label: exit.source === "self" ? "Submitted" : "Recorded by", value: exit.source === "self" ? "By the employee, in the app" : String(exit.userName ?? "—") },
            { label: "Reason", value: <span className="whitespace-pre-line">{exit.reason || "—"}</span>, wide: true },
          ]}
        />
      </Card>

      {exit.status !== "requested" && (
        <Card className="p-5 sm:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-base font-semibold text-foreground">Exit process</h2>
            {canEdit && exit.status === "processing" && (
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => setForm("process")}><Pencil className="size-3.5" /> Change</Button>
                <Button size="sm" onClick={complete} disabled={done < checklist.length}>
                  <CheckCircle2 className="size-3.5" /> Mark exit complete
                </Button>
              </div>
            )}
          </div>
          <DetailGrid
            items={[
              { label: "Notice period", value: `${exit.noticePeriodDays ?? "—"} days` },
              { label: "Last working day", value: formatDate(exit.lastWorkingDay) },
              { label: "Exit interview", value: exit.exitInterviewDate ? `${formatDate(exit.exitInterviewDate)}${exit.exitInterviewTime ? `, ${exit.exitInterviewTime}` : ""} with ${exit.exitInterviewerIdLabel ?? "—"}` : "Not scheduled" },
            ]}
          />
          <div className="mt-6">
            <p className="mb-2 text-sm font-semibold text-foreground">
              Checklist <span className="font-normal text-muted">· {done} of {checklist.length} done</span>
            </p>
            <ul className="divide-y divide-line rounded-lg border border-line">
              {checklist.map((c, i) => (
                <li key={i}>
                  <label className="flex items-center gap-3 px-3 py-2.5 text-sm">
                    <input type="checkbox" className="size-4 accent-brand-600" checked={c.done} disabled={!canEdit || exit.status === "completed"} onChange={() => toggle(i)} />
                    <span className={c.done ? "text-muted line-through" : "text-foreground"}>{c.item}</span>
                  </label>
                </li>
              ))}
            </ul>
            {exit.status === "processing" && done < checklist.length && <p className="mt-2 text-xs text-subtle">Finish the checklist to mark the exit complete.</p>}
          </div>
        </Card>
      )}

      {form === "record" && <RecordForm employee={employee} onClose={() => setForm(null)} />}
      {form === "process" && <ProcessForm employee={employee} exit={exit} onClose={() => setForm(null)} />}
    </div>
  );
}

/**
 * The resignation page isn't in the menu on purpose. When someone tells HR they want to leave,
 * HR can send them the link here: on WhatsApp if their phone is on file, or copied to paste anywhere.
 */
function ResignLink({ employee }: { employee: BaseRecord }) {
  const [copied, setCopied] = useState(false);
  // Only rendered after the record loads in the browser, so window is there.
  const url = `${typeof window === "undefined" ? "" : window.location.origin}/hr/resign`;
  const first = String(employee.fullName ?? "").split(" ")[0] || "there";
  const text = `Hi ${first}, as we discussed, you can submit your resignation in the ERP here: ${url}\nSign in with your work account. It reaches HR 24 hours after you submit it, and you can cancel it until then.`;
  const copy = async () => {
    await navigator.clipboard.writeText(text).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <>
      {phoneForWhatsApp(employee.phone) && (
        <a href={whatsAppHref(employee.phone, text)} target="_blank" rel="noreferrer" className={buttonClasses("secondary")}>
          <MessageCircle className="size-4" /> Send resignation link
        </a>
      )}
      <Button variant={phoneForWhatsApp(employee.phone) ? "ghost" : "secondary"} onClick={() => void copy()}>
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />} {copied ? "Copied" : "Copy resignation link"}
      </Button>
    </>
  );
}

function RecordForm({ employee, onClose }: { employee: BaseRecord; onClose: () => void }) {
  const profile = useProfile();
  const [receivedOn, setReceivedOn] = useState(todayISO());
  const [requestedLastDay, setRequestedLastDay] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await loggedSet(doc(db(), "exits", employee.id), {
        employeeId: employee.id,
        employeeName: employee.fullName ?? "",
        status: "requested",
        receivedOn,
        requestedLastDay: requestedLastDay || null,
        reason,
        userId: profile.id,
        userName: profile.displayName,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      onClose();
    } catch (err) {
      setMessage(friendlyError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      title="Record resignation"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="exit-record" disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </>
      }
    >
      <form id="exit-record" onSubmit={save} className="space-y-4">
        {message && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">{message}</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="ex-recv" className={labelClasses}>Received on</label>
            <input id="ex-recv" type="date" required className={inputClasses} value={receivedOn} onChange={(e) => setReceivedOn(e.target.value)} />
          </div>
          <div>
            <label htmlFor="ex-last" className={labelClasses}>Last day they asked for</label>
            <input id="ex-last" type="date" className={inputClasses} value={requestedLastDay} onChange={(e) => setRequestedLastDay(e.target.value)} />
          </div>
        </div>
        <div>
          <label htmlFor="ex-reason" className={labelClasses}>Reason</label>
          <textarea id="ex-reason" rows={4} className={inputClasses} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
      </form>
    </Modal>
  );
}

function ProcessForm({ employee, exit, onClose }: { employee: BaseRecord; exit: ExitDoc; onClose: () => void }) {
  const profile = useProfile();
  const settings = useSettings();
  const [notice, setNotice] = useState<number>(exit.noticePeriodDays ?? settings.offer.noticePeriodDays);
  const [lastDay, setLastDay] = useState(exit.lastWorkingDay ?? addDays(exit.receivedOn ?? todayISO(), exit.noticePeriodDays ?? settings.offer.noticePeriodDays));
  const [interviewer, setInterviewer] = useState({ id: exit.exitInterviewerId ?? "", label: exit.exitInterviewerIdLabel ?? "" });
  const [ivDate, setIvDate] = useState(exit.exitInterviewDate ?? "");
  const [ivTime, setIvTime] = useState(exit.exitInterviewTime ?? "");
  const [items, setItems] = useState<ChecklistItem[]>(() => exit.checklist ?? settings.lists.exitChecklist.map((item) => ({ item, done: false })));
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const changeNotice = (days: number) => {
    setNotice(days);
    setLastDay(addDays(exit.receivedOn ?? todayISO(), days));
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await loggedUpdate(doc(db(), "exits", employee.id), {
        status: "processing",
        noticePeriodDays: notice,
        lastWorkingDay: lastDay,
        exitInterviewerId: interviewer.id || null,
        exitInterviewerIdLabel: interviewer.label || null,
        exitInterviewDate: ivDate || null,
        exitInterviewTime: ivTime || null,
        checklist: items.filter((i) => i.item.trim()),
        processedBy: profile.displayName,
        updatedAt: Date.now(),
      });
      // Only admins edit employee records; for HR the status stays as it is.
      if (permissionFor(profile.role, "employees").update === "all" && employee.status === "active") {
        await updateRecord("employees", employee.id, { status: "notice", exitDate: lastDay });
      }
      onClose();
    } catch (err) {
      setMessage(friendlyError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      wide
      title={`Process resignation: ${employee.fullName}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="exit-process" disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </>
      }
    >
      <form id="exit-process" onSubmit={save} className="space-y-5">
        {message && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">{message}</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="pr-notice" className={labelClasses}>Notice period (days)</label>
            <input id="pr-notice" type="number" min={0} className={inputClasses} value={notice} onChange={(e) => changeNotice(Number(e.target.value) || 0)} />
          </div>
          <div>
            <label htmlFor="pr-last" className={labelClasses}>Last working day</label>
            <input id="pr-last" type="date" required className={inputClasses} value={lastDay} onChange={(e) => setLastDay(e.target.value)} />
            <p className="mt-1 text-xs text-subtle">Received {formatDate(exit.receivedOn)} + notice period; change it if agreed otherwise.</p>
          </div>
        </div>
        <fieldset className="grid gap-4 rounded-xl border border-line p-4 sm:grid-cols-3">
          <legend className="px-1 text-sm font-semibold text-foreground">Exit interview</legend>
          <div className="sm:col-span-3">
            <label htmlFor="pr-int" className={labelClasses}>Interviewer</label>
            <ReferenceSelect id="pr-int" field={INTERVIEWER} value={interviewer.id} label={interviewer.label} onChange={(id, label) => setInterviewer({ id, label })} />
          </div>
          <div>
            <label htmlFor="pr-date" className={labelClasses}>Date</label>
            <input id="pr-date" type="date" className={inputClasses} value={ivDate} onChange={(e) => setIvDate(e.target.value)} />
          </div>
          <div>
            <label htmlFor="pr-time" className={labelClasses}>Time</label>
            <input id="pr-time" type="time" className={inputClasses} value={ivTime} onChange={(e) => setIvTime(e.target.value)} />
          </div>
        </fieldset>
        <div>
          <p className={labelClasses}>Checklist</p>
          <ul className="space-y-1.5">
            {items.map((it, i) => (
              <li key={i} className="flex items-center gap-2 text-sm">
                <span className="flex-1 rounded-lg border border-line px-3 py-2 text-body">{it.item}</span>
                <button type="button" onClick={() => setItems((x) => x.filter((_, j) => j !== i))} className="rounded p-1 text-subtle hover:text-red-600" aria-label={`Remove ${it.item}`}>
                  <X className="size-4" />
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex gap-2">
            <input className={inputClasses} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Add a step" aria-label="New checklist step" />
            <Button variant="secondary" disabled={!draft.trim()} onClick={() => { setItems((x) => [...x, { item: draft.trim(), done: false }]); setDraft(""); }}>
              <Plus className="size-4" /> Add
            </Button>
          </div>
          <p className="mt-1 text-xs text-subtle">The default steps come from Settings → Lists → Exit checklist.</p>
        </div>
      </form>
    </Modal>
  );
}
