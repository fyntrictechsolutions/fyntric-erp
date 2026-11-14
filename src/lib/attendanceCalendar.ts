import type { BaseRecord } from "@/types";

export type DayStatus = "present" | "short" | "leave" | "off" | "upcoming" | "today" | "none";

export interface DayInfo {
  date: string;
  status: DayStatus;
  attendance?: BaseRecord;
  leave?: BaseRecord;
  holiday?: string;
}

export function iso(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function daysInMonth(y: number, m: number) {
  return new Date(y, m + 1, 0).getDate();
}

/** Every "YYYY-MM-DD" from one date to another, inclusive. */
export function eachDate(from: string, to: string): string[] {
  const out: string[] = [];
  const d = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  if (Number.isNaN(d.getTime()) || Number.isNaN(end.getTime())) return out;
  while (d <= end && out.length < 400) {
    out.push(iso(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

/** Leave types that are time off (work from home is still a working day). */
export function isTimeOff(leave: BaseRecord) {
  return leave.leaveType !== "wfh";
}

export interface CalendarInput {
  attendance: BaseRecord[];
  leave: BaseRecord[];
  holidays: { date: string; name: string }[];
  workHours: number;
  today: string;
  /** Days before this are left blank (before the person joined). */
  startDate?: string;
}

/**
 * Builds the colour of every day, in this order:
 * weekends and public holidays (blue), approved leave (orange), future days (grey),
 * a full day of at least `workHours` with check-in and check-out (green), anything else (red).
 */
export function buildDayMap({ attendance, leave, holidays, workHours, today, startDate }: CalendarInput) {
  const byDate = new Map<string, BaseRecord>();
  for (const a of attendance) if (typeof a.date === "string") byDate.set(a.date, a);

  const leaveByDate = new Map<string, BaseRecord>();
  for (const l of leave) {
    if (l.status !== "approved" || !isTimeOff(l)) continue;
    for (const d of eachDate(String(l.fromDate ?? ""), String(l.toDate ?? l.fromDate ?? ""))) leaveByDate.set(d, l);
  }
  const holidayByDate = new Map(holidays.map((h) => [h.date, h.name]));

  return (date: string): DayInfo => {
    const attendanceRec = byDate.get(date);
    const leaveRec = leaveByDate.get(date);
    const holiday = holidayByDate.get(date);
    const dow = new Date(`${date}T00:00:00`).getDay();
    const info: DayInfo = { date, status: "none", attendance: attendanceRec, leave: leaveRec, holiday };

    if (dow === 0 || dow === 6 || holiday) info.status = "off";
    else if (startDate && date < startDate) info.status = "none";
    else if (leaveRec) info.status = "leave";
    else if (date > today) info.status = "upcoming";
    else {
      const hours = Number(attendanceRec?.hours) || 0;
      const complete = Boolean(attendanceRec?.checkIn && attendanceRec?.checkOut && hours >= workHours);
      if (complete) info.status = "present";
      else if (date === today) info.status = "today";
      else info.status = "short";
    }
    return info;
  };
}

/** Working days of approved time off inside a date range (weekends and holidays don't count). */
export function leaveDaysIn(dayOf: (d: string) => DayInfo, from: string, to: string) {
  return eachDate(from, to).filter((d) => dayOf(d).status === "leave").length;
}
