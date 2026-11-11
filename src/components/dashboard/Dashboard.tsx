"use client";

import { CalendarCheck, CalendarOff, FileText, FolderKanban, Receipt, Target, Timer, Users } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { useProfile } from "@/components/auth/AuthProvider";
import { FieldValue } from "@/components/resource/FieldValue";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { MODULES } from "@/config/modules";
import { ROLE_LABELS } from "@/config/roles";
import { useModuleRecords } from "@/hooks/useCollection";
import { formatCurrency, formatDate, monthOf, todayISO } from "@/lib/format";
import type { BaseRecord } from "@/types";
import { StatCard } from "./StatCard";

const sum = (rows: BaseRecord[], field: string) => rows.reduce((t, r) => t + (Number(r[field]) || 0), 0);

/** Overview for whoever is signed in: each card only appears if their role can see that module. */
export function Dashboard() {
  const profile = useProfile();
  const today = todayISO();
  const thisMonth = today.slice(0, 7);

  const employees = useModuleRecords("employees", profile);
  const attendance = useModuleRecords("attendance", profile);
  const leave = useModuleRecords("leave", profile);
  const leads = useModuleRecords("leads", profile);
  const projects = useModuleRecords("projects", profile);
  const timesheets = useModuleRecords("timesheets", profile);
  const invoices = useModuleRecords("invoices", profile);
  const expenses = useModuleRecords("expenses", profile);

  const stats = useMemo(() => {
    const activeProjects = projects.data.filter((p) => p.status === "in_progress" || p.status === "planning");
    const openLeads = leads.data.filter((l) => l.stage !== "won" && l.stage !== "lost");
    const outstanding = invoices.data.filter((i) => i.status === "sent" || i.status === "overdue");
    const paidThisMonth = invoices.data.filter((i) => i.status === "paid" && monthOf(i.paidDate ?? i.issueDate) === thisMonth);
    return {
      activeProjects,
      openLeads,
      outstanding,
      paidThisMonth,
      activeEmployees: employees.data.filter((e) => e.status !== "exited").length,
      presentToday: attendance.data.filter((a) => a.date === today).length,
      pendingLeave: leave.data.filter((l) => l.status === "pending").length,
      hoursThisMonth: sum(timesheets.data.filter((t) => monthOf(t.date) === thisMonth), "hours"),
      expensesThisMonth: sum(expenses.data.filter((e) => monthOf(e.date) === thisMonth && e.status !== "rejected"), "amount"),
    };
  }, [projects.data, leads.data, invoices.data, employees.data, attendance.data, leave.data, timesheets.data, expenses.data, thisMonth, today]);

  const greeting = greet();
  const leaveIsMine = leave.allowed && !["admin", "hr_manager"].includes(profile.role);

  return (
    <div className="animate-fade-up">
      <PageHeader
        title={`${greeting}, ${profile.displayName.split(" ")[0]}`}
        description={`${ROLE_LABELS[profile.role]} · ${formatDate(today)}`}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {projects.allowed && (
          <StatCard label="Active projects" value={String(stats.activeProjects.length)} hint={`${projects.data.length} in total`} icon={FolderKanban} href="/projects" loading={projects.loading} />
        )}
        {leads.allowed && (
          <StatCard label="Open leads" value={String(stats.openLeads.length)} hint={`${formatCurrency(sum(stats.openLeads, "estimatedValue"), true)} in pipeline`} icon={Target} accent="violet" href="/crm/leads" loading={leads.loading} />
        )}
        {invoices.allowed && (
          <StatCard label="Outstanding invoices" value={formatCurrency(sum(stats.outstanding, "total"), true)} hint={`${stats.outstanding.length} awaiting payment`} icon={FileText} accent="amber" href="/finance/invoices" loading={invoices.loading} />
        )}
        {invoices.allowed && profile.role !== "client" && (
          <StatCard label="Collected this month" value={formatCurrency(sum(stats.paidThisMonth, "total"), true)} hint={`${stats.paidThisMonth.length} ${stats.paidThisMonth.length === 1 ? "invoice" : "invoices"} paid`} icon={FileText} accent="green" href="/finance/invoices" loading={invoices.loading} />
        )}
        {employees.allowed && (
          <StatCard label="Team members" value={String(stats.activeEmployees)} hint="Active and on notice" icon={Users} accent="cyan" href="/hr/employees" loading={employees.loading} />
        )}
        {attendance.allowed && (
          <StatCard
            label={attendance.data.some((a) => a.userId !== profile.id) ? "Checked in today" : "Your attendance today"}
            value={attendance.data.some((a) => a.userId !== profile.id) ? String(stats.presentToday) : stats.presentToday ? "Checked in" : "Not yet"}
            icon={CalendarCheck}
            accent="green"
            href="/hr/attendance"
            loading={attendance.loading}
          />
        )}
        {leave.allowed && (
          <StatCard label={leaveIsMine ? "Your pending leave" : "Leave to review"} value={String(stats.pendingLeave)} icon={CalendarOff} accent="amber" href="/hr/leave" loading={leave.loading} />
        )}
        {timesheets.allowed && (
          <StatCard label="Hours logged this month" value={String(Math.round(stats.hoursThisMonth * 10) / 10)} icon={Timer} accent="violet" href="/projects/timesheets" loading={timesheets.loading} />
        )}
        {expenses.allowed && (
          <StatCard label="Expenses this month" value={formatCurrency(stats.expensesThisMonth, true)} icon={Receipt} accent="blue" href="/finance/expenses" loading={expenses.loading} />
        )}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-5">
        {projects.allowed && (
          <Card className="xl:col-span-3">
            <SectionTitle title="Projects in progress" href="/projects" />
            {stats.activeProjects.length === 0 ? (
              <p className="px-5 pb-6 text-sm text-muted">No active projects right now.</p>
            ) : (
              <ul className="divide-y divide-line">
                {stats.activeProjects.slice(0, 6).map((p) => (
                  <li key={p.id} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 px-5 py-3 sm:grid-cols-[1fr_10rem_auto]">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">{String(p.name)}</p>
                      <p className="truncate text-xs text-muted">{String(p.clientIdLabel ?? "Internal")} · due {formatDate(p.dueDate)}</p>
                    </div>
                    <div className="order-last col-span-2 sm:order-none sm:col-span-1">
                      <FieldValue field={MODULES.projects!.fields.find((f) => f.name === "progress")!} record={p} />
                    </div>
                    <FieldValue field={MODULES.projects!.fields.find((f) => f.name === "status")!} record={p} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        {leads.allowed && <PipelineCard leads={leads.data} />}
        {!leads.allowed && invoices.allowed && <RevenueCard invoices={invoices.data} />}
      </div>

      {leads.allowed && invoices.allowed && profile.role !== "client" && (
        <div className="mt-6">
          <RevenueCard invoices={invoices.data} />
        </div>
      )}
    </div>
  );
}

function greet(): string {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

function SectionTitle({ title, href }: { title: string; href?: string }) {
  return (
    <div className="flex items-center justify-between px-5 pt-5 pb-3">
      <h2 className="font-display text-base font-semibold text-foreground">{title}</h2>
      {href && <Link href={href} className="text-sm font-medium text-accent hover:underline">View all</Link>}
    </div>
  );
}

function PipelineCard({ leads }: { leads: BaseRecord[] }) {
  const stages = MODULES.leads!.fields.find((f) => f.name === "stage")!.options!;
  const counts = stages.map((s) => ({ ...s, count: leads.filter((l) => l.stage === s.value).length }));
  const max = Math.max(1, ...counts.map((c) => c.count));
  return (
    <Card className="xl:col-span-2">
      <SectionTitle title="Sales pipeline" href="/crm/leads" />
      <ul className="space-y-3 px-5 pb-5">
        {counts.map((c) => (
          <li key={c.value} className="grid grid-cols-[7rem_1fr_2rem] items-center gap-3 text-sm">
            <span className="truncate text-muted">{c.label}</span>
            <span className="h-2 overflow-hidden rounded-full bg-tint-strong">
              <span className="block h-full rounded-full bg-gradient-to-r from-brand-500 to-accent-violet transition-all duration-700" style={{ width: `${(c.count / max) * 100}%` }} />
            </span>
            <span className="text-right font-medium text-foreground tabular-nums">{c.count}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function RevenueCard({ invoices }: { invoices: BaseRecord[] }) {
  const months = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const paid = sum(invoices.filter((inv) => inv.status === "paid" && monthOf(inv.paidDate ?? inv.issueDate) === key), "total");
      const billed = sum(invoices.filter((inv) => inv.status !== "cancelled" && inv.status !== "draft" && monthOf(inv.issueDate) === key), "total");
      return { key, label: d.toLocaleString("en-IN", { month: "short" }), paid, billed };
    });
  }, [invoices]);
  const max = Math.max(1, ...months.flatMap((m) => [m.paid, m.billed]));

  return (
    <Card className="xl:col-span-2">
      <SectionTitle title="Billed vs collected (6 months)" href="/finance/invoices" />
      <div className="px-5 pb-5">
        <div className="flex h-44 items-end gap-3">
          {months.map((m) => (
            <div key={m.key} className="flex flex-1 flex-col items-center gap-2">
              <div className="flex h-36 w-full items-end justify-center gap-1">
                <span title={`Billed ${formatCurrency(m.billed)}`} className="w-1/3 max-w-5 rounded-t bg-brand-500/35" style={{ height: `${(m.billed / max) * 100}%` }} />
                <span title={`Collected ${formatCurrency(m.paid)}`} className="w-1/3 max-w-5 rounded-t bg-gradient-to-t from-brand-600 to-accent-cyan" style={{ height: `${(m.paid / max) * 100}%` }} />
              </div>
              <span className="text-xs text-muted">{m.label}</span>
            </div>
          ))}
        </div>
        <div className="mt-4 flex gap-4 text-xs text-muted">
          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-brand-500/35" /> Billed</span>
          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-brand-600" /> Collected</span>
        </div>
      </div>
    </Card>
  );
}
