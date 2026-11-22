"use client";

import { CalendarHeart, Clock, Coffee, HeartHandshake, Moon, Undo2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useProfile } from "@/components/auth/AuthProvider";
import { BackLink, Loading } from "@/components/common/DetailShell";
import { friendlyError } from "@/components/resource/RecordEditor";
import { useSettings } from "@/components/settings/SettingsProvider";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { inputClasses, labelClasses } from "@/components/ui/fieldStyles";
import { PageHeader } from "@/components/ui/PageHeader";
import { addDays } from "@/config/modules/options";
import { useRecord } from "@/hooks/useCollection";
import { formatDate, todayISO } from "@/lib/format";
import { cancelResignation, isCoolingOff, submitResignation, withdrawResignation, type ExitDoc } from "@/lib/resignation";

const when = (ms: number) => new Date(ms).toLocaleString("en-IN", { weekday: "long", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

/**
 * Where a team member resigns. Deliberately not in the menu: it's reached from Help & support → Leaving the
 * company, starts with a "before you decide" step, and a submitted resignation waits 24 hours before HR sees it.
 */
export function ResignPage() {
  const profile = useProfile();
  const { data: exit, loading } = useRecord<ExitDoc>("exits", profile.employeeId ?? null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  if (loading) return <Loading />;

  let body: React.ReactNode;
  if (!profile.employeeId) {
    body = (
      <Card className="p-6 text-sm text-body">
        Your account isn&apos;t linked to an employee record, so this can&apos;t be done in the app. Please talk to HR directly.
      </Card>
    );
  } else if (exit && exit.status !== "withdrawn") {
    body = <Status exit={exit} now={now} />;
  } else {
    body = <Start />;
  }

  return (
    <div className="mx-auto max-w-2xl animate-fade-up">
      <BackLink href="/help" label="Help & support" />
      <PageHeader title="Leaving the company" />
      {body}
    </div>
  );
}

function Status({ exit, now }: { exit: ExitDoc; now: number }) {
  const profile = useProfile();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setMessage(null);
    try {
      await fn();
    } catch (e) {
      setMessage(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };
  const error = message && <p className="mb-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">{message}</p>;

  if (isCoolingOff(exit, now)) {
    return (
      <Card className="p-6">
        {error}
        <div className="flex items-start gap-3">
          <Clock className="mt-0.5 size-5 shrink-0 text-amber-600" />
          <div className="space-y-2 text-sm text-body">
            <p className="font-medium text-foreground">Your resignation is waiting, and only you can see it.</p>
            <p>
              It reaches HR on <strong>{when(Number(exit.sendAt))}</strong>. Until then nobody else knows about it, and if you change your mind you can take it back
              without a trace.
            </p>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          <Button disabled={busy} onClick={() => void run(() => cancelResignation(profile))}>
            <Undo2 className="size-4" /> I&apos;ve changed my mind, cancel it
          </Button>
          <Link href="/dashboard" className={buttonClasses("ghost")}>Leave it as it is</Link>
        </div>
      </Card>
    );
  }

  if (exit.status === "requested") {
    return (
      <Card className="p-6">
        {error}
        <p className="text-sm text-body">
          HR received your resignation on {formatDate(exit.receivedOn)}
          {exit.requestedLastDay ? `, asking for ${formatDate(exit.requestedLastDay)} as your last day` : ""}. They&apos;ll talk to you about the next steps.
        </p>
        {exit.source === "self" && (
          <div className="mt-6 border-t border-line pt-4">
            <p className="text-sm text-muted">Changed your mind? You can withdraw it until HR starts processing it.</p>
            <Button
              variant="secondary"
              className="mt-3"
              disabled={busy}
              onClick={() => void run(async () => {
                if (window.confirm("Withdraw your resignation? HR will see that you withdrew it.")) await withdrawResignation(profile);
              })}
            >
              <Undo2 className="size-4" /> Withdraw my resignation
            </Button>
          </div>
        )}
      </Card>
    );
  }

  return (
    <Card className="p-6 text-sm text-body">
      {exit.status === "processing" ? (
        <p>
          You&apos;re serving your notice period. Your last working day is <strong>{formatDate(exit.lastWorkingDay)}</strong>. For any change, please talk to HR.
        </p>
      ) : (
        <p>Your exit was completed{exit.lastWorkingDay ? ` on ${formatDate(exit.lastWorkingDay)}` : ""}. Thank you for your time with us, and all the best.</p>
      )}
    </Card>
  );
}

function Start() {
  const [step, setStep] = useState<"pause" | "form">("pause");
  return step === "pause" ? <Pause onContinue={() => setStep("form")} /> : <ResignForm />;
}

/** A gentle stop before the form: most bad days pass, and many problems are fixable with a conversation. */
function Pause({ onContinue }: { onContinue: () => void }) {
  const ideas = [
    { icon: HeartHandshake, title: "Talk to someone first", text: "Your manager or HR would much rather hear what's wrong now. Workload, pay, people or growth: a conversation fixes more than you'd think." },
    { icon: Coffee, title: "Take a break", text: "If you're worn out, a few days of leave might be what you need.", href: "/hr/leave", cta: "Apply for leave" },
    { icon: Moon, title: "Sleep on it", text: "Big decisions look different the next morning. This page will still be here tomorrow." },
  ];
  return (
    <div className="space-y-4">
      <Card className="p-6">
        <div className="flex items-start gap-3">
          <CalendarHeart className="mt-0.5 size-5 shrink-0 text-accent" />
          <div>
            <p className="font-medium text-foreground">Before you decide</p>
            <p className="mt-1 text-sm text-muted">Resigning is a big step. If something isn&apos;t working, we&apos;d really like the chance to fix it.</p>
          </div>
        </div>
        <ul className="mt-5 space-y-4">
          {ideas.map((i) => (
            <li key={i.title} className="flex gap-3">
              <i.icon className="mt-0.5 size-4 shrink-0 text-subtle" />
              <div className="text-sm">
                <p className="font-medium text-foreground">{i.title}</p>
                <p className="text-body">{i.text}</p>
                {i.href && (
                  <Link href={i.href} className="mt-1 inline-block font-medium text-accent hover:underline">
                    {i.cta} →
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-6 flex flex-wrap gap-2">
          <Link href="/dashboard" className={buttonClasses("primary")}>Back to my work</Link>
        </div>
      </Card>
      <p className="text-center text-xs text-subtle">
        Already decided?{" "}
        <button type="button" onClick={onContinue} className="underline underline-offset-2 hover:text-muted">
          Continue to the resignation form
        </button>
      </p>
    </div>
  );
}

function ResignForm() {
  const profile = useProfile();
  const settings = useSettings();
  const notice = settings.offer.noticePeriodDays;
  const [lastDay, setLastDay] = useState(addDays(todayISO(), notice));
  const [reason, setReason] = useState("");
  const [confirmName, setConfirmName] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const name = profile.displayName.trim();
  const nameOk = confirmName.trim().toLowerCase() === name.toLowerCase();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      await submitResignation(profile, { reason, requestedLastDay: lastDay });
    } catch (err) {
      setMessage(friendlyError(err));
      setSaving(false);
    }
  };

  return (
    <Card className="p-6">
      <form onSubmit={submit} className="space-y-5">
        {message && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">{message}</p>}
        <div>
          <label htmlFor="rs-last" className={labelClasses}>Last working day you&apos;d like</label>
          <input id="rs-last" type="date" required min={todayISO()} className={inputClasses} value={lastDay} onChange={(e) => setLastDay(e.target.value)} />
          <p className="mt-1 text-xs text-subtle">
            The notice period is {notice} days, so the earliest usual last day is {formatDate(addDays(todayISO(), notice))}. HR confirms the final date with you.
          </p>
        </div>
        <div>
          <label htmlFor="rs-reason" className={labelClasses}>Why are you leaving?</label>
          <textarea id="rs-reason" required minLength={10} rows={4} className={inputClasses} value={reason} onChange={(e) => setReason(e.target.value)} />
          <p className="mt-1 text-xs text-subtle">Only HR and admins will read this.</p>
        </div>
        <div>
          <label htmlFor="rs-name" className={labelClasses}>To confirm, type your name: {name}</label>
          <input id="rs-name" required autoComplete="off" className={inputClasses} value={confirmName} onChange={(e) => setConfirmName(e.target.value)} />
        </div>
        <p className="rounded-lg bg-tint px-3 py-2 text-xs text-muted">
          Your resignation reaches HR 24 hours after you submit it. Until then only you can see it, and you can cancel it here.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="danger" disabled={saving || !nameOk || reason.trim().length < 10}>
            {saving ? "Submitting…" : "Submit resignation"}
          </Button>
          <Link href="/dashboard" className={buttonClasses("ghost")}>Cancel</Link>
        </div>
      </form>
    </Card>
  );
}
