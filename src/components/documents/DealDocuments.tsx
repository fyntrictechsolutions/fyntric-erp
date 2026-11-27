"use client";

import { collection, query, where } from "firebase/firestore";
import { BookOpen, ChevronRight, FileSignature, FileText, ListChecks, ScrollText, Send, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useProfile } from "@/components/auth/AuthProvider";
import { friendlyError } from "@/components/resource/RecordEditor";
import { useSettings } from "@/components/settings/SettingsProvider";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { canRead } from "@/config/roles";
import { useLiveQuery } from "@/hooks/useCollection";
import { moduleAccess } from "@/lib/access";
import { db } from "@/lib/firebase";
import { formatDate } from "@/lib/format";
import { createDealDoc, DEAL_KINDS, KINDS, statusLabel, statusTone, type DealContext, type DocKind, type SalesDoc } from "@/lib/salesDocs";
import { IntroPackDialog } from "./ShareDialog";

const ICONS: Record<DocKind, typeof FileText> = { profile: BookOpen, case_study: BookOpen, nda: ShieldCheck, questionnaire: ListChecks, proposal: FileSignature, agreement: ScrollText };

const BUTTON_LABELS: Record<DocKind, string> = { profile: "", case_study: "", nda: "NDA", questionnaire: "Questionnaire", proposal: "Proposal / SOW", agreement: "Agreement" };

function useDocsWhere(field: string, value: string | null | undefined) {
  return useLiveQuery<SalesDoc>(() => (value ? query(collection(db(), "documents"), where(field, "==", value)) : null), `documents:${field}:${value ?? ""}`);
}

/**
 * The documents for one lead, client or project, newest first, with buttons for each step of the deal:
 * company profile (intro), NDA and questionnaire (discovery), proposal (with revisions), agreement (closing).
 */
export function DealDocuments({ ctx, services = [], intro = false, kinds = DEAL_KINDS }: { ctx: DealContext; services?: string[]; intro?: boolean; kinds?: DocKind[] }) {
  const profile = useProfile();
  const settings = useSettings();
  const router = useRouter();
  const allowed = canRead(profile.role, "documents");
  const byLead = useDocsWhere("leadId", allowed ? ctx.leadId : null);
  const byClient = useDocsWhere("clientId", allowed ? ctx.clientId : null);
  const byProject = useDocsWhere("projectId", allowed ? ctx.projectId : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [introOpen, setIntroOpen] = useState(false);
  const canEdit = moduleAccess("documents", profile).isManager;

  const docs = useMemo(() => {
    const all = new Map<string, SalesDoc>();
    // On a project page, documents of the client's other projects are left out.
    for (const d of [...byLead.data, ...byClient.data, ...byProject.data]) if (!ctx.projectId || !d.projectId || d.projectId === ctx.projectId) all.set(d.id, d);
    return [...all.values()].sort((a, b) => Number(b.createdAt) - Number(a.createdAt));
  }, [byLead.data, byClient.data, byProject.data, ctx.projectId]);

  if (!allowed) return null;

  const create = async (kind: DocKind) => {
    setBusy(true);
    setError(null);
    try {
      const id = await createDealDoc(kind, ctx, settings.business, profile);
      router.push(`/crm/documents/view?id=${id}`);
    } catch (e) {
      setError(friendlyError(e));
      setBusy(false);
    }
  };

  const loading = byLead.loading || byClient.loading || byProject.loading;
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-line px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-base font-semibold text-foreground">Documents</h2>
          <p className="text-sm text-muted">Profile, NDA, questionnaire, proposal and agreement for {ctx.party.name || "this client"}.</p>
        </div>
        {canEdit && intro && (
          <Button size="sm" onClick={() => setIntroOpen(true)}>
            <Send className="size-4" /> Send company profile
          </Button>
        )}
      </div>
      {canEdit && (
        <div className="flex flex-wrap gap-2 border-b border-line bg-tint px-5 py-3">
          <span className="self-center text-xs font-medium text-muted">New:</span>
          {kinds.map((k) => {
            const Icon = ICONS[k];
            return (
              <Button key={k} size="sm" variant="secondary" disabled={busy} onClick={() => void create(k)}>
                <Icon className="size-4" /> {BUTTON_LABELS[k]}
              </Button>
            );
          })}
        </div>
      )}
      {error && <p className="mx-5 mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">{error}</p>}
      {docs.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted">{loading ? "Loading…" : "No documents yet."}</p>
      ) : (
        <ul className="divide-y divide-line">
          {docs.map((d) => {
            const Icon = ICONS[d.kind];
            return (
              <li key={d.id}>
                <Link href={`/crm/documents/view?id=${d.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-tint">
                  <Icon className="size-4 shrink-0 text-subtle" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-foreground">{d.title}</p>
                    <p className="text-xs text-muted">
                      {[KINDS[d.kind].short, d.number, d.version && d.version > 1 ? `Rev. ${d.version}` : null, formatDate(d.date ?? d.createdAt)].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <Badge tone={statusTone(d.status)}>{statusLabel(d)}</Badge>
                  <ChevronRight className="size-4 shrink-0 text-subtle" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {introOpen && <IntroPackDialog to={{ name: ctx.party.contact || ctx.party.name, phone: ctx.party.phone, email: ctx.party.email }} services={services} onClose={() => setIntroOpen(false)} />}
    </Card>
  );
}
