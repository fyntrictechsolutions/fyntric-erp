"use client";

import { FileSignature, FolderKanban, MessageCircle, Pencil, Phone, ReceiptText, Target, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useProfile } from "@/components/auth/AuthProvider";
import { BackLink, Loading, NotFound, RecordFields, WithRecordId } from "@/components/common/DetailShell";
import { DealDocuments } from "@/components/documents/DealDocuments";
import { NoAccess } from "@/components/resource/ModulePage";
import { friendlyError, RecordEditor } from "@/components/resource/RecordEditor";
import { Badge } from "@/components/ui/Badge";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { clientsModule } from "@/config/modules/crm";
import { invoicesModule } from "@/config/modules/finance";
import { projectsModule } from "@/config/modules/projects";
import { ESTIMATE_STATUS } from "@/config/modules/sales";
import type { ModuleDefinition } from "@/config/modules/types";
import { canRead, type Role } from "@/config/roles";
import { useRecord, useRecordsWhere } from "@/hooks/useCollection";
import { moduleAccess } from "@/lib/access";
import { asList, formatCurrency, formatDate } from "@/lib/format";
import { deleteRecord } from "@/lib/records";

export function ClientDetailPage() {
  const profile = useProfile();
  if (!canRead(profile.role, "clients")) return <NoAccess />;
  return <WithRecordId>{(id) => <ClientDetail id={id} />}</WithRecordId>;
}

function whatsappLink(phone: unknown) {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (!digits) return null;
  return `https://wa.me/${digits.length === 10 ? `91${digits}` : digits}`;
}

const optionOf = (module: ModuleDefinition, value: unknown) => module.fields.find((f) => f.name === "status")?.options?.find((o) => o.value === value);

/** A client's page: details, the lead it came from, projects, estimates, invoices and documents. */
function ClientDetail({ id }: { id: string }) {
  const profile = useProfile();
  const role = profile.role as Role;
  const router = useRouter();
  const { data: client, loading } = useRecord("clients", id);
  const fromLeadId = (client?.fromLeadId as string | undefined) ?? null;
  const { data: lead } = useRecord("leads", canRead(role, "leads") ? fromLeadId : null);
  const projects = useRecordsWhere("projects", "clientId", canRead(role, "projects") ? id : null);
  const estimates = useRecordsWhere("estimates", "leadId", canRead(role, "estimates") ? fromLeadId : null);
  const invoices = useRecordsWhere("invoices", "clientId", canRead(role, "invoices") ? id : null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (loading) return <Loading />;
  if (!client) return <NotFound what="client" />;

  const access = moduleAccess(clientsModule, profile);
  const status = optionOf(clientsModule, client.status);
  const wa = whatsappLink(client.phone);
  const name = String(client.name ?? "Client");

  const doDelete = async () => {
    if (!window.confirm(`Delete the client "${name}"? Projects, invoices and documents made for it are kept. This can't be undone.`)) return;
    setBusy(true);
    setMessage(null);
    try {
      await deleteRecord("clients", client.id);
      router.push("/crm/clients");
    } catch (e) {
      setMessage(friendlyError(e));
      setBusy(false);
    }
  };

  return (
    <div className="animate-fade-up">
      <BackLink href="/crm/clients" label="All clients" />
      <PageHeader
        title={name}
        description={[client.contactPerson, client.industry, client.city].filter(Boolean).map(String).join(" · ") || undefined}
        actions={
          <>
            {status && <Badge tone={status.tone}>{status.label}</Badge>}
            {typeof client.phone === "string" && client.phone && (
              <a href={`tel:${client.phone}`} aria-label="Call" title="Call" className={buttonClasses("secondary", "md")}>
                <Phone className="size-4" /> <span className="hidden sm:inline">Call</span>
              </a>
            )}
            {wa && (
              <a href={wa} target="_blank" rel="noreferrer" aria-label="WhatsApp" title="WhatsApp" className={buttonClasses("secondary", "md")}>
                <MessageCircle className="size-4" /> <span className="hidden sm:inline">WhatsApp</span>
              </a>
            )}
            {access.canDelete(client) && (
              <Button variant="danger" onClick={() => void doDelete()} disabled={busy} aria-label="Delete client" title="Delete">
                <Trash2 className="size-4" /> <span className="hidden sm:inline">Delete</span>
              </Button>
            )}
            {access.canEdit(client) && (
              <Button onClick={() => setEditing(true)}>
                <Pencil className="size-4" /> Edit client
              </Button>
            )}
          </>
        }
      />

      {message && <p className="mb-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">{message}</p>}
      {fromLeadId && (
        <p className="mb-4 flex items-center gap-2 rounded-lg bg-tint px-3 py-2 text-sm text-body">
          <Target className="size-4 text-subtle" aria-hidden />
          Came from the lead{" "}
          {canRead(role, "leads") ? (
            <Link href={`/crm/leads/view?id=${fromLeadId}`} className="font-medium text-accent hover:underline">{String(lead?.name ?? client.contactPerson ?? "lead")}</Link>
          ) : (
            String(client.contactPerson ?? "")
          )}
          . Its documents and estimates are shown here too.
        </p>
      )}

      <Card className="p-5 sm:p-6">
        <RecordFields module={clientsModule} record={client} role={role} exclude={["name", "status"]} />
      </Card>

      {canRead(role, "projects") && (
        <ListCard title="Projects" hint="Work for this client." icon={FolderKanban} loading={projects.loading} empty="No projects yet">
          {projects.data.map((p) => {
            const st = optionOf(projectsModule, p.status);
            return (
              <Row key={p.id} href={`/projects/view?id=${p.id}`} title={String(p.name ?? "Project")} sub={[p.code, p.startDate ? formatDate(p.startDate) : null].filter(Boolean).map(String).join(" · ")}>
                {st && <Badge tone={st.tone}>{st.label}</Badge>}
              </Row>
            );
          })}
        </ListCard>
      )}

      {canRead(role, "estimates") && fromLeadId && (
        <ListCard title="Estimates" hint="Quotations sent while it was a lead." icon={FileSignature} loading={estimates.loading} empty="No estimates">
          {estimates.data.map((e) => {
            const st = ESTIMATE_STATUS.find((o) => o.value === e.status);
            return (
              <Row key={e.id} href={`/crm/estimates/view?id=${e.id}`} title={`${String(e.estimateNumber ?? "Estimate")}${e.title ? ` · ${e.title}` : ""}`} sub={formatDate(e.issueDate)}>
                <span className="text-sm text-foreground tabular-nums">{formatCurrency(e.total)}</span>
                {st && <Badge tone={st.tone}>{st.label}</Badge>}
              </Row>
            );
          })}
        </ListCard>
      )}

      {canRead(role, "invoices") && (
        <ListCard title="Invoices" hint="Billed to this client." icon={ReceiptText} loading={invoices.loading} empty="No invoices yet">
          {[...invoices.data]
            .sort((a, b) => String(b.issueDate ?? "").localeCompare(String(a.issueDate ?? "")))
            .map((inv) => {
              const st = optionOf(invoicesModule, inv.status);
              return (
                <Row key={inv.id} href={`/finance/invoices/view?id=${inv.id}`} title={String(inv.invoiceNumber ?? "Invoice")} sub={[formatDate(inv.issueDate), inv.projectIdLabel].filter(Boolean).map(String).join(" · ")}>
                  <span className="text-sm text-foreground tabular-nums">{formatCurrency(inv.total)}</span>
                  {st && <Badge tone={st.tone}>{st.label}</Badge>}
                </Row>
              );
            })}
        </ListCard>
      )}

      <div className="mt-6">
        <DealDocuments
          intro
          services={asList(lead?.service)}
          ctx={{
            leadId: fromLeadId,
            leadIdLabel: lead ? String(lead.name ?? "") : null,
            clientId: client.id,
            clientIdLabel: name,
            party: {
              name,
              contact: String(client.contactPerson ?? ""),
              address: String(client.address ?? ""),
              phone: String(client.phone ?? ""),
              email: String(client.email ?? ""),
            },
          }}
        />
      </div>

      {editing && <RecordEditor module={clientsModule} record={client} onClose={() => setEditing(false)} />}
    </div>
  );
}

function ListCard({ title, hint, icon, loading, empty, children }: { title: string; hint: string; icon: typeof Target; loading: boolean; empty: string; children: React.ReactNode[] }) {
  return (
    <Card className="mt-6 overflow-hidden">
      <div className="border-b border-line px-5 py-4">
        <h2 className="font-display text-base font-semibold text-foreground">{title}</h2>
        <p className="text-sm text-muted">{hint}</p>
      </div>
      {children.length === 0 ? <EmptyState icon={icon} title={loading ? "Loading…" : empty} /> : <ul className="divide-y divide-line">{children}</ul>}
    </Card>
  );
}

function Row({ href, title, sub, children }: { href: string; title: string; sub?: string; children?: React.ReactNode }) {
  return (
    <li>
      <Link href={href} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-tint">
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">{title}</p>
          {sub && <p className="text-xs text-muted">{sub}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-3">{children}</div>
      </Link>
    </li>
  );
}
