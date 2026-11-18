"use client";

import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  Timestamp,
  where,
  type QueryConstraint,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { ChevronDown, ChevronRight, Download, History, RefreshCw, Search } from "lucide-react";
import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useProfile } from "@/components/auth/AuthProvider";
import { NoAccess } from "@/components/resource/ModulePage";
import { Badge, type Tone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { inputClasses } from "@/components/ui/fieldStyles";
import { PageHeader } from "@/components/ui/PageHeader";
import { MODULES } from "@/config/modules";
import { canRead, MODULE_LABELS, ROLE_LABELS, type ModuleKey, type Role } from "@/config/roles";
import type { LogAction, LogEntry } from "@/lib/audit";
import { cn } from "@/lib/cn";
import { db } from "@/lib/firebase";
import { todayISO } from "@/lib/format";

const PAGE = 100;

const ACTIONS: Record<LogAction, { label: string; tone: Tone }> = {
  login: { label: "Signed in", tone: "blue" },
  session: { label: "Opened app", tone: "neutral" },
  logout: { label: "Signed out", tone: "neutral" },
  create: { label: "Added", tone: "green" },
  update: { label: "Edited", tone: "amber" },
  delete: { label: "Deleted", tone: "red" },
};

/** Collections written outside the module list, named for people. */
const EXTRA_NAMES: Record<string, string> = { gallery: "Gallery", files: "Files", invites: "Invitations", settings: "Settings", users: "Users", salaries: "Salary structure", exits: "Resignations" };

const moduleName = (m: string | null) => (m ? (MODULE_LABELS[m as ModuleKey] ?? EXTRA_NAMES[m] ?? m) : "");

/** Where a logged record can be opened, if anywhere. */
function recordHref(e: LogEntry): string | null {
  if (!e.module || !e.recordId || e.action === "delete") return null;
  if (e.module === "salaries" || e.module === "exits") return `/hr/employees/view?id=${e.recordId}`;
  if (e.module === "settings") return "/settings";
  if (e.module === "gallery") return `/crm/gallery?file=${e.recordId}`;
  if (e.module === "users" || e.module === "invites") return "/admin/users";
  const def = MODULES[e.module as ModuleKey];
  return def?.detailHref ? def.detailHref(e.recordId) : def ? def.href : null;
}

const timeOf = (e: LogEntry) => (e.at ? new Date(e.at.toMillis()) : null);
const fmtTime = (d: Date | null) =>
  d ? d.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "Saving…";

interface PageResult {
  rows: LogEntry[];
  cursor: QueryDocumentSnapshot | null;
  more: boolean;
}

/** One page of entries, newest first. Dates are local days: from the start of `from` to the end of `to`. */
async function fetchPage(from: string, to: string, after: QueryDocumentSnapshot | null): Promise<PageResult> {
  const parts: QueryConstraint[] = [];
  if (from) parts.push(where("at", ">=", Timestamp.fromDate(new Date(`${from}T00:00:00`))));
  if (to) parts.push(where("at", "<", Timestamp.fromDate(new Date(new Date(`${to}T00:00:00`).getTime() + 86400000))));
  parts.push(orderBy("at", "desc"));
  if (after) parts.push(startAfter(after));
  parts.push(limit(PAGE));
  const snap = await getDocs(query(collection(db(), "logs"), ...parts));
  return { rows: snap.docs.map((d) => ({ id: d.id, ...d.data() }) as LogEntry), cursor: snap.docs.at(-1) ?? null, more: snap.docs.length === PAGE };
}

export function ActivityLog() {
  const profile = useProfile();
  if (!canRead(profile.role, "logs")) return <NoAccess />;
  return <ActivityLogPage />;
}

function ActivityLogPage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [rows, setRows] = useState<LogEntry[]>([]);
  const [cursor, setCursor] = useState<QueryDocumentSnapshot | null>(null);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<LogAction | "changes" | "">("");
  const [mod, setMod] = useState("");
  const [user, setUser] = useState("");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const [nonce, setNonce] = useState(0);

  const apply = useCallback((res: PageResult, append: boolean) => {
    setRows((r) => (append ? [...r, ...res.rows] : res.rows));
    setCursor(res.cursor);
    setMore(res.more);
    setError(null);
    setLoading(false);
  }, []);
  const fail = useCallback((e: unknown) => {
    setError(e instanceof Error ? e.message : String(e));
    setLoading(false);
  }, []);

  // First page, again whenever the date range changes or Refresh is pressed.
  useEffect(() => {
    let live = true;
    fetchPage(from, to, null).then(
      (res) => live && apply(res, false),
      (e) => live && fail(e),
    );
    return () => {
      live = false;
    };
  }, [from, to, nonce, apply, fail]);

  const users = useMemo(() => [...new Map(rows.map((r) => [r.userId, `${r.userName || r.userEmail}`])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [rows]);
  const modules = useMemo(() => [...new Set(rows.map((r) => r.module).filter(Boolean) as string[])].sort((a, b) => moduleName(a).localeCompare(moduleName(b))), [rows]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (action === "changes" ? !["create", "update", "delete"].includes(r.action) : action && r.action !== action) return false;
      if (mod && r.module !== mod) return false;
      if (user && r.userId !== user) return false;
      if (!q) return true;
      return [r.userName, r.userEmail, r.ip, r.location, r.recordLabel, r.note, moduleName(r.module), ...r.changes.flatMap((c) => [c.field, c.from, c.to])]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [rows, action, mod, user, search]);

  const refresh = () => {
    setLoading(true);
    setNonce((n) => n + 1);
  };
  const loadOlder = () => {
    setLoading(true);
    fetchPage(from, to, cursor).then((res) => apply(res, true), fail);
  };
  const setRange = (which: "from" | "to", value: string) => {
    setLoading(true);
    if (which === "from") setFrom(value);
    else setTo(value);
  };

  const exportCsv = () => {
    const head = ["Time", "User", "Email", "Role", "Action", "Section", "Record", "Record ID", "Changes", "Note", "IP address", "Location", "Device", "Page"];
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = shown.map((r) =>
      [
        timeOf(r)?.toISOString() ?? "",
        r.userName,
        r.userEmail,
        ROLE_LABELS[r.role as Role] ?? r.role,
        ACTIONS[r.action]?.label ?? r.action,
        moduleName(r.module),
        r.recordLabel,
        r.recordId,
        r.changes.map((c) => `${c.field}: ${c.from ?? "—"} → ${c.to ?? "—"}`).join("; "),
        r.note,
        r.ip,
        r.location,
        r.device,
        r.path,
      ]
        .map(esc)
        .join(","),
    );
    const blob = new Blob([[head.map(esc).join(","), ...lines].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `activity-log-${todayISO()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const select = cn(inputClasses.replace("w-full ", ""), "h-10 w-auto");

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Activity log"
        description="Every sign-in, sign-out and change to data, with who did it, when, and from where. Entries can't be edited or deleted."
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={refresh} disabled={loading}>
              <RefreshCw className={cn("size-4", loading && "animate-spin")} /> Refresh
            </Button>
            <Button variant="secondary" onClick={exportCsv} disabled={!shown.length}>
              <Download className="size-4" /> Export CSV
            </Button>
          </div>
        }
      />

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-line p-4 lg:flex-row lg:flex-wrap lg:items-center">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" aria-hidden />
            <input className={cn(inputClasses, "h-10 pl-9")} placeholder="Search name, email, IP, record, value…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search the log" />
          </div>
          <div className="flex flex-wrap gap-2">
            <select className={select} value={action} onChange={(e) => setAction(e.target.value as LogAction | "")} aria-label="Action">
              <option value="">All actions</option>
              <option value="changes">Data changes only</option>
              {(Object.keys(ACTIONS) as LogAction[]).map((a) => (
                <option key={a} value={a}>{ACTIONS[a].label}</option>
              ))}
            </select>
            <select className={select} value={mod} onChange={(e) => setMod(e.target.value)} aria-label="Section">
              <option value="">All sections</option>
              {modules.map((m) => (
                <option key={m} value={m}>{moduleName(m)}</option>
              ))}
            </select>
            <select className={select} value={user} onChange={(e) => setUser(e.target.value)} aria-label="User">
              <option value="">Everyone</option>
              {users.map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </select>
            <label className="flex items-center gap-1.5 text-sm text-muted">
              From
              <input type="date" className={select} value={from} max={to || undefined} onChange={(e) => setRange("from", e.target.value)} />
            </label>
            <label className="flex items-center gap-1.5 text-sm text-muted">
              To
              <input type="date" className={select} value={to} min={from || undefined} onChange={(e) => setRange("to", e.target.value)} />
            </label>
          </div>
        </div>

        {error && <p className="m-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">Couldn&apos;t load the log: {error}</p>}

        {!loading && !error && shown.length === 0 ? (
          <EmptyState icon={History} title="Nothing logged here" description={rows.length ? "No entries match these filters." : "Entries appear as people sign in and change data."} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead className="bg-tint text-xs tracking-wide text-muted uppercase">
                <tr>
                  <th className="w-8 px-3 py-2.5" />
                  <th className="px-3 py-2.5 font-medium">Time</th>
                  <th className="px-3 py-2.5 font-medium">User</th>
                  <th className="px-3 py-2.5 font-medium">Action</th>
                  <th className="px-3 py-2.5 font-medium">What</th>
                  <th className="px-3 py-2.5 font-medium">IP address</th>
                  <th className="px-3 py-2.5 font-medium">Device</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {shown.map((r) => {
                  const a = ACTIONS[r.action] ?? { label: r.action, tone: "neutral" as Tone };
                  const href = recordHref(r);
                  const expandable = r.changes.length > 0;
                  const isOpen = open === r.id;
                  return (
                    <Fragment key={r.id}>
                      <tr className={cn("align-top", expandable && "cursor-pointer hover:bg-tint")} onClick={() => expandable && setOpen(isOpen ? null : r.id)}>
                        <td className="px-3 py-3 text-subtle">
                          {expandable && (isOpen ? <ChevronDown className="size-4" aria-label="Hide changes" /> : <ChevronRight className="size-4" aria-label="Show changes" />)}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-body tabular-nums">{fmtTime(timeOf(r))}</td>
                        <td className="px-3 py-3">
                          <p className="font-medium text-foreground">{r.userName || "—"}</p>
                          <p className="text-xs text-muted">{r.userEmail}</p>
                          {r.role && <p className="text-xs text-subtle">{ROLE_LABELS[r.role as Role] ?? r.role}</p>}
                        </td>
                        <td className="px-3 py-3"><Badge tone={a.tone}>{a.label}</Badge></td>
                        <td className="px-3 py-3">
                          {r.module ? (
                            <>
                              <p className="text-foreground">
                                {moduleName(r.module)}
                                {r.recordLabel && (
                                  <>
                                    {" · "}
                                    {href ? (
                                      <Link href={href} onClick={(e) => e.stopPropagation()} className="text-brand-600 hover:underline dark:text-brand-300">{r.recordLabel}</Link>
                                    ) : (
                                      <span>{r.recordLabel}</span>
                                    )}
                                  </>
                                )}
                              </p>
                              {expandable && <p className="text-xs text-muted">{r.changes.length} {r.changes.length === 1 ? "field" : "fields"}{r.action === "update" ? " changed" : ""}</p>}
                            </>
                          ) : null}
                          {r.note && <p className="text-xs text-muted">{r.note}</p>}
                        </td>
                        <td className="px-3 py-3">
                          <p className="text-body tabular-nums">{r.ip ?? "—"}</p>
                          {r.location && <p className="text-xs text-muted">{r.location}</p>}
                        </td>
                        <td className="px-3 py-3 text-xs text-muted">
                          <p>{r.device}</p>
                          {r.path && <p className="max-w-48 truncate text-subtle" title={r.path}>{r.path}</p>}
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="bg-tint/60">
                          <td />
                          <td colSpan={6} className="px-3 pb-4">
                            <table className="w-full text-xs">
                              <thead className="text-muted">
                                <tr>
                                  <th className="py-1.5 pr-4 text-left font-medium">Field</th>
                                  {r.action !== "create" && <th className="py-1.5 pr-4 text-left font-medium">Before</th>}
                                  {r.action !== "delete" && <th className="py-1.5 text-left font-medium">After</th>}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-line">
                                {r.changes.map((c) => (
                                  <tr key={c.field} className="align-top">
                                    <td className="py-1.5 pr-4 font-medium whitespace-nowrap text-foreground">{c.field}</td>
                                    {r.action !== "create" && <td className="py-1.5 pr-4 break-all text-red-700 dark:text-red-300">{c.from ?? "—"}</td>}
                                    {r.action !== "delete" && <td className="py-1.5 break-all text-emerald-700 dark:text-emerald-300">{c.to ?? "—"}</td>}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3 text-sm text-muted">
          <span>
            Showing {shown.length} of {rows.length} loaded {rows.length === 1 ? "entry" : "entries"}
          </span>
          {more && (
            <Button size="sm" variant="secondary" onClick={loadOlder} disabled={loading}>
              Load older
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
