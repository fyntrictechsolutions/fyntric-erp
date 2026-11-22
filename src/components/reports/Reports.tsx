"use client";

import { useState } from "react";
import { useProfile } from "@/components/auth/AuthProvider";
import { Loading, Tabs } from "@/components/common/DetailShell";
import { NoAccess } from "@/components/resource/ModulePage";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { inputClasses } from "@/components/ui/fieldStyles";
import { PageHeader } from "@/components/ui/PageHeader";
import { projectsModule } from "@/config/modules/projects";
import { ESTIMATE_STATUS } from "@/config/modules/sales";
import { canRead, type ModuleKey } from "@/config/roles";
import { useModuleRecords } from "@/hooks/useCollection";
import { cn } from "@/lib/cn";
import { asList, formatCurrency, formatDate, todayISO } from "@/lib/format";
import type { BaseRecord } from "@/types";

type Tab = "pnl" | "sales" | "delivery" | "gst" | "assets" | "dues" | "wages";

const TABS: { value: Tab; label: string }[] = [
  { value: "pnl", label: "Profit & Loss" },
  { value: "sales", label: "Sales" },
  { value: "delivery", label: "Delivery" },
  { value: "gst", label: "GST" },
  { value: "assets", label: "Assets & subscriptions" },
  { value: "dues", label: "Dues" },
  { value: "wages", label: "Wages" },
];

const n = (v: unknown) => Number(v) || 0;
const round = (v: number) => Math.round(v * 100) / 100;

/** Indian financial years run April to March. */
function fyOf(date: string) {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  return m >= 4 ? y : y - 1;
}
function fyLabel(start: number) {
  return `FY ${start}-${String(start + 1).slice(2)}`;
}
function fyMonths(start: number) {
  return Array.from({ length: 12 }, (_, i) => {
    const m = ((i + 3) % 12) + 1;
    const y = m >= 4 ? start : start + 1;
    return `${y}-${String(m).padStart(2, "0")}`;
  });
}
const monthName = (ym: string) => new Date(`${ym}-01T00:00:00`).toLocaleDateString("en-IN", { month: "short", year: "2-digit" });

/** Revenue-bearing invoices: raised and not cancelled. */
const liveInvoice = (r: BaseRecord) => r.status !== "draft" && r.status !== "cancelled";
const countedExpense = (r: BaseRecord) => r.status !== "rejected" && r.status !== "pending";

interface Data {
  invoices: BaseRecord[];
  purchases: BaseRecord[];
  expenses: BaseRecord[];
  estimates: BaseRecord[];
  leads: BaseRecord[];
  projects: BaseRecord[];
  timesheets: BaseRecord[];
  can: (m: ModuleKey) => boolean;
}

export function Reports() {
  const profile = useProfile();
  const allowed = canRead(profile.role, "reports");
  const invoices = useModuleRecords("invoices", profile);
  const purchases = useModuleRecords("purchases", profile);
  const expenses = useModuleRecords("expenses", profile);
  const estimates = useModuleRecords("estimates", profile);
  const leads = useModuleRecords("leads", profile);
  const projects = useModuleRecords("projects", profile);
  const timesheets = useModuleRecords("timesheets", profile);
  const thisFy = fyOf(todayISO());
  const [fy, setFy] = useState(thisFy);
  const [tab, setTab] = useState<Tab>("pnl");

  if (!allowed) return <NoAccess />;
  const loading = [invoices, purchases, expenses, estimates, projects].some((q) => q.loading);
  const years = Array.from({ length: Math.max(1, thisFy - 2024 + 1) }, (_, i) => thisFy - i);

  const data: Data = {
    invoices: invoices.data,
    purchases: purchases.data,
    expenses: expenses.data,
    estimates: estimates.data,
    leads: leads.data,
    projects: projects.data,
    timesheets: timesheets.data,
    can: (m) => canRead(profile.role, m),
  };

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Reports"
        description="Figures for the financial year, worked out from invoices, purchase bills, expenses and payments."
        actions={
          <select className={cn(inputClasses.replace("w-full ", ""), "h-10 w-auto")} value={fy} onChange={(e) => setFy(Number(e.target.value))} aria-label="Financial year">
            {years.map((y) => <option key={y} value={y}>{fyLabel(y)}</option>)}
          </select>
        }
      />
      <Tabs<Tab> tabs={TABS} value={tab} onChange={setTab} />
      {loading ? (
        <Loading />
      ) : (
        <>
          {tab === "pnl" && <ProfitLoss data={data} fy={fy} />}
          {tab === "sales" && <Sales data={data} fy={fy} />}
          {tab === "delivery" && <Delivery data={data} fy={fy} />}
          {tab === "gst" && <Gst data={data} fy={fy} />}
          {tab === "assets" && <Assets data={data} fy={fy} />}
          {tab === "dues" && <Dues data={data} />}
          {tab === "wages" && <Wages data={data} fy={fy} />}
        </>
      )}
    </div>
  );
}

// ---------- building blocks ----------

function Tiles({ items }: { items: { label: string; value: string; hint?: string; tone?: "good" | "bad" }[] }) {
  return (
    <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map((t) => (
        <Card key={t.label} className="p-4">
          <p className="text-xs font-medium text-muted">{t.label}</p>
          <p className={cn("mt-1 font-display text-xl font-semibold tabular-nums sm:text-2xl", t.tone === "bad" ? "text-red-600 dark:text-red-400" : t.tone === "good" ? "text-emerald-600 dark:text-emerald-400" : "text-foreground")}>
            {t.value}
          </p>
          {t.hint && <p className="mt-0.5 text-xs text-subtle">{t.hint}</p>}
        </Card>
      ))}
    </div>
  );
}

interface Col {
  label: string;
  align?: "right";
}

function Table({ title, note, cols, rows, foot }: { title: string; note?: string; cols: Col[]; rows: React.ReactNode[][]; foot?: React.ReactNode[] }) {
  return (
    <Card className="mb-6 overflow-hidden">
      <div className="border-b border-line px-5 py-4">
        <h2 className="font-display text-base font-semibold text-foreground">{title}</h2>
        {note && <p className="text-sm text-muted">{note}</p>}
      </div>
      {rows.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted">Nothing for this period.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-tint text-xs tracking-wide text-muted uppercase">
              <tr>{cols.map((c) => <th key={c.label} className={cn("px-4 py-2.5 font-medium whitespace-nowrap", c.align === "right" && "text-right")}>{c.label}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r, i) => (
                <tr key={i}>{r.map((cell, j) => <td key={j} className={cn("px-4 py-2.5 whitespace-nowrap text-body", cols[j]?.align === "right" && "text-right tabular-nums")}>{cell}</td>)}</tr>
              ))}
            </tbody>
            {foot && (
              <tfoot className="border-t-2 border-line font-semibold text-foreground">
                <tr>{foot.map((cell, j) => <td key={j} className={cn("px-4 py-2.5 whitespace-nowrap", cols[j]?.align === "right" && "text-right tabular-nums")}>{cell}</td>)}</tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </Card>
  );
}

/** A label with a bar showing its share of the largest value. */
function Bar({ label, value, max, text }: { label: string; value: number; max: number; text: string }) {
  return (
    <div className="flex min-w-48 items-center gap-3">
      <span className="w-40 truncate">{label}</span>
      <span className="h-2 flex-1 overflow-hidden rounded-full bg-tint-strong">
        <span className="block h-full rounded-full bg-brand-500" style={{ width: `${max ? Math.max(2, (value / max) * 100) : 0}%` }} />
      </span>
      <span className="w-24 text-right tabular-nums">{text}</span>
    </div>
  );
}

const money = (v: number) => formatCurrency(v);
const inFy = (fy: number, field: string) => (r: BaseRecord) => typeof r[field] === "string" && fyOf(r[field] as string) === fy;

function sumBy(rows: BaseRecord[], key: (r: BaseRecord) => string, value: (r: BaseRecord) => number) {
  const m = new Map<string, number>();
  for (const r of rows) m.set(key(r), (m.get(key(r)) ?? 0) + value(r));
  return m;
}

// ---------- reports ----------

function ProfitLoss({ data, fy }: { data: Data; fy: number }) {
  const inv = data.invoices.filter(liveInvoice).filter(inFy(fy, "issueDate"));
  const bills = data.purchases.filter(inFy(fy, "billDate"));
  const exp = data.expenses.filter(countedExpense).filter(inFy(fy, "date"));
  const months = fyMonths(fy);
  const incomeM = sumBy(inv, (r) => String(r.issueDate).slice(0, 7), (r) => n(r.amount));
  const billsM = sumBy(bills, (r) => String(r.billDate).slice(0, 7), (r) => n(r.amount));
  const expM = sumBy(exp, (r) => String(r.date).slice(0, 7), (r) => n(r.amount));
  const income = inv.reduce((s, r) => s + n(r.amount), 0);
  const purchases = bills.reduce((s, r) => s + n(r.amount), 0);
  const expenses = exp.reduce((s, r) => s + n(r.amount), 0);
  const profit = income - purchases - expenses;
  const byCat = [...sumBy(exp, (r) => String(r.category ?? "Other"), (r) => n(r.amount))].sort((a, b) => b[1] - a[1]);
  const billCat = [...sumBy(bills, (r) => String(r.category ?? "Other"), (r) => n(r.amount))].sort((a, b) => b[1] - a[1]);
  const max = Math.max(...byCat.map((c) => c[1]), ...billCat.map((c) => c[1]), 0);

  return (
    <>
      <Tiles
        items={[
          { label: "Income (before GST)", value: money(income), hint: `${inv.length} invoices` },
          { label: "Purchases (before GST)", value: money(purchases), hint: `${bills.length} bills` },
          { label: "Expenses", value: money(expenses), hint: "Approved and reimbursed" },
          { label: profit >= 0 ? "Profit" : "Loss", value: money(Math.abs(profit)), tone: profit >= 0 ? "good" : "bad", hint: income ? `${Math.round((profit / income) * 100)}% margin` : undefined },
        ]}
      />
      <Table
        title="Month by month"
        note="Income is invoiced value (not drafts or cancelled). Purchases and expenses are what was billed or claimed that month."
        cols={[{ label: "Month" }, { label: "Income", align: "right" }, { label: "Purchases", align: "right" }, { label: "Expenses", align: "right" }, { label: "Profit", align: "right" }]}
        rows={months.map((m) => {
          const p = (incomeM.get(m) ?? 0) - (billsM.get(m) ?? 0) - (expM.get(m) ?? 0);
          return [monthName(m), money(incomeM.get(m) ?? 0), money(billsM.get(m) ?? 0), money(expM.get(m) ?? 0), <span key="p" className={p < 0 ? "text-red-600 dark:text-red-400" : undefined}>{money(p)}</span>];
        })}
        foot={["Total", money(income), money(purchases), money(expenses), money(profit)]}
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Table title="Purchases by category" cols={[{ label: "Category" }]} rows={billCat.map(([c, v]) => [<Bar key={c} label={c} value={v} max={max} text={money(v)} />])} />
        <Table title="Expenses by category" cols={[{ label: "Category" }]} rows={byCat.map(([c, v]) => [<Bar key={c} label={c} value={v} max={max} text={money(v)} />])} />
      </div>
    </>
  );
}

function Sales({ data, fy }: { data: Data; fy: number }) {
  const inv = data.invoices.filter(liveInvoice).filter(inFy(fy, "issueDate"));
  const est = data.estimates.filter(inFy(fy, "issueDate"));
  const leads = data.leads.filter((l) => typeof l.createdAt === "number" && fyOf(new Date(l.createdAt).toISOString().slice(0, 10)) === fy);
  const byClient = [...sumBy(inv, (r) => String(r.clientIdLabel ?? "—"), (r) => n(r.amount))].sort((a, b) => b[1] - a[1]);
  const maxClient = byClient[0]?.[1] ?? 0;
  const decided = est.filter((e) => e.status === "approved" || e.status === "rejected");
  const approved = est.filter((e) => e.status === "approved");
  const won = leads.filter((l) => l.stage === "won").length;

  return (
    <>
      <Tiles
        items={[
          { label: "Invoiced (before GST)", value: money(inv.reduce((s, r) => s + n(r.amount), 0)), hint: `${inv.length} invoices` },
          { label: "Estimates sent", value: String(est.filter((e) => e.status !== "draft").length), hint: `${money(est.reduce((s, r) => s + n(r.total), 0))} quoted` },
          { label: "Estimates approved", value: String(approved.length), hint: decided.length ? `${Math.round((approved.length / decided.length) * 100)}% of decided` : "None decided yet" },
          data.can("leads")
            ? { label: "New leads", value: String(leads.length), hint: `${won} won` }
            : { label: "Approved value", value: money(approved.reduce((s, r) => s + n(r.total), 0)) },
        ]}
      />
      <Table title="Sales by client" cols={[{ label: "Client" }]} rows={byClient.map(([c, v]) => [<Bar key={c} label={c} value={v} max={maxClient} text={money(v)} />])} />
      <Table
        title="Estimates by status"
        cols={[{ label: "Status" }, { label: "Count", align: "right" }, { label: "Value (incl. GST)", align: "right" }]}
        rows={ESTIMATE_STATUS.map((s) => {
          const list = est.filter((e) => e.status === s.value);
          return [<Badge key={s.value} tone={s.tone}>{s.label}</Badge>, list.length, money(list.reduce((t, r) => t + n(r.total), 0))];
        })}
      />
      {data.can("leads") && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Table
            title="Leads by source"
            cols={[{ label: "Source" }, { label: "Leads", align: "right" }, { label: "Won", align: "right" }]}
            rows={[...sumBy(leads, (l) => String(l.source ?? "Not set"), () => 1)].sort((a, b) => b[1] - a[1]).map(([src, c]) => [src, c, leads.filter((l) => (l.source ?? "Not set") === src && l.stage === "won").length])}
          />
          <Table
            title="Leads by service"
            cols={[{ label: "Service" }, { label: "Leads", align: "right" }, { label: "Estimated value", align: "right" }]}
            rows={(() => {
              // A lead can ask for several services; it counts under each of them.
              const per = new Map<string, [number, number]>();
              for (const l of leads) for (const svc of asList(l.service).length ? asList(l.service) : ["Not set"]) {
                const [c, v] = per.get(svc) ?? [0, 0];
                per.set(svc, [c + 1, v + n(l.estimatedValue)]);
              }
              return [...per].sort((a, b) => b[1][0] - a[1][0]).map(([svc, [c, v]]) => [svc, c, money(v)]);
            })()}
          />
        </div>
      )}
    </>
  );
}

function Delivery({ data, fy }: { data: Data; fy: number }) {
  const statusOpts = projectsModule.fields.find((f) => f.name === "status")!.options!;
  const today = todayISO();
  const active = data.projects.filter((p) => p.status === "in_progress" || p.status === "planning");
  const late = active.filter((p) => typeof p.dueDate === "string" && p.dueDate < today);
  const completed = data.projects.filter((p) => p.status === "completed");
  const hours = data.timesheets.filter(inFy(fy, "date"));
  const byProject = [...sumBy(hours, (t) => String(t.projectIdLabel ?? "—"), (t) => n(t.hours))].sort((a, b) => b[1] - a[1]);
  const billable = hours.filter((t) => t.billable === "yes").reduce((s, t) => s + n(t.hours), 0);
  const total = hours.reduce((s, t) => s + n(t.hours), 0);
  const invoicedBy = sumBy(data.invoices.filter(liveInvoice), (r) => String(r.projectId ?? ""), (r) => n(r.amount));

  return (
    <>
      <Tiles
        items={[
          { label: "Active projects", value: String(active.length) },
          { label: "Past due date", value: String(late.length), tone: late.length ? "bad" : undefined },
          { label: "Completed", value: String(completed.length) },
          data.can("timesheets")
            ? { label: "Hours logged", value: String(round(total)), hint: total ? `${Math.round((billable / total) * 100)}% billable` : undefined }
            : { label: "All projects", value: String(data.projects.length) },
        ]}
      />
      <Table
        title="Projects"
        note="IT delivery in place of production: progress, deadline, budget and what has been invoiced so far."
        cols={[{ label: "Project" }, { label: "Client" }, { label: "Due" }, { label: "Progress", align: "right" }, { label: "Budget", align: "right" }, { label: "Invoiced", align: "right" }, { label: "Status" }]}
        rows={[...data.projects]
          .sort((a, b) => String(a.dueDate ?? "9").localeCompare(String(b.dueDate ?? "9")))
          .map((p) => {
            const st = statusOpts.find((o) => o.value === p.status);
            const isLate = typeof p.dueDate === "string" && p.dueDate < today && p.status !== "completed" && p.status !== "cancelled";
            return [
              String(p.name ?? "—"),
              String(p.clientIdLabel ?? "—"),
              <span key="d" className={isLate ? "text-red-600 dark:text-red-400" : undefined}>{formatDate(p.dueDate)}</span>,
              `${n(p.progress)}%`,
              p.budget ? money(n(p.budget)) : "—",
              money(invoicedBy.get(p.id) ?? 0),
              st ? <Badge key="s" tone={st.tone}>{st.label}</Badge> : "—",
            ];
          })}
      />
      {data.can("timesheets") && (
        <Table
          title="Hours by project"
          cols={[{ label: "Project" }]}
          rows={byProject.map(([p, h]) => [<Bar key={p} label={p} value={h} max={byProject[0][1]} text={`${round(h)} h`} />])}
        />
      )}
    </>
  );
}

function Gst({ data, fy }: { data: Data; fy: number }) {
  const inv = data.invoices.filter(liveInvoice).filter(inFy(fy, "issueDate"));
  const bills = data.purchases.filter(inFy(fy, "billDate"));
  const out = sumBy(inv, (r) => String(r.issueDate).slice(0, 7), (r) => n(r.total) - n(r.amount));
  const inp = sumBy(bills, (r) => String(r.billDate).slice(0, 7), (r) => n(r.total) - n(r.amount));
  const taxable = sumBy(inv, (r) => String(r.issueDate).slice(0, 7), (r) => n(r.amount));
  const months = fyMonths(fy);
  const totOut = [...out.values()].reduce((a, b) => a + b, 0);
  const totIn = [...inp.values()].reduce((a, b) => a + b, 0);
  const net = totOut - totIn;
  return (
    <>
      <Tiles
        items={[
          { label: "Output GST (on sales)", value: money(totOut) },
          { label: "Input GST (on purchases)", value: money(totIn) },
          { label: net >= 0 ? "Net GST payable" : "Input credit carried", value: money(Math.abs(net)), tone: net > 0 ? "bad" : "good" },
          { label: "Taxable sales", value: money([...taxable.values()].reduce((a, b) => a + b, 0)) },
        ]}
      />
      <Table
        title="GST by month"
        note="A guide for filing. Expense claims aren't included because they don't record GST separately; check with your accountant before filing."
        cols={[{ label: "Month" }, { label: "Taxable sales", align: "right" }, { label: "Output GST", align: "right" }, { label: "Input GST", align: "right" }, { label: "Net", align: "right" }]}
        rows={months.map((m) => [monthName(m), money(taxable.get(m) ?? 0), money(out.get(m) ?? 0), money(inp.get(m) ?? 0), money((out.get(m) ?? 0) - (inp.get(m) ?? 0))])}
        foot={["Total", money([...taxable.values()].reduce((a, b) => a + b, 0)), money(totOut), money(totIn), money(net)]}
      />
    </>
  );
}

function Assets({ data, fy }: { data: Data; fy: number }) {
  const today = todayISO();
  const bills = data.purchases.filter(inFy(fy, "billDate"));
  const subs = data.purchases.filter((b) => b.isSubscription);
  // Latest bill per supplier + item stands for the live subscription.
  const latest = new Map<string, BaseRecord>();
  for (const s of subs) {
    const key = `${s.supplierId ?? ""}:${s.category ?? ""}:${String(s.description ?? "").slice(0, 40)}`;
    const cur = latest.get(key);
    if (!cur || String(s.billDate) > String(cur.billDate)) latest.set(key, s);
  }
  const live = [...latest.values()].sort((a, b) => String(a.renewalDate ?? "9").localeCompare(String(b.renewalDate ?? "9")));
  const monthlyCost = live.reduce((s, b) => s + (b.billingCycle === "annually" ? n(b.total) / 12 : n(b.total)), 0);
  const assetCats = bills.filter((b) => !b.isSubscription);
  const byCat = [...sumBy(assetCats, (b) => String(b.category ?? "Other"), (b) => n(b.total))].sort((a, b) => b[1] - a[1]);
  const soon = live.filter((b) => typeof b.renewalDate === "string" && b.renewalDate >= today && b.renewalDate <= addDaysIso(today, 30));

  return (
    <>
      <Tiles
        items={[
          { label: "Bought this year (incl. GST)", value: money(assetCats.reduce((s, b) => s + n(b.total), 0)), hint: "Furniture, hardware and other one-off purchases" },
          { label: "Active subscriptions", value: String(live.length) },
          { label: "Subscriptions per month", value: money(monthlyCost), hint: "Annual plans spread over 12 months" },
          { label: "Renewing in 30 days", value: String(soon.length), tone: soon.length ? "bad" : undefined },
        ]}
      />
      <Table
        title="Purchases by category"
        note="IT company version of stock value: what the company owns, from purchase bills that aren't subscriptions."
        cols={[{ label: "Category" }]}
        rows={byCat.map(([c, v]) => [<Bar key={c} label={c} value={v} max={byCat[0][1]} text={money(v)} />])}
      />
      <Table
        title="Subscriptions"
        cols={[{ label: "Supplier" }, { label: "What" }, { label: "Renews", align: "right" }, { label: "Cost", align: "right" }, { label: "Next renewal", align: "right" }]}
        rows={live.map((b) => [
          String(b.supplierIdLabel ?? "—"),
          <span key="w" className="block max-w-xs truncate">{String(b.description || b.category || "—")}</span>,
          b.billingCycle === "annually" ? "Yearly" : b.billingCycle === "monthly" ? "Monthly" : "—",
          money(n(b.total)),
          <span key="r" className={typeof b.renewalDate === "string" && b.renewalDate < today ? "text-red-600 dark:text-red-400" : undefined}>{formatDate(b.renewalDate)}</span>,
        ])}
      />
    </>
  );
}

function addDaysIso(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const BUCKETS = ["Not yet due", "1-30 days", "31-60 days", "61-90 days", "Over 90 days"];
function bucketOf(due: unknown, today: string) {
  if (typeof due !== "string" || !due || due >= today) return 0;
  const days = Math.round((new Date(`${today}T00:00:00`).getTime() - new Date(`${due}T00:00:00`).getTime()) / 86_400_000);
  return days <= 30 ? 1 : days <= 60 ? 2 : days <= 90 ? 3 : 4;
}

function Dues({ data }: { data: Data }) {
  const today = todayISO();
  const receivable = data.invoices.filter((r) => liveInvoice(r) && n(r.balance ?? r.total) > 0 && r.status !== "paid");
  const payable = data.purchases.filter((r) => n(r.balance ?? r.total) > 0 && r.status !== "paid");
  const ageing = (rows: BaseRecord[]) => {
    const b = [0, 0, 0, 0, 0];
    for (const r of rows) b[bucketOf(r.dueDate, today)] += n(r.balance ?? r.total);
    return b;
  };
  const ra = ageing(receivable);
  const pa = ageing(payable);
  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
  const overdueR = sum(ra.slice(1));

  return (
    <>
      <Tiles
        items={[
          { label: "To receive", value: money(sum(ra)), hint: `${receivable.length} invoices` },
          { label: "Overdue from clients", value: money(overdueR), tone: overdueR ? "bad" : undefined },
          { label: "To pay suppliers", value: money(sum(pa)), hint: `${payable.length} bills` },
          { label: "Overdue to suppliers", value: money(sum(pa.slice(1))), tone: sum(pa.slice(1)) ? "bad" : undefined },
        ]}
      />
      <Table
        title="Ageing"
        note="Unpaid balances grouped by how long past the due date they are."
        cols={[{ label: "" }, ...BUCKETS.map((b) => ({ label: b, align: "right" as const })), { label: "Total", align: "right" }]}
        rows={[
          ["Clients owe us", ...ra.map(money), money(sum(ra))],
          ["We owe suppliers", ...pa.map(money), money(sum(pa))],
        ]}
      />
      <Table
        title="Unpaid invoices"
        cols={[{ label: "Invoice" }, { label: "Client" }, { label: "Due", align: "right" }, { label: "Total", align: "right" }, { label: "Balance", align: "right" }, { label: "Age" }]}
        rows={[...receivable].sort((a, b) => String(a.dueDate ?? "9").localeCompare(String(b.dueDate ?? "9"))).map((r) => [String(r.invoiceNumber ?? "—"), String(r.clientIdLabel ?? "—"), formatDate(r.dueDate), money(n(r.total)), money(n(r.balance ?? r.total)), BUCKETS[bucketOf(r.dueDate, today)]])}
      />
      <Table
        title="Unpaid purchase bills"
        cols={[{ label: "Bill" }, { label: "Supplier" }, { label: "Due", align: "right" }, { label: "Total", align: "right" }, { label: "Balance", align: "right" }, { label: "Age" }]}
        rows={[...payable].sort((a, b) => String(a.dueDate ?? "9").localeCompare(String(b.dueDate ?? "9"))).map((r) => [String(r.billNumber ?? "—"), String(r.supplierIdLabel ?? "—"), formatDate(r.dueDate), money(n(r.total)), money(n(r.balance ?? r.total)), BUCKETS[bucketOf(r.dueDate, today)]])}
      />
    </>
  );
}

function Wages({ data, fy }: { data: Data; fy: number }) {
  const wages = data.expenses.filter((e) => /salar|wage|payroll|stipend/i.test(String(e.category ?? ""))).filter(countedExpense).filter(inFy(fy, "date"));
  const months = fyMonths(fy);
  const byMonth = sumBy(wages, (e) => String(e.date).slice(0, 7), (e) => n(e.amount));
  const total = wages.reduce((s, e) => s + n(e.amount), 0);
  const paidMonths = months.filter((m) => byMonth.get(m)).length;
  const max = Math.max(0, ...byMonth.values());
  return (
    <>
      <Tiles
        items={[
          { label: "Wages this year", value: money(total), hint: `${wages.length} entries` },
          { label: "Average per month", value: money(paidMonths ? total / paidMonths : 0), hint: `${paidMonths} months with wages` },
          { label: "Highest month", value: money(max) },
          { label: "Share of spending", value: (() => {
            const spend = data.expenses.filter(countedExpense).filter(inFy(fy, "date")).reduce((s, e) => s + n(e.amount), 0) + data.purchases.filter(inFy(fy, "billDate")).reduce((s, b) => s + n(b.amount), 0);
            return spend ? `${Math.round((total / spend) * 100)}%` : "—";
          })() },
        ]}
      />
      <Table
        title="Wages by month"
        note={'From expenses in the "Salaries" category. Payslips marked paid in HR → Payroll are added there automatically, dated the day they were paid.'}
        cols={[{ label: "Month" }]}
        rows={months.map((m) => [<Bar key={m} label={monthName(m)} value={byMonth.get(m) ?? 0} max={max} text={money(byMonth.get(m) ?? 0)} />])}
        foot={[`Total ${money(total)}`]}
      />
      <Table
        title="Entries"
        cols={[{ label: "Date" }, { label: "Description" }, { label: "Added by" }, { label: "Amount", align: "right" }]}
        rows={[...wages].sort((a, b) => String(b.date).localeCompare(String(a.date))).map((e) => [formatDate(e.date), <span key="d" className="block max-w-sm truncate">{String(e.description ?? "—")}</span>, String(e.userName ?? "—"), money(n(e.amount))])}
      />
    </>
  );
}

