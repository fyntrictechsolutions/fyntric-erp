"use client";

import { collection } from "firebase/firestore";
import { BookOpen, ChevronRight, FileText, Plus, Share2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useProfile } from "@/components/auth/AuthProvider";
import { Tabs } from "@/components/common/DetailShell";
import { NoAccess } from "@/components/resource/ModulePage";
import { friendlyError } from "@/components/resource/RecordEditor";
import { useSettings } from "@/components/settings/SettingsProvider";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { canRead } from "@/config/roles";
import { useLiveQuery } from "@/hooks/useCollection";
import { moduleAccess } from "@/lib/access";
import { cn } from "@/lib/cn";
import { db } from "@/lib/firebase";
import { formatDate } from "@/lib/format";
import { createCaseStudy, DEAL_KINDS, ensureProfile, ensureTemplate, KINDS, PROFILE_ID, statusLabel, statusTone, templateId, type DocKind, type SalesDoc } from "@/lib/salesDocs";

type Tab = "profile" | "cases" | "deals" | "templates";

/** Sales → Documents: the company profile and case studies sent to every lead, all client documents, and the templates. */
export function DocumentsLibrary() {
  const profile = useProfile();
  const settings = useSettings();
  const router = useRouter();
  const allowed = canRead(profile.role, "documents");
  const { data, loading } = useLiveQuery<SalesDoc>(() => (allowed ? collection(db(), "documents") : null), `documents:all:${allowed}`);
  const [tab, setTab] = useState<Tab>("profile");
  const [kind, setKind] = useState<DocKind | "">("");
  const [error, setError] = useState<string | null>(null);
  const canEdit = moduleAccess("documents", profile).isManager;

  const cases = useMemo(() => data.filter((d) => d.kind === "case_study").sort((a, b) => a.title.localeCompare(b.title)), [data]);
  const deals = useMemo(() => data.filter((d) => !d.template && DEAL_KINDS.includes(d.kind)).sort((a, b) => Number(b.createdAt) - Number(a.createdAt)), [data]);
  const companyProfile = data.find((d) => d.id === PROFILE_ID);

  if (!allowed) return <NoAccess />;

  const open = async (fn: () => Promise<string | void>, id?: string) => {
    setError(null);
    try {
      const made = await fn();
      router.push(`/crm/documents/view?id=${made || id}`);
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  return (
    <div className="animate-fade-up">
      <PageHeader title="Documents" description="Company profile, case studies, and the NDAs, questionnaires, proposals and agreements made for leads and clients." />
      <Tabs<Tab>
        tabs={[
          { value: "profile", label: "Company profile" },
          { value: "cases", label: `Case studies${cases.length ? ` (${cases.length})` : ""}` },
          { value: "deals", label: `Client documents${deals.length ? ` (${deals.length})` : ""}` },
          ...(canEdit ? [{ value: "templates" as const, label: "Templates" }] : []),
        ]}
        value={tab}
        onChange={setTab}
      />
      {error && <p className="mb-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">{error}</p>}

      {tab === "profile" && (
        <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="flex items-start gap-3">
            <BookOpen className="mt-0.5 size-5 shrink-0 text-accent" />
            <div>
              <p className="font-medium text-foreground">{companyProfile?.title ?? `${settings.business.name}: company profile`}</p>
              <p className="mt-1 text-sm text-muted">
                Who you are, team, services, technologies, how you work, industries, portfolio highlights (from your case studies), clients and contact details.
                {companyProfile ? ` Last updated ${formatDate(companyProfile.updatedAt)}.` : " Starts from your website wording; edit it to suit."}
              </p>
              <p className="mt-1 text-sm text-muted">To send it to a lead, open the lead and use Send company profile.</p>
            </div>
          </div>
          <Button onClick={() => void open(async () => (companyProfile ? PROFILE_ID : (await ensureProfile(settings.business, profile), PROFILE_ID)))} disabled={loading || (!companyProfile && !canEdit)}>
            {companyProfile ? "Open" : "Set it up"}
          </Button>
        </Card>
      )}

      {tab === "cases" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted">One or two pages per project: the client&apos;s problem, what you built, and the result. Attach the ones that match each lead.</p>
            {canEdit && (
              <Button onClick={() => void open(() => createCaseStudy(profile))}>
                <Plus className="size-4" /> New case study
              </Button>
            )}
          </div>
          {cases.length === 0 ? (
            <Card className="px-5 py-10 text-center text-sm text-muted">{loading ? "Loading…" : "No case studies yet."}</Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {cases.map((c) => (
                <Link key={c.id} href={`/crm/documents/view?id=${c.id}`} className="block rounded-2xl">
                  <Card className="h-full overflow-hidden transition-colors hover:border-line-strong">
                    {c.images?.[0] ? (
                      // eslint-disable-next-line @next/next/no-img-element -- stored screenshot
                      <img src={c.images[0].url} alt="" className="h-36 w-full bg-tint object-cover" />
                    ) : (
                      <div className="grid h-36 place-items-center bg-tint"><FileText className="size-8 text-subtle" /></div>
                    )}
                    <div className="p-4">
                      <p className="flex items-center gap-2 font-medium text-foreground">{c.title} {c.shareToken && <Share2 className="size-3.5 text-subtle" aria-label="Shared" />}</p>
                      {c.summary && <p className="mt-1 line-clamp-2 text-sm text-muted">{c.summary}</p>}
                      {c.services && c.services.length > 0 && <p className="mt-2 text-xs text-subtle">{c.services.join(" · ")}</p>}
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "deals" && (
        <Card className="overflow-hidden">
          <div className="flex gap-1.5 overflow-x-auto border-b border-line p-3">
            {(["", ...DEAL_KINDS] as const).map((k) => (
              <button
                key={k || "all"}
                type="button"
                onClick={() => setKind(k)}
                className={cn("shrink-0 rounded-full border px-3 py-1 text-xs font-medium", kind === k ? "border-brand-500 bg-accent-soft text-accent" : "border-line text-muted hover:text-foreground")}
              >
                {k ? KINDS[k].short : "All"}
              </button>
            ))}
          </div>
          {deals.filter((d) => !kind || d.kind === kind).length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted">{loading ? "Loading…" : "None yet. Make them from a lead's or project's page."}</p>
          ) : (
            <ul className="divide-y divide-line">
              {deals
                .filter((d) => !kind || d.kind === kind)
                .map((d) => (
                  <li key={d.id}>
                    <Link href={`/crm/documents/view?id=${d.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-tint">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-foreground">{d.title}</p>
                        <p className="text-xs text-muted">{[KINDS[d.kind].short, d.number, d.party?.name, formatDate(d.date ?? d.createdAt)].filter(Boolean).join(" · ")}</p>
                      </div>
                      <Badge tone={statusTone(d.status)}>{statusLabel(d)}</Badge>
                      <ChevronRight className="size-4 shrink-0 text-subtle" />
                    </Link>
                  </li>
                ))}
            </ul>
          )}
        </Card>
      )}

      {tab === "templates" && (
        <div className="grid gap-4 sm:grid-cols-2">
          {DEAL_KINDS.map((k) => {
            const saved = data.find((d) => d.id === templateId(k));
            return (
              <Card key={k} className="flex flex-col p-5">
                <p className="font-medium text-foreground">{KINDS[k].label}</p>
                <p className="mt-1 flex-1 text-sm text-muted">
                  {KINDS[k].story} stage. {saved ? `Edited ${formatDate(saved.updatedAt)}.` : "Using the standard wording."}
                </p>
                <Button variant="secondary" size="sm" className="mt-4 self-start" onClick={() => void open(async () => (await ensureTemplate(k, profile), templateId(k)))}>
                  Open template
                </Button>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
