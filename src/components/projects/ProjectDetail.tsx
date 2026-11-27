"use client";

import { collection } from "firebase/firestore";
import { CheckSquare, FolderOpen, KanbanSquare, Pencil, Timer } from "lucide-react";
import { useState } from "react";
import { useProfile } from "@/components/auth/AuthProvider";
import { BackLink, Loading, NotFound, RecordFields, Tabs, WithRecordId } from "@/components/common/DetailShell";
import { NoAccess } from "@/components/resource/ModulePage";
import { RecordEditor } from "@/components/resource/RecordEditor";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { projectsModule } from "@/config/modules/projects";
import { canRead, INTERNAL_ROLES, type Role } from "@/config/roles";
import { useLiveQuery, useRecord, useRecordsWhere } from "@/hooks/useCollection";
import { moduleAccess } from "@/lib/access";
import { db } from "@/lib/firebase";
import { TASK_COLUMNS, type ChecklistEntry, type ProjectAsset, type ProjectTask } from "@/lib/projectWork";
import type { BaseRecord } from "@/types";
import { DealDocuments } from "@/components/documents/DealDocuments";
import { DeliveryChecklist } from "./DeliveryChecklist";
import { ProjectAssets } from "./ProjectAssets";
import { TaskBoard } from "./TaskBoard";

export function ProjectDetailPage() {
  const profile = useProfile();
  if (!canRead(profile.role, "projects")) return <NoAccess />;
  return <WithRecordId>{(id) => <ProjectDetail id={id} />}</WithRecordId>;
}

type Tab = "summary" | "tasks" | "assets" | "checklist" | "documents";

/** The team's lists under a project: everyone inside the company sees them; clients see the summary only. */
const SEES_WORK: Role[] = [...INTERNAL_ROLES, "investor", "viewer"];

export interface ProjectWork {
  projectId: string;
  /** Admins and project managers: add, edit, delete and reorder everything. */
  manages: boolean;
}

function useSub<T extends BaseRecord>(projectId: string, name: string, allowed: boolean) {
  return useLiveQuery<T>(() => (allowed ? collection(db(), "projects", projectId, name) : null), `projects/${projectId}/${name}:${allowed}`);
}

function ProjectDetail({ id }: { id: string }) {
  const profile = useProfile();
  const role = profile.role as Role;
  const { data: project, loading } = useRecord("projects", id);
  const [tab, setTab] = useState<Tab>("summary");
  const [editing, setEditing] = useState(false);
  const seesWork = SEES_WORK.includes(role);
  const tasks = useSub<ProjectTask>(id, "tasks", seesWork);
  const assets = useSub<ProjectAsset>(id, "assets", seesWork);
  const checklist = useSub<ChecklistEntry>(id, "checklist", seesWork);
  // Hours logged: only people who see everyone's timesheets.
  const seesHours = role === "admin" || role === "project_manager";
  const hours = useRecordsWhere("timesheets", "projectId", seesHours ? id : null);
  const seesDocs = canRead(role, "documents");
  const { data: client } = useRecord("clients", seesDocs && canRead(role, "clients") ? ((project?.clientId as string | undefined) ?? null) : null);

  if (loading) return <Loading />;
  if (!project) return <NotFound what="project" />;

  const access = moduleAccess(projectsModule, profile);
  const manages = access.isManager;
  const status = projectsModule.fields.find((f) => f.name === "status")!.options!.find((o) => o.value === project.status);
  const work: ProjectWork = { projectId: id, manages };

  return (
    <div className="animate-fade-up">
      <BackLink href="/projects" label="All projects" />
      <PageHeader
        title={String(project.name ?? "Project")}
        description={[project.code, project.clientIdLabel].filter(Boolean).map(String).join(" · ") || undefined}
        actions={
          <>
            {status && <Badge tone={status.tone}>{status.label}</Badge>}
            {access.canEdit(project) && (
              <Button onClick={() => setEditing(true)}>
                <Pencil className="size-4" /> Edit project
              </Button>
            )}
          </>
        }
      />

      {seesWork && (
        <Tabs<Tab>
          tabs={[
            { value: "summary", label: "Summary" },
            { value: "tasks", label: `Task planner${tasks.data.length ? ` (${tasks.data.length})` : ""}` },
            { value: "assets", label: `Assets${assets.data.length ? ` (${assets.data.length})` : ""}` },
            { value: "checklist", label: "Delivery checklist" },
            ...(seesDocs ? [{ value: "documents" as const, label: "Documents" }] : []),
          ]}
          value={tab}
          onChange={setTab}
        />
      )}

      {tab === "summary" || !seesWork ? (
        <Summary
          project={project}
          role={role}
          tasks={seesWork ? tasks.data : null}
          assets={seesWork ? assets.data : null}
          checklist={seesWork ? checklist.data : null}
          hours={seesHours ? hours.data.reduce((t, h) => t + (Number(h.hours) || 0), 0) : null}
          onOpen={setTab}
        />
      ) : tab === "tasks" ? (
        <TaskBoard {...work} tasks={tasks.data} loading={tasks.loading} />
      ) : tab === "assets" ? (
        <ProjectAssets {...work} assets={assets.data} loading={assets.loading} />
      ) : tab === "documents" ? (
        <DealDocuments
          kinds={["proposal", "agreement", "nda", "questionnaire"]}
          ctx={{
            projectId: id,
            projectIdLabel: String(project.name ?? ""),
            clientId: (project.clientId as string | undefined) ?? null,
            clientIdLabel: (project.clientIdLabel as string | undefined) ?? null,
            party: {
              name: String(client?.name ?? project.clientIdLabel ?? ""),
              contact: String(client?.contactPerson ?? ""),
              address: String(client?.address ?? ""),
              phone: String(client?.phone ?? ""),
              email: String(client?.email ?? ""),
            },
          }}
        />
      ) : (
        <DeliveryChecklist {...work} items={checklist.data} loading={checklist.loading} />
      )}

      {editing && <RecordEditor module={projectsModule} record={project} onClose={() => setEditing(false)} />}
    </div>
  );
}

function Summary({
  project,
  role,
  tasks,
  assets,
  checklist,
  hours,
  onOpen,
}: {
  project: BaseRecord;
  role: Role;
  tasks: ProjectTask[] | null;
  assets: ProjectAsset[] | null;
  checklist: ChecklistEntry[] | null;
  hours: number | null;
  onOpen: (t: Tab) => void;
}) {
  const progress = Math.max(0, Math.min(100, Number(project.progress) || 0));
  const done = (tasks ?? []).filter((t) => t.status === "done").length;
  const ticked = (checklist ?? []).filter((c) => c.done).length;
  const files = (assets ?? []).filter((a) => a.kind === "file").length;
  const people = new Set((tasks ?? []).map((t) => t.assigneeName).filter(Boolean));

  return (
    <div className="space-y-6">
      <Card className="p-5 sm:p-6">
        <div className="mb-5">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-foreground">Progress</span>
            <span className="tabular-nums text-muted">{progress}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-tint-strong">
            <div className="h-full rounded-full bg-gradient-to-r from-accent-cyan to-brand-600" style={{ width: `${progress}%` }} />
          </div>
        </div>
        <RecordFields module={projectsModule} record={project} role={role} exclude={["progress"]} />
      </Card>

      {tasks && checklist && assets && (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <SummaryTile icon={KanbanSquare} label="Tasks done" value={`${done} / ${tasks.length}`} hint={people.size ? `${people.size} ${people.size === 1 ? "person" : "people"} assigned` : "No tasks yet"} onClick={() => onOpen("tasks")}>
            {tasks.length > 0 && (
              <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-tint-strong">
                {TASK_COLUMNS.map((c) => {
                  const n = tasks.filter((t) => t.status === c.key).length;
                  return n ? <div key={c.key} className={c.dot} style={{ width: `${(n / tasks.length) * 100}%` }} title={`${c.label}: ${n}`} /> : null;
                })}
              </div>
            )}
          </SummaryTile>
          <SummaryTile icon={CheckSquare} label="Delivery checklist" value={`${ticked} / ${checklist.length}`} hint={checklist.length ? `${checklist.length - ticked} pending` : "No items yet"} onClick={() => onOpen("checklist")} />
          <SummaryTile icon={FolderOpen} label="Files and notes" value={String(assets.length)} hint={`${files} ${files === 1 ? "file" : "files"}, ${assets.length - files} ${assets.length - files === 1 ? "note" : "notes"}`} onClick={() => onOpen("assets")} />
          {hours !== null && <SummaryTile icon={Timer} label="Hours logged" value={String(Math.round(hours * 10) / 10)} hint="From timesheets" />}
        </div>
      )}
    </div>
  );
}

function SummaryTile({
  icon: Icon,
  label,
  value,
  hint,
  onClick,
  children,
}: {
  icon: typeof Timer;
  label: string;
  value: string;
  hint?: string;
  onClick?: () => void;
  children?: React.ReactNode;
}) {
  const body = (
    <>
      <p className="flex items-center gap-1.5 text-xs text-muted sm:text-sm">
        <Icon className="size-4 text-accent" aria-hidden /> {label}
      </p>
      <p className="mt-1.5 font-display text-xl font-semibold text-foreground tabular-nums sm:text-2xl">{value}</p>
      {hint && <p className="mt-0.5 truncate text-xs text-subtle">{hint}</p>}
      {children}
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className="rounded-2xl text-left">
      <Card className="h-full p-3.5 transition-colors hover:border-line-strong sm:p-5">{body}</Card>
    </button>
  ) : (
    <Card className="p-3.5 sm:p-5">{body}</Card>
  );
}
