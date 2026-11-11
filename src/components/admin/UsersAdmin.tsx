"use client";

import { collection, doc, updateDoc } from "firebase/firestore";
import { Pencil, Search, ShieldCheck } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useProfile } from "@/components/auth/AuthProvider";
import { initials } from "@/components/layout/UserMenu";
import { NoAccess } from "@/components/resource/ModulePage";
import { ReferenceSelect } from "@/components/resource/ReferenceSelect";
import { friendlyError } from "@/components/resource/ResourcePage";
import { Badge, type Tone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { inputClasses, labelClasses } from "@/components/ui/fieldStyles";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import { Spinner } from "@/components/ui/Spinner";
import type { FieldDefinition } from "@/config/modules";
import { canRead, ROLE_LABELS, ROLES, type UserRole } from "@/config/roles";
import { useLiveQuery } from "@/hooks/useCollection";
import { cn } from "@/lib/cn";
import { db } from "@/lib/firebase";
import { formatDate } from "@/lib/format";
import type { BaseRecord, UserProfile } from "@/types";

const ROLE_TONES: Record<UserRole, Tone> = {
  admin: "violet",
  project_manager: "blue",
  hr_manager: "blue",
  sales: "blue",
  staff: "neutral",
  client: "green",
  investor: "amber",
  viewer: "neutral",
  pending: "red",
};

const CLIENT_FIELD: FieldDefinition = { name: "clientId", label: "Client company", type: "reference", reference: { module: "clients", labelField: "name" } };
const EMPLOYEE_FIELD: FieldDefinition = { name: "employeeId", label: "Employee record", type: "reference", reference: { module: "employees", labelField: "fullName" } };

/** Admin screen: everyone who has signed up, with their role and links to client / employee records. */
export function UsersAdmin() {
  const profile = useProfile();
  const allowed = canRead(profile.role, "users");
  const { data, loading, error } = useLiveQuery<BaseRecord & UserProfile>(() => (allowed ? collection(db(), "users") : null), `users:${allowed}`);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<UserProfile | null>(null);

  const rows = useMemo(() => {
    const term = search.toLowerCase();
    // People waiting for a role first.
    return data
      .filter((u) => !term || `${u.displayName} ${u.email}`.toLowerCase().includes(term))
      .sort((a, b) => Number(b.role === "pending") - Number(a.role === "pending"));
  }, [data, search]);
  const pending = data.filter((u) => u.role === "pending").length;
  const close = useCallback(() => setEditing(null), []);

  if (!allowed) return <NoAccess />;

  return (
    <div className="animate-fade-up">
      <PageHeader title="Users & roles" description="People sign up from the login page, then you give them a role here. A role decides which pages and records they can see." />

      {pending > 0 && (
        <p className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
          {pending === 1 ? "1 person is" : `${pending} people are`} waiting for a role.
        </p>
      )}

      <Card className="overflow-hidden">
        <div className="border-b border-line p-4">
          <div className="relative sm:w-72">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" aria-hidden />
            <input type="search" className={cn(inputClasses, "pl-9")} placeholder="Search people…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search users" />
          </div>
        </div>
        {loading ? (
          <div className="grid place-items-center py-16"><Spinner /></div>
        ) : error ? (
          <EmptyState title="Couldn't load users" description={error} />
        ) : rows.length === 0 ? (
          <EmptyState icon={ShieldCheck} title="No users found" />
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-tint-strong text-sm font-semibold text-foreground">{initials(u.displayName)}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-foreground">
                    {u.displayName} {u.id === profile.id && <span className="text-xs text-muted">(you)</span>}
                  </p>
                  <p className="truncate text-sm text-muted">{u.email}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                  {u.clientIdLabel && <span>Client: {u.clientIdLabel}</span>}
                  {!u.active && <Badge tone="red">Disabled</Badge>}
                  <Badge tone={ROLE_TONES[u.role]}>{ROLE_LABELS[u.role]}</Badge>
                  <span className="hidden md:inline">Joined {formatDate(u.createdAt)}</span>
                </div>
                <Button size="sm" variant={u.role === "pending" ? "primary" : "ghost"} onClick={() => setEditing(u)} aria-label={`Edit ${u.displayName}`}>
                  {u.role === "pending" ? "Assign role" : <Pencil className="size-4" />}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {editing && <EditUser key={editing.id} user={editing} isSelf={editing.id === profile.id} onClose={close} />}
    </div>
  );
}

function EditUser({ user, isSelf, onClose }: { user: UserProfile; isSelf: boolean; onClose: () => void }) {
  const [role, setRole] = useState<UserRole>(user.role);
  const [displayName, setDisplayName] = useState(user.displayName);
  const [active, setActive] = useState(user.active);
  const [clientId, setClientId] = useState(user.clientId ?? "");
  const [clientLabel, setClientLabel] = useState(user.clientIdLabel ?? "");
  const [employeeId, setEmployeeId] = useState(user.employeeId ?? "");
  const [employeeLabel, setEmployeeLabel] = useState(user.employeeIdLabel ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await updateDoc(doc(db(), "users", user.id), {
        role,
        displayName,
        active,
        clientId: role === "client" ? clientId || null : null,
        clientIdLabel: role === "client" ? clientLabel || null : null,
        employeeId: employeeId || null,
        employeeIdLabel: employeeLabel || null,
        updatedAt: Date.now(),
      });
      onClose();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      title={`Edit ${user.displayName}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="edit-user" disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </>
      }
    >
      <form id="edit-user" onSubmit={save} className="space-y-4">
        {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">{error}</p>}
        <p className="text-sm text-muted">{user.email}</p>
        <div>
          <label htmlFor="u-name" className={labelClasses}>Name</label>
          <input id="u-name" className={inputClasses} value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
        </div>
        <div>
          <label htmlFor="u-role" className={labelClasses}>Role</label>
          <select id="u-role" className={inputClasses} value={role} onChange={(e) => setRole(e.target.value as UserRole)} disabled={isSelf}>
            <option value="pending">{ROLE_LABELS.pending}</option>
            {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </select>
          {isSelf && <p className="mt-1 text-xs text-subtle">You can&apos;t change your own role, so the company is never left without an admin.</p>}
        </div>
        {role === "client" && (
          <div>
            <label htmlFor="u-client" className={labelClasses}>Client company</label>
            <ReferenceSelect id="u-client" field={CLIENT_FIELD} value={clientId} label={clientLabel} onChange={(v, l) => { setClientId(v); setClientLabel(l); }} />
            <p className="mt-1 text-xs text-subtle">They will only see projects and invoices for this client.</p>
          </div>
        )}
        {role !== "client" && role !== "investor" && role !== "viewer" && role !== "pending" && (
          <div>
            <label htmlFor="u-emp" className={labelClasses}>Employee record (optional)</label>
            <ReferenceSelect id="u-emp" field={EMPLOYEE_FIELD} value={employeeId} label={employeeLabel} onChange={(v, l) => { setEmployeeId(v); setEmployeeLabel(l); }} />
          </div>
        )}
        <label className="flex items-center gap-3 text-sm text-foreground">
          <input type="checkbox" className="size-4 accent-brand-600" checked={active} onChange={(e) => setActive(e.target.checked)} disabled={isSelf} />
          Account active
        </label>
      </form>
    </Modal>
  );
}
