"use client";

import { ChevronLeft, ChevronRight, Pencil } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { useProfile } from "@/components/auth/AuthProvider";
import { BackLink, Loading, NotFound, RecordFields, Tabs, WithRecordId } from "@/components/common/DetailShell";
import { NoAccess } from "@/components/resource/ModulePage";
import { RecordEditor } from "@/components/resource/RecordEditor";
import { useSettings } from "@/components/settings/SettingsProvider";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { attendanceModule, employeesModule, leaveModule } from "@/config/modules/hr";
import { APPROVAL_STATUS } from "@/config/modules/options";
import { canRead } from "@/config/roles";
import { useRecord } from "@/hooks/useCollection";
import { moduleAccess } from "@/lib/access";
import { buildDayMap, daysInMonth, type DayInfo, type DayStatus, eachDate, iso } from "@/lib/attendanceCalendar";
import { cn } from "@/lib/cn";
import { formatDate, hoursBetween, nowTime, todayISO } from "@/lib/format";
import { MonthlyReportButton } from "./MonthlyReport";
import { usePersonRecords } from "@/hooks/usePersonRecords";
import { SalaryTab } from "./SalaryTab";
import { ExitTab } from "./ExitTab";
import type { BaseRecord } from "@/types";

export function EmployeeDetailPage() {
  const profile = useProfile();
  if (!canRead(profile.role, "employees")) return <NoAccess />;
  return <WithRecordId>{(id) => <EmployeeDetail id={id} />}</WithRecordId>;
}

type Tab = "details" | "attendance" | "salary" | "exit";

function EmployeeDetail({ id }: { id: string }) {
  const profile = useProfile();
  const { data: employee, loading } = useRecord("employees", id);
  const params = useSearchParams();
  const [tab, setTab] = useState<Tab>(() => (params.get("tab") === "exit" && canRead(profile.role, "exits") ? "exit" : "details"));
  const [editing, setEditing] = useState(false);

  if (loading) return <Loading />;
  if (!employee) return <NotFound what="employee" />;

  const access = moduleAccess(employeesModule, profile);
  const status = employeesModule.fields.find((f) => f.name === "status")!.options!.find((o) => o.value === employee.status);

  return (
    <div className="animate-fade-up">
      <BackLink href="/hr/employees" label="All employees" />
      <PageHeader
        title={String(employee.fullName ?? "Employee")}
        description={[employee.designation, employee.department].filter(Boolean).join(" · ") || undefined}
        actions={
          <>
            {status && <Badge tone={status.tone}>{status.label}</Badge>}
            {access.canEdit(employee) && (
              <Button onClick={() => setEditing(true)}>
                <Pencil className="size-4" /> Edit details
              </Button>
            )}
          </>
        }
      />

      <Tabs<Tab>
        tabs={[
          { value: "details", label: "Basic details" },
          { value: "attendance", label: "Attendance" },
          ...(canRead(profile.role, "salaries") ? [{ value: "salary" as const, label: "Salary structure" }] : []),
          ...(canRead(profile.role, "exits") ? [{ value: "exit" as const, label: "Resignation" }] : []),
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === "details" ? (
        <Card className="p-5 sm:p-6">
          <RecordFields module={employeesModule} record={employee} role={profile.role} />
          {Boolean(employee.accountEmail) && (
            <p className="mt-5 text-xs text-subtle">Signs in as {String(employee.accountEmail)}</p>
          )}
        </Card>
      ) : tab === "attendance" ? (
        <AttendanceTab employee={employee} />
      ) : tab === "salary" ? (
        <SalaryTab employee={employee} />
      ) : (
        <ExitTab employee={employee} />
      )}

      {editing && <RecordEditor module={employeesModule} record={employee} onClose={() => setEditing(false)} />}
    </div>
  );
}

const STATUS_STYLE: Record<DayStatus, string> = {
  present: "bg-emerald-500 text-white",
  short: "bg-red-500 text-white",
  leave: "bg-orange-400 text-white",
  off: "bg-sky-500 text-white",
  upcoming: "bg-tint-strong text-subtle",
  today: "bg-tint-strong text-foreground ring-2 ring-brand-500",
  none: "text-subtle",
};

const LEGEND: { status: DayStatus; label: string }[] = [
  { status: "present", label: `Full day` },
  { status: "short", label: "Short day or missing check-in/out" },
  { status: "leave", label: "Approved leave" },
  { status: "off", label: "Weekend or public holiday" },
  { status: "upcoming", label: "Upcoming" },
];

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function AttendanceTab({ employee }: { employee: BaseRecord }) {
  const profile = useProfile();
  const settings = useSettings();
  const accountId = (employee.accountId as string | undefined) ?? null;
  const attendance = usePersonRecords("attendance", employee.id, accountId);
  const leave = usePersonRecords("leave", employee.id, accountId);
  const today = todayISO();
  const thisYear = Number(today.slice(0, 4));
  const [year, setYear] = useState(thisYear);
  const [editing, setEditing] = useState<BaseRecord | null>(null);
  const attAccess = moduleAccess(attendanceModule, profile);
  const workHours = settings.app.workHours;

  // Count from the later of joining and the first check-in, so days before the ERP was in use don't show as missed.
  const firstCheckIn = attendance.data.reduce<string | undefined>((min, a) => (typeof a.date === "string" && (!min || a.date < min) ? a.date : min), undefined);
  const joined = (employee.joiningDate as string) || undefined;
  const startDate = [joined, firstCheckIn ?? today].filter(Boolean).sort().pop();
  const dayOf = useMemo(
    () => buildDayMap({ attendance: attendance.data, leave: leave.data, holidays: settings.lists.holidays, workHours, today, startDate }),
    [attendance.data, leave.data, settings.lists.holidays, workHours, today, startDate],
  );

  const todayInfo = (() => {
    const d = dayOf(today);
    const a = d.attendance;
    if (!a) {
      const label = d.status === "leave" ? "On leave" : d.status === "off" ? "Holiday" : "Not yet";
      return { checkIn: label, checkInHint: `Office opens ${settings.app.officeOpenTime}`, hours: "0", hoursHint: `of ${workHours}h` };
    }
    const late = typeof a.checkIn === "string" && a.checkIn > settings.app.officeOpenTime;
    let hours = Number(a.hours) || 0;
    let hoursHint = `of ${workHours}h`;
    if (!a.checkOut) {
      hours = hoursBetween(a.checkIn, nowTime()) ?? 0;
      hoursHint = `so far, not checked out`;
    }
    return { checkIn: String(a.checkIn ?? "—"), checkInHint: late ? `Late (office opens ${settings.app.officeOpenTime})` : "On time", hours: String(Math.round(hours * 10) / 10), hoursHint };
  })();

  const stats = useMemo(() => {
    const monthStart = `${today.slice(0, 7)}-01`;
    const yearStart = `${year}-01-01`;
    const yearEnd = year === thisYear ? today : `${year}-12-31`;
    const count = (from: string, to: string) => {
      const c = { present: 0, short: 0, leave: 0 };
      for (const d of eachDate(from, to)) {
        const s = dayOf(d).status;
        if (s === "present" || s === "short" || s === "leave") c[s]++;
      }
      return c;
    };
    // Approved leave later this year still counts as "taken" for planning.
    const leaveYear = eachDate(yearStart, `${year}-12-31`).filter((d) => dayOf(d).status === "leave").length;
    const leaveMonth = eachDate(monthStart, iso(thisYear, Number(today.slice(5, 7)) - 1, daysInMonth(thisYear, Number(today.slice(5, 7)) - 1))).filter((d) => dayOf(d).status === "leave").length;
    const pending = leave.data.filter((l) => l.status === "pending").length;
    return { month: count(monthStart, today), year: count(yearStart, yearEnd), leaveMonth, leaveYear, pending };
  }, [dayOf, today, year, thisYear, leave.data]);

  const firstYear = Math.min(thisYear, Number((joined ?? startDate ?? today).slice(0, 4)) || thisYear);
  const yearLeave = leave.data
    .filter((l) => String(l.fromDate ?? "").startsWith(String(year)) || String(l.toDate ?? "").startsWith(String(year)))
    .sort((a, b) => String(b.fromDate).localeCompare(String(a.fromDate)));

  if (attendance.loading || leave.loading) return <Loading />;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label="Check-in today" value={todayInfo.checkIn} hint={todayInfo.checkInHint} />
        <Stat label="Working hours today" value={todayInfo.hours} hint={todayInfo.hoursHint} />
        <Stat label="Full days this month" value={stats.month.present} hint={`${stats.month.short} short or missing`} />
        <Stat label="Leave this month" value={stats.leaveMonth} hint="Approved working days" />
        <Stat label={`Full days in ${year}`} value={stats.year.present} hint={`${stats.year.short} short or missing`} />
        <Stat label={`Leave in ${year}`} value={stats.leaveYear} hint={stats.pending ? `${stats.pending} request${stats.pending === 1 ? "" : "s"} pending` : "Approved working days"} />
      </div>

      <Card className="p-4 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex-1 font-display text-base font-semibold text-foreground">Attendance calendar</h2>
          <MonthlyReportButton employeeId={employee.id} />
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" onClick={() => setYear((y) => y - 1)} disabled={year <= firstYear} aria-label="Previous year">
              <ChevronLeft className="size-4" />
            </Button>
            <span className="w-14 text-center text-sm font-semibold tabular-nums text-foreground">{year}</span>
            <Button size="sm" variant="ghost" onClick={() => setYear((y) => y + 1)} disabled={year >= thisYear + 1} aria-label="Next year">
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
        <ul className="mb-5 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted">
          {LEGEND.map((l) => (
            <li key={l.status} className="flex items-center gap-1.5">
              <span className={cn("size-3 rounded-sm", STATUS_STYLE[l.status])} aria-hidden />
              {l.status === "present" ? `Full day (${workHours}h+)` : l.label}
            </li>
          ))}
        </ul>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {MONTHS.map((name, m) => (
            <MonthBox
              key={name}
              year={year}
              month={m}
              name={name}
              dayOf={dayOf}
              onPick={(d) => d.attendance && attAccess.canEdit(d.attendance) && setEditing(d.attendance)}
              canEdit={attAccess.isManager}
            />
          ))}
        </div>
        {attAccess.isManager && <p className="mt-4 text-xs text-subtle">Tap a day with a check-in to correct it.</p>}
      </Card>

      {canRead(profile.role, "leave") && (
        <Card className="overflow-hidden">
          <h2 className="border-b border-line px-5 py-4 font-display text-base font-semibold text-foreground">Leave requests in {year}</h2>
          {yearLeave.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted">No leave requests.</p>
          ) : (
            <ul className="divide-y divide-line">
              {yearLeave.map((l) => {
                const st = APPROVAL_STATUS.find((o) => o.value === l.status);
                const type = leaveModule.fields[0].options!.find((o) => o.value === l.leaveType);
                return (
                  <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                    <div>
                      <p className="font-medium text-foreground">{type?.label ?? String(l.leaveType)} · {String(l.days ?? "—")} day{l.days === 1 ? "" : "s"}</p>
                      <p className="text-xs text-muted">{formatDate(l.fromDate)} to {formatDate(l.toDate)}{l.reason ? ` · ${l.reason}` : ""}</p>
                    </div>
                    {st && <Badge tone={st.tone}>{st.label}</Badge>}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}

      {editing && <RecordEditor module={attendanceModule} record={editing} title={`Edit attendance, ${formatDate(editing.date)}`} onClose={() => setEditing(null)} />}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-1 font-display text-2xl font-semibold tabular-nums text-foreground">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-subtle">{hint}</p>}
    </Card>
  );
}

function describe(d: DayInfo, workHours: number) {
  const parts = [formatDate(d.date)];
  if (d.holiday) parts.push(d.holiday);
  if (d.leave) parts.push(`Leave: ${String(d.leave.leaveType ?? "")}`);
  if (d.attendance) {
    parts.push(`In ${d.attendance.checkIn ?? "—"}, out ${d.attendance.checkOut ?? "—"}`);
    if (d.attendance.hours) parts.push(`${d.attendance.hours}h of ${workHours}h`);
  } else if (d.status === "short") parts.push("No check-in");
  return parts.join(" · ");
}

function MonthBox({
  year,
  month,
  name,
  dayOf,
  onPick,
  canEdit,
}: {
  year: number;
  month: number;
  name: string;
  dayOf: (d: string) => DayInfo;
  onPick: (d: DayInfo) => void;
  canEdit: boolean;
}) {
  const settings = useSettings();
  const lead = (new Date(year, month, 1).getDay() + 6) % 7; // Monday first
  const days = daysInMonth(year, month);
  return (
    <div className="rounded-xl border border-line p-3">
      <p className="mb-2 text-sm font-semibold text-foreground">{name}</p>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-medium text-subtle">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {Array.from({ length: lead }, (_, i) => (
          <span key={`b${i}`} />
        ))}
        {Array.from({ length: days }, (_, i) => {
          const info = dayOf(iso(year, month, i + 1));
          const clickable = canEdit && Boolean(info.attendance);
          return (
            <button
              key={i}
              type="button"
              title={describe(info, settings.app.workHours)}
              onClick={() => onPick(info)}
              disabled={!clickable}
              className={cn(
                "grid aspect-square place-items-center rounded-md text-[11px] font-medium tabular-nums disabled:cursor-default",
                STATUS_STYLE[info.status],
                clickable && "cursor-pointer hover:opacity-80",
              )}
            >
              {i + 1}
            </button>
          );
        })}
      </div>
    </div>
  );
}
