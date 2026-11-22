"use client";

import { ChevronDown, Mail, MessageCircle, Phone, Search } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useProfile } from "@/components/auth/AuthProvider";
import { useSettings } from "@/components/settings/SettingsProvider";
import { Card } from "@/components/ui/Card";
import { inputClasses } from "@/components/ui/fieldStyles";
import { PageHeader } from "@/components/ui/PageHeader";
import { canRead, INTERNAL_ROLES, ROLE_LABELS, type ModuleKey, type Role } from "@/config/roles";
import { cn } from "@/lib/cn";
import { whatsAppHref } from "@/lib/share";

interface Topic {
  title: string;
  /** Shown only to people who can open this part of the app. */
  module?: ModuleKey;
  roles?: Role[];
  href?: string;
  steps: string[];
}

interface Section {
  title: string;
  topics: Topic[];
}

const GUIDE: Section[] = [
  {
    title: "Getting started",
    topics: [
      {
        title: "Signing in and your role",
        steps: [
          "Sign in with your work email. A new account waits for an admin to give it a role; until then you'll see a waiting screen.",
          "Your role decides which menus you see and what you can change. Ask an admin if something you need is missing.",
          "Switch between light and dark with the sun/moon button at the top, or in Settings → App.",
        ],
      },
      {
        title: "Finding your way around",
        steps: [
          "The menu on the left (the ☰ button on a phone) is grouped into HR, Sales, Delivery, Purchases, Finance and Insights.",
          "Every list has a search box and status filters at the top. Click a row to open its details.",
          "Changes save as soon as you press Save; there's no separate publish step.",
        ],
      },
    ],
  },
  {
    title: "Your day",
    topics: [
      {
        title: "Checking in and out",
        module: "attendance",
        roles: INTERNAL_ROLES,
        href: "/hr/attendance",
        steps: ["Open My Attendance and press Check in when you start work, and Check out when you leave.", "A check-in after the office opening time shows as late. The calendar shows each day's hours."],
      },
      {
        title: "Applying for leave",
        module: "leave",
        roles: INTERNAL_ROLES,
        href: "/hr/leave",
        steps: ["Open Leave → New leave, pick the dates and type, and add a reason.", "HR approves or rejects it; you can edit or cancel it while it's still pending."],
      },
      {
        title: "Timesheets and expense claims",
        module: "timesheets",
        roles: INTERNAL_ROLES,
        steps: [
          "Timesheets: log the hours you spent on each project.",
          "Expenses: add what you paid for work with the bill amount and category. It stays Pending until an admin approves and reimburses it.",
        ],
      },
      {
        title: "Your payslips",
        module: "payroll",
        roles: ["project_manager", "sales", "staff"],
        href: "/hr/payroll",
        steps: ["Open Payroll to see each month's payslip once HR marks it paid.", "Open a month and press Download PDF to save or print it."],
      },
    ],
  },
  {
    title: "Sales",
    topics: [
      {
        title: "Adding a lead",
        module: "leads",
        href: "/crm/leads",
        steps: [
          "Leads → New lead. Pick every service they're interested in (you can choose more than one).",
          "If you've already spoken to them, write what you discussed in Summary of discussion: it's saved on the lead's first call in the follow-up list.",
          "Change a lead's stage straight from the list or the lead page with the coloured stage dropdown; there's no need to open Edit.",
          "When a deal is won, press Convert to client on the lead page.",
        ],
      },
      {
        title: "Follow-ups",
        module: "followups",
        steps: ["On a lead's page, press Add under Follow-ups to plan a call or meeting.", "After the call, edit it, set it to Done and write the summary of discussion."],
      },
      {
        title: "Making an estimate",
        module: "estimates",
        href: "/crm/estimates",
        steps: [
          "Estimates → New estimate (or New estimate on a lead's page). Add items from your products, or type your own.",
          "Each line is one-time, yearly or monthly. Totals are shown separately for each kind.",
          "A discount box appears for each kind of charge you've added: one-time total, annual recurring and monthly recurring.",
          "Open the estimate to print it, download it, or share it on WhatsApp or email.",
        ],
      },
      {
        title: "Products and the sales gallery",
        module: "products",
        steps: [
          "Products & services is your price list; estimates fill prices from it.",
          "Gallery holds photos, brochures and demo videos. Make a file public to share its link with clients.",
        ],
      },
    ],
  },
  {
    title: "Finance",
    topics: [
      {
        title: "Raising an invoice",
        module: "invoices",
        href: "/finance/invoices",
        steps: [
          "Invoices → New invoice. To save typing, pick a saved estimate in Fill from estimate: its items, discount, notes and client are filled in, and you can change anything before saving.",
          "Leave the invoice number blank to get the next number automatically.",
          "Open the invoice to print it or send it to the client.",
        ],
      },
      {
        title: "Recording payments",
        module: "payments",
        steps: ["Payments → New payment, pick the invoice and amount. The invoice becomes Part paid or Paid by itself.", "Open a payment to print or share the receipt."],
      },
      {
        title: "Purchases and expenses",
        module: "purchases",
        steps: ["Purchases: record bills from suppliers.", "Expenses: approve staff claims and mark them reimbursed. Salaries from Payroll appear here automatically as one Salaries entry a month."],
      },
    ],
  },
  {
    title: "HR",
    topics: [
      {
        title: "Employees and salary structures",
        module: "employees",
        href: "/hr/employees",
        steps: [
          "A team member's employee record is made when you approve or invite them.",
          "On an employee's page, the Salary tab holds their monthly salary structure (Basic, HRA and so on). Revise it when their pay changes; the history is kept.",
        ],
      },
      {
        title: "Running payroll",
        module: "payroll",
        roles: ["admin", "hr_manager"],
        href: "/hr/payroll",
        steps: [
          "Open Payroll and pick the month. Press Prepare all, or Prepare payslip for one person.",
          "Each payslip starts from the salary structure. Enter unpaid (LOP) days and the salary is cut in proportion; add bonus or other earnings, and TDS or advances under deductions.",
          "PF, ESI and professional tax are suggested from Settings → Defaults.",
          "Salespeople get commission on the invoices they raised that month (value before GST), using the slabs in Settings → Defaults.",
          "Open a payslip and press Mark as paid when the salary is transferred. It's then added to expenses, reports and the dashboard.",
          "Download PDF saves the payslip; Email to employee sends it to their work email.",
        ],
      },
      {
        title: "Hiring and offer letters",
        module: "candidates",
        steps: ["Hiring tracks each candidate through the interview rounds.", "Prepare the offer letter from the candidate's page; its wording comes from Settings → Offer letter."],
      },
    ],
  },
  {
    title: "Admin",
    topics: [
      {
        title: "Users and roles",
        module: "users",
        href: "/admin/users",
        steps: ["Approve new sign-ups and give each person a role, or invite someone by email.", "Turn an account off when someone leaves; their records stay."],
      },
      {
        title: "Settings",
        module: "settings",
        href: "/settings",
        steps: [
          "Business: company details and logo, printed on estimates, invoices, receipts, offer letters and payslips.",
          "Lists: the options in dropdowns (services, lead sources, expense categories…).",
          "Defaults: office hours, GST, estimate terms, sales commission slabs and payroll deductions.",
          "App: theme for now; language and subscription options will go here later.",
        ],
      },
      {
        title: "Reports and the activity log",
        module: "reports",
        steps: ["Reports show sales, income, spending, wages and profit for each financial year.", "The activity log (admins) shows who changed what, and when."],
      },
    ],
  },
];

export function HelpPage() {
  const profile = useProfile();
  const { business } = useSettings();
  const [term, setTerm] = useState("");
  const role = profile.role as Role;
  const q = term.trim().toLowerCase();
  const sections = GUIDE.map((s) => ({
    ...s,
    topics: s.topics.filter(
      (t) =>
        (!t.module || canRead(role, t.module)) &&
        (!t.roles || t.roles.includes(role)) &&
        (!q || t.title.toLowerCase().includes(q) || t.steps.some((x) => x.toLowerCase().includes(q))),
    ),
  })).filter((s) => s.topics.length);
  const phoneDigits = business.supportPhone.replace(/\D/g, "");

  return (
    <div className="animate-fade-up">
      <PageHeader title="Help & support" description={`How to use the app as ${ROLE_LABELS[profile.role]}, and how to reach us when you're stuck.`} />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        {business.supportPhone && (
          <a href={`tel:${phoneDigits}`} className="group">
            <Card className="flex items-center gap-3 p-4 transition-colors group-hover:bg-tint">
              <Phone className="size-5 text-accent" />
              <div>
                <p className="text-xs text-muted">Helpline</p>
                <p className="font-medium text-foreground">{business.supportPhone}</p>
              </div>
            </Card>
          </a>
        )}
        {phoneDigits && (
          <a href={whatsAppHref(business.supportPhone, "Hi, I need help with Fyntric ERP: ")} target="_blank" rel="noreferrer" className="group">
            <Card className="flex items-center gap-3 p-4 transition-colors group-hover:bg-tint">
              <MessageCircle className="size-5 text-emerald-600" />
              <div>
                <p className="text-xs text-muted">WhatsApp</p>
                <p className="font-medium text-foreground">Chat with support</p>
              </div>
            </Card>
          </a>
        )}
        {business.supportEmail && (
          <a href={`mailto:${business.supportEmail}?subject=${encodeURIComponent("Help with Fyntric ERP")}`} className="group">
            <Card className="flex items-center gap-3 p-4 transition-colors group-hover:bg-tint">
              <Mail className="size-5 text-accent" />
              <div className="min-w-0">
                <p className="text-xs text-muted">Email</p>
                <p className="truncate font-medium text-foreground">{business.supportEmail}</p>
              </div>
            </Card>
          </a>
        )}
      </div>

      <div className="relative mb-4">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
        <input type="search" aria-label="Search the guide" placeholder="Search the guide, e.g. payslip, discount, leave" className={cn(inputClasses, "pl-9")} value={term} onChange={(e) => setTerm(e.target.value)} />
      </div>

      {sections.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted">Nothing in the guide matches “{term}”. Call or email us and we&apos;ll help.</Card>
      ) : (
        <div className="space-y-6">
          {sections.map((s) => (
            <section key={s.title}>
              <h2 className="mb-2 font-display text-base font-semibold text-foreground">{s.title}</h2>
              <Card className="divide-y divide-line overflow-hidden">
                {s.topics.map((t) => (
                  <details key={t.title} className="group" open={Boolean(q)}>
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-3.5 text-sm font-medium text-foreground hover:bg-tint [&::-webkit-details-marker]:hidden">
                      {t.title}
                      <ChevronDown className="size-4 shrink-0 text-subtle transition-transform group-open:rotate-180" />
                    </summary>
                    <div className="px-5 pb-4">
                      <ol className="list-decimal space-y-1.5 pl-5 text-sm text-body">
                        {t.steps.map((x, i) => (
                          <li key={i}>{x}</li>
                        ))}
                      </ol>
                      {t.href && (
                        <Link href={t.href} className="mt-3 inline-block text-sm font-medium text-accent hover:underline">
                          Go there →
                        </Link>
                      )}
                    </div>
                  </details>
                ))}
              </Card>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
