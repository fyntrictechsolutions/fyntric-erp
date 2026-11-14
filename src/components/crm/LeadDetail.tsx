"use client";

import { CalendarClock, FileSignature, MessageCircle, Pencil, Phone, Plus } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useProfile } from "@/components/auth/AuthProvider";
import { BackLink, Loading, NotFound, RecordFields, WithRecordId } from "@/components/common/DetailShell";
import { NoAccess } from "@/components/resource/ModulePage";
import { RecordEditor } from "@/components/resource/RecordEditor";
import { Badge } from "@/components/ui/Badge";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { leadsModule } from "@/config/modules/crm";
import { ESTIMATE_STATUS, estimatesModule, FOLLOWUP_STATUS, followupsModule } from "@/config/modules/sales";
import { canRead } from "@/config/roles";
import { useRecord, useRecordsWhere } from "@/hooks/useCollection";
import { moduleAccess } from "@/lib/access";
import { formatCurrency, formatDate } from "@/lib/format";
import type { BaseRecord } from "@/types";

export function LeadDetailPage() {
  const profile = useProfile();
  if (!canRead(profile.role, "leads")) return <NoAccess />;
  return <WithRecordId>{(id) => <LeadDetail id={id} />}</WithRecordId>;
}

type Editing =
  | { kind: "lead" }
  | { kind: "followup"; record: BaseRecord | null }
  | { kind: "estimate" }
  | null;

/** Sort: the first call always on top, then by date and time. */
function sortFollowups(list: BaseRecord[]) {
  return [...list].sort((a, b) => {
    if (a.isFirstCall !== b.isFirstCall) return a.isFirstCall ? -1 : 1;
    return `${a.date ?? ""} ${a.time ?? ""}`.localeCompare(`${b.date ?? ""} ${b.time ?? ""}`);
  });
}

function whatsappLink(phone: unknown) {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (!digits) return null;
  return `https://wa.me/${digits.length === 10 ? `91${digits}` : digits}`;
}

function LeadDetail({ id }: { id: string }) {
  const profile = useProfile();
  const { data: lead, loading } = useRecord("leads", id);
  const followups = useRecordsWhere("followups", "leadId", id);
  const estimates = useRecordsWhere("estimates", "leadId", id);
  const [editing, setEditing] = useState<Editing>(null);
  const sorted = useMemo(() => sortFollowups(followups.data), [followups.data]);

  if (loading) return <Loading />;
  if (!lead) return <NotFound what="lead" />;

  const leadAccess = moduleAccess(leadsModule, profile);
  const fuAccess = moduleAccess(followupsModule, profile);
  const estAccess = moduleAccess(estimatesModule, profile);
  const stage = leadsModule.fields.find((f) => f.name === "stage")!.options!.find((o) => o.value === lead.stage);
  const wa = whatsappLink(lead.phone);
  const close = () => setEditing(null);

  return (
    <div className="animate-fade-up">
      <BackLink href="/crm/leads" label="All leads" />
      <PageHeader
        title={String(lead.name ?? "Lead")}
        description={[lead.company, lead.service].filter(Boolean).join(" · ") || undefined}
        actions={
          <>
            {stage && <Badge tone={stage.tone}>{stage.label}</Badge>}
            {typeof lead.phone === "string" && lead.phone && (
              <a href={`tel:${lead.phone}`} className={buttonClasses("secondary", "md")}>
                <Phone className="size-4" /> Call
              </a>
            )}
            {wa && (
              <a href={wa} target="_blank" rel="noreferrer" className={buttonClasses("secondary", "md")}>
                <MessageCircle className="size-4" /> WhatsApp
              </a>
            )}
            {leadAccess.canEdit(lead) && (
              <Button onClick={() => setEditing({ kind: "lead" })}>
                <Pencil className="size-4" /> Edit lead
              </Button>
            )}
          </>
        }
      />

      <Card className="p-5 sm:p-6">
        <h2 className="mb-4 font-display text-base font-semibold text-foreground">Basic details</h2>
        <RecordFields module={leadsModule} record={lead} role={profile.role} />
        <p className="mt-4 text-xs text-subtle">
          Added by {String(lead.userName ?? "—")} on {formatDate(lead.createdAt)}
        </p>
      </Card>

      <Card className="mt-6 overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h2 className="font-display text-base font-semibold text-foreground">Follow-ups</h2>
            <p className="text-sm text-muted">Calls and meetings with this lead.</p>
          </div>
          {fuAccess.canCreate && (
            <Button size="sm" onClick={() => setEditing({ kind: "followup", record: null })}>
              <Plus className="size-4" /> Add
            </Button>
          )}
        </div>
        {followups.loading ? (
          <Loading />
        ) : sorted.length === 0 ? (
          <EmptyState icon={CalendarClock} title="No follow-ups yet" />
        ) : (
          <ol className="divide-y divide-line">
            {sorted.map((f) => (
              <FollowupItem
                key={f.id}
                record={f}
                onEdit={fuAccess.canEdit(f) ? () => setEditing({ kind: "followup", record: f }) : undefined}
              />
            ))}
          </ol>
        )}
      </Card>

      {canRead(profile.role, "estimates") && (
        <Card className="mt-6 overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
            <div>
              <h2 className="font-display text-base font-semibold text-foreground">Estimates</h2>
              <p className="text-sm text-muted">Quotations sent to this lead.</p>
            </div>
            {estAccess.canCreate && (
              <Button size="sm" variant="secondary" onClick={() => setEditing({ kind: "estimate" })}>
                <Plus className="size-4" /> New estimate
              </Button>
            )}
          </div>
          {estimates.data.length === 0 ? (
            <EmptyState icon={FileSignature} title={estimates.loading ? "Loading…" : "No estimates yet"} />
          ) : (
            <ul className="divide-y divide-line">
              {estimates.data.map((e) => {
                const st = ESTIMATE_STATUS.find((o) => o.value === e.status);
                return (
                  <li key={e.id}>
                    <Link href={`/crm/estimates/view?id=${e.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-tint">
                      <div className="min-w-0">
                        <p className="font-medium text-foreground">{String(e.estimateNumber ?? "Estimate")}{e.title ? ` · ${e.title}` : ""}</p>
                        <p className="text-xs text-muted">{formatDate(e.issueDate)}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm tabular-nums text-foreground">{formatCurrency(e.total)}</span>
                        {st && <Badge tone={st.tone}>{st.label}</Badge>}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}

      {editing?.kind === "lead" && <RecordEditor module={leadsModule} record={lead} onClose={close} />}
      {editing?.kind === "followup" && (
        <RecordEditor
          module={followupsModule}
          record={editing.record}
          preset={{ leadId: lead.id, leadIdLabel: lead.name }}
          title={editing.record ? (editing.record.isFirstCall ? "Edit first call" : "Edit follow-up") : `New follow-up with ${lead.name}`}
          onClose={close}
        />
      )}
      {editing?.kind === "estimate" && (
        <RecordEditor module={estimatesModule} record={null} preset={{ leadId: lead.id, leadIdLabel: lead.name }} onClose={close} />
      )}
    </div>
  );
}

function FollowupItem({ record: f, onEdit }: { record: BaseRecord; onEdit?: () => void }) {
  const st = FOLLOWUP_STATUS.find((o) => o.value === f.status);
  return (
    <li className="px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-foreground">{String(f.goal ?? "Follow-up")}</p>
            {f.isFirstCall ? <Badge tone="violet">First call</Badge> : null}
            {st && <Badge tone={st.tone}>{st.label}</Badge>}
          </div>
          <p className="mt-0.5 text-sm text-muted">
            {formatDate(f.date)}
            {f.time ? ` at ${f.time}` : ""} · {String(f.mode ?? "—")}
          </p>
        </div>
        {onEdit && (
          <Button size="sm" variant="ghost" onClick={onEdit} aria-label="Edit follow-up" title="Edit">
            <Pencil className="size-4" />
          </Button>
        )}
      </div>
      {typeof f.points === "string" && f.points && (
        <div className="mt-3">
          <p className="text-xs font-medium tracking-wide text-subtle uppercase">Points to discuss</p>
          <p className="mt-1 text-sm whitespace-pre-line text-body">{f.points}</p>
        </div>
      )}
      <div className="mt-3">
        <p className="text-xs font-medium tracking-wide text-subtle uppercase">Summary of discussion</p>
        <p className="mt-1 text-sm whitespace-pre-line text-body">
          {typeof f.summary === "string" && f.summary ? f.summary : <span className="text-subtle">Not added yet</span>}
        </p>
      </div>
    </li>
  );
}
