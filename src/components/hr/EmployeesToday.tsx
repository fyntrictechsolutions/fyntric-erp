"use client";

import { AlarmClock, CalendarOff, CalendarX2, Clock, UserX } from "lucide-react";
import { collection, query, where } from "firebase/firestore";
import { useMemo } from "react";
import { useProfile } from "@/components/auth/AuthProvider";
import { useSettings } from "@/components/settings/SettingsProvider";
import { Card } from "@/components/ui/Card";
import { useLiveQuery, useModuleRecords } from "@/hooks/useCollection";
import { db } from "@/lib/firebase";
import { formatDate, nowTime, todayISO } from "@/lib/format";
import type { BaseRecord } from "@/types";

interface Row {
  key: string;
  name: string;
  detail: string;
}

/** "Today" summary above the employee list: late check-ins, leave and who hasn't come in. */
export function EmployeesToday() {
  const profile = useProfile();
  const settings = useSettings();
  const today = todayISO();
  const open = settings.app.officeOpenTime || "09:30";
  const employees = useModuleRecords("employees", profile);
  const leave = useModuleRecords("leave", profile);
  const attendance = useLiveQuery(() => query(collection(db(), "attendance"), where("date", "==", today)), `attendance-today:${today}`);

  const data = useMemo(() => {
    const active = employees.data.filter((e) => e.status !== "exited");
    // Match people across records by their employee id or login account.
    const keysOf = (r: BaseRecord) => [r.employeeId, r.userId].filter(Boolean) as string[];
    const empKeys = (e: BaseRecord) => [e.id, e.accountId].filter(Boolean) as string[];
    const checkedIn = new Set(attendance.data.flatMap(keysOf));
    const covers = (l: BaseRecord) => String(l.fromDate ?? "") <= today && String(l.toDate ?? l.fromDate ?? "") >= today;

    const late: Row[] = attendance.data
      .filter((a) => typeof a.checkIn === "string" && a.checkIn > open)
      .sort((a, b) => String(a.checkIn).localeCompare(String(b.checkIn)))
      .map((a) => ({ key: a.id, name: String(a.userName ?? "—"), detail: `Checked in ${a.checkIn}` }));

    const onLeave: Row[] = leave.data
      .filter((l) => l.status === "approved" && covers(l))
      .map((l) => ({ key: l.id, name: String(l.userName ?? "—"), detail: `${String(l.leaveType ?? "Leave")} until ${formatDate(l.toDate)}` }));

    const requests: Row[] = leave.data
      .filter((l) => l.status === "pending" && String(l.toDate ?? l.fromDate ?? "") >= today)
      .sort((a, b) => String(a.fromDate).localeCompare(String(b.fromDate)))
      .map((l) => ({ key: l.id, name: String(l.userName ?? "—"), detail: `Applied for ${formatDate(l.fromDate)}${l.toDate && l.toDate !== l.fromDate ? ` to ${formatDate(l.toDate)}` : ""}` }));

    // Leave was turned down for today, and they still haven't checked in.
    const rejectedAbsent: Row[] = leave.data
      .filter((l) => l.status === "rejected" && covers(l) && !keysOf(l).some((k) => checkedIn.has(k)))
      .map((l) => ({ key: l.id, name: String(l.userName ?? "—"), detail: "Leave rejected, not checked in" }));

    const onLeaveKeys = new Set(leave.data.filter((l) => l.status === "approved" && covers(l)).flatMap(keysOf));
    const dow = new Date(`${today}T00:00:00`).getDay();
    const holiday = dow === 0 || dow === 6 || settings.lists.holidays.some((h) => h.date === today);
    const notIn: Row[] =
      holiday || nowTime() < open
        ? []
        : active
            .filter((e) => e.accountId || e.accountEmail)
            .filter((e) => !empKeys(e).some((k) => checkedIn.has(k) || onLeaveKeys.has(k)))
            .map((e) => ({ key: e.id, name: String(e.fullName ?? "—"), detail: String(e.designation ?? "") }));

    return { active: active.length, present: attendance.data.length, late, onLeave, requests, rejectedAbsent, notIn, holiday };
  }, [employees.data, leave.data, attendance.data, today, open, settings.lists.holidays]);

  if (employees.loading) return null;

  return (
    <div className="mb-6">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-base font-semibold text-foreground">Today, {formatDate(today)}</h2>
        <p className="text-sm text-muted">
          {data.holiday ? "Holiday · " : ""}
          {data.present} of {data.active} checked in · office opens {open}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Box icon={AlarmClock} title="Late today" tone="amber" rows={data.late} empty={`Nobody after ${open}.`} />
        <Box icon={CalendarOff} title="On leave" tone="orange" rows={data.onLeave} empty="Nobody on leave." />
        <Box icon={Clock} title="Leave requests" tone="blue" rows={data.requests} empty="No pending requests." />
        <Box
          icon={data.rejectedAbsent.length ? CalendarX2 : UserX}
          title="Not checked in"
          tone="red"
          rows={[...data.rejectedAbsent, ...data.notIn.filter((n) => !data.rejectedAbsent.some((r) => r.name === n.name))]}
          empty={data.holiday ? "Holiday today." : nowTime() < open ? "Office hasn't opened yet." : "Everyone is in."}
        />
      </div>
    </div>
  );
}

const TONES = {
  amber: "bg-amber-500/12 text-amber-700 dark:text-amber-300",
  orange: "bg-orange-500/12 text-orange-700 dark:text-orange-300",
  blue: "bg-brand-500/12 text-brand-700 dark:text-brand-300",
  red: "bg-red-500/12 text-red-700 dark:text-red-300",
};

function Box({ icon: Icon, title, tone, rows, empty }: { icon: typeof Clock; title: string; tone: keyof typeof TONES; rows: Row[]; empty: string }) {
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className={`grid size-8 place-items-center rounded-lg ${TONES[tone]}`}>
          <Icon className="size-4" aria-hidden />
        </span>
        <p className="flex-1 text-sm font-medium text-foreground">{title}</p>
        <span className="font-display text-lg font-semibold tabular-nums text-foreground">{rows.length}</span>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-subtle">{empty}</p>
      ) : (
        <ul className="max-h-40 space-y-1.5 overflow-y-auto text-sm">
          {rows.map((r) => (
            <li key={r.key} className="min-w-0">
              <p className="truncate text-foreground">{r.name}</p>
              {r.detail && <p className="truncate text-xs text-muted">{r.detail}</p>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
