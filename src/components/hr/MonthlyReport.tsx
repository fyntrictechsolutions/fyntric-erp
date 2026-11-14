"use client";

import { FileBarChart, Printer } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import Image from "next/image";
import logoColor from "@/assets/brand/logo-color.png";
import { useProfile } from "@/components/auth/AuthProvider";
import { BackLink, Loading, NotFound } from "@/components/common/DetailShell";
import { NoAccess } from "@/components/resource/ModulePage";
import { useSettings } from "@/components/settings/SettingsProvider";
import { Button } from "@/components/ui/Button";
import { inputClasses } from "@/components/ui/fieldStyles";
import { canRead } from "@/config/roles";
import { useRecord } from "@/hooks/useCollection";
import { buildDayMap, daysInMonth, iso, type DayStatus } from "@/lib/attendanceCalendar";
import { cn } from "@/lib/cn";
import { formatDate, todayISO } from "@/lib/format";
import { usePersonRecords } from "@/hooks/usePersonRecords";

/** Month picker + button that opens the printable monthly attendance report. */
export function MonthlyReportButton({ employeeId }: { employeeId: string }) {
  const router = useRouter();
  const [month, setMonth] = useState(todayISO().slice(0, 7));
  return (
    <div className="flex items-center gap-2">
      <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className={cn(inputClasses.replace("w-full ", ""), "h-8 w-40 py-1")} aria-label="Report month" />
      <Button size="sm" variant="secondary" disabled={!month} onClick={() => router.push(`/hr/employees/report?id=${employeeId}&month=${month}`)}>
        <FileBarChart className="size-3.5" /> Generate monthly attendance report
      </Button>
    </div>
  );
}

export function MonthlyReportPage() {
  const profile = useProfile();
  if (!canRead(profile.role, "employees") || !canRead(profile.role, "attendance")) return <NoAccess />;
  return (
    <Suspense fallback={<Loading />}>
      <ReportFromUrl />
    </Suspense>
  );
}

function ReportFromUrl() {
  const params = useSearchParams();
  const id = params.get("id");
  const month = params.get("month") ?? todayISO().slice(0, 7);
  if (!id || !/^\d{4}-\d{2}$/.test(month)) return <NotFound what="report" />;
  return <Report id={id} month={month} />;
}

const STATUS_TEXT: Record<DayStatus, string> = {
  present: "Full day",
  short: "Short / missing",
  leave: "Leave",
  off: "Weekend / holiday",
  upcoming: "Upcoming",
  today: "Today",
  none: "Not tracked",
};
const STATUS_CLASS: Partial<Record<DayStatus, string>> = {
  present: "text-emerald-700",
  short: "text-red-700",
  leave: "text-orange-700",
  off: "text-sky-700",
};

function Report({ id, month }: { id: string; month: string }) {
  const settings = useSettings();
  const { data: employee, loading } = useRecord("employees", id);
  const accountId = (employee?.accountId as string | undefined) ?? null;
  const attendance = usePersonRecords("attendance", id, accountId);
  const leave = usePersonRecords("leave", id, accountId);
  const today = todayISO();
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7)) - 1;

  const rows = useMemo(() => {
    const firstCheckIn = attendance.data.reduce<string | undefined>((min, a) => (typeof a.date === "string" && (!min || a.date < min) ? a.date : min), undefined);
    const joined = (employee?.joiningDate as string) || undefined;
    const startDate = [joined, firstCheckIn ?? today].filter(Boolean).sort().pop();
    const dayOf = buildDayMap({ attendance: attendance.data, leave: leave.data, holidays: settings.lists.holidays, workHours: settings.app.workHours, today, startDate });
    return Array.from({ length: daysInMonth(y, m) }, (_, i) => dayOf(iso(y, m, i + 1)));
  }, [attendance.data, leave.data, settings, today, y, m, employee?.joiningDate]);

  if (loading || attendance.loading || leave.loading) return <Loading />;
  if (!employee) return <NotFound what="employee" />;

  const count = (s: DayStatus) => rows.filter((r) => r.status === s).length;
  const hours = rows.reduce((t, r) => t + (Number(r.attendance?.hours) || 0), 0);
  const late = rows.filter((r) => typeof r.attendance?.checkIn === "string" && r.attendance.checkIn > settings.app.officeOpenTime).length;
  const workingDays = rows.filter((r) => r.status !== "off" && r.status !== "none").length;
  const monthLabel = new Date(y, m, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });

  return (
    <div className="animate-fade-up">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <BackLink href={`/hr/employees/view?id=${id}`} label={String(employee.fullName ?? "Employee")} />
        <Button variant="secondary" onClick={() => window.print()}>
          <Printer className="size-4" /> Print / PDF
        </Button>
      </div>
      <article className="print-sheet mx-auto max-w-4xl rounded-2xl border border-slate-200 bg-white p-6 text-slate-800 shadow-card sm:p-10">
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <Image src={logoColor} alt={settings.business.name} className="h-9 w-auto" sizes="200px" />
            <p className="mt-2 text-sm text-slate-600">{settings.business.name}</p>
          </div>
          <div className="sm:text-right">
            <p className="text-xl font-semibold text-slate-900">Attendance report</p>
            <p className="text-sm text-slate-600">{monthLabel}</p>
          </div>
        </header>
        <section className="grid gap-2 py-5 text-sm sm:grid-cols-2">
          <p><span className="text-slate-500">Employee: </span><span className="font-medium text-slate-900">{String(employee.fullName)}</span></p>
          <p><span className="text-slate-500">Employee ID: </span>{String(employee.employeeCode ?? "—")}</p>
          <p><span className="text-slate-500">Designation: </span>{String(employee.designation ?? "—")}</p>
          <p><span className="text-slate-500">Department: </span>{String(employee.department ?? "—")}</p>
        </section>
        <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Working days", workingDays],
            ["Full days", count("present")],
            ["Short / missing", count("short")],
            ["Leave days", count("leave")],
            ["Weekends / holidays", count("off")],
            ["Late check-ins", late],
            ["Hours worked", Math.round(hours * 10) / 10],
            ["Hours expected", (workingDays - count("leave")) * settings.app.workHours],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-lg border border-slate-200 px-3 py-2">
              <p className="text-xs text-slate-500">{label}</p>
              <p className="text-lg font-semibold tabular-nums text-slate-900">{value}</p>
            </div>
          ))}
        </section>
        <div className="-mx-6 overflow-x-auto sm:mx-0">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="border-y border-slate-200 bg-slate-50 text-xs tracking-wide text-slate-500 uppercase">
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Day</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">In</th>
                <th className="px-3 py-2 font-medium">Out</th>
                <th className="px-3 py-2 text-right font-medium">Hours</th>
                <th className="px-3 py-2 font-medium">Note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => {
                const d = new Date(`${r.date}T00:00:00`);
                const isLate = typeof r.attendance?.checkIn === "string" && r.attendance.checkIn > settings.app.officeOpenTime;
                return (
                  <tr key={r.date} className={r.status === "off" ? "bg-slate-50/60" : undefined}>
                    <td className="px-3 py-1.5 whitespace-nowrap">{formatDate(r.date)}</td>
                    <td className="px-3 py-1.5 text-slate-500">{d.toLocaleDateString("en-IN", { weekday: "short" })}</td>
                    <td className={cn("px-3 py-1.5 font-medium", STATUS_CLASS[r.status])}>{STATUS_TEXT[r.status]}</td>
                    <td className={cn("px-3 py-1.5 tabular-nums", isLate && "text-amber-700")}>{String(r.attendance?.checkIn ?? "")}</td>
                    <td className="px-3 py-1.5 tabular-nums">{String(r.attendance?.checkOut ?? "")}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{r.attendance?.hours ? String(r.attendance.hours) : ""}</td>
                    <td className="px-3 py-1.5 text-slate-500">{r.holiday ?? (r.leave ? `${String(r.leave.leaveType ?? "")} leave` : isLate ? "Late" : "")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-6 text-xs text-slate-500">
          Full day = check-in and check-out with at least {settings.app.workHours} hours. Late = check-in after {settings.app.officeOpenTime}. Generated {formatDate(today)}.
        </p>
      </article>
    </div>
  );
}
