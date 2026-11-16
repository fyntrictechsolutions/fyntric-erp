"use client";

import { collection, doc } from "firebase/firestore";
import { loggedUpdate } from "@/lib/audit";
import { Copy, Mail, MailPlus, MessageCircle, Trash2 } from "lucide-react";
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
import { canRead, MODULE_LABELS, PERMISSIONS, ROLE_DESCRIPTIONS, ROLE_LABELS, ROLES, describePermission, type ModuleKey, type Role, type UserRole } from "@/config/roles";
import { Tabs } from "@/components/common/DetailShell";
import { useSettings } from "@/components/settings/SettingsProvider";
import { createInvite, deleteInvite, employeeLinkOnApproval, inviteMessage, isEmployeeRole, type Invite } from "@/lib/team";
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

type UsersTab = "members" | "invites" | "roles";

/** Admin screen: everyone who has signed up, with their role and links to client / employee records. */
export function UsersAdmin() {
  const profile = useProfile();
  const allowed = canRead(profile.role, "users");
  const { data, loading, error } = useLiveQuery<BaseRecord & UserProfile>(() => (allowed ? collection(db(), "users") : null), `users:${allowed}`);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<UserProfile | null>(null);
  const [inviting, setInviting] = useState(false);
  const [tab, setTab] = useState<UsersTab>("members");

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
      <PageHeader
        title="Users & roles"
        description="Invite team members, clients and investors, or approve people who signed up. A role decides which pages and records they can see."
        actions={
          <Button onClick={() => setInviting(true)}>
            <MailPlus className="size-4" /> Invite member
          </Button>
        }
      />

      <Tabs<UsersTab>
        tabs={[
          { value: "members", label: `Members (${data.length})` },
          { value: "invites", label: "Invitations" },
          { value: "roles", label: "Roles & permissions" },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === "invites" && <InvitesList />}
      {tab === "roles" && <RolesMatrix />}
      {tab === "members" && (
      <>

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
      </>
      )}

      {editing && <EditUser key={editing.id} user={editing} isSelf={editing.id === profile.id} onClose={close} />}
      {inviting && <InviteModal onClose={() => setInviting(false)} />}
    </div>
  );
}

function EditUser({ user, isSelf, onClose }: { user: UserProfile; isSelf: boolean; onClose: () => void }) {
  const admin = useProfile();
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
      // Team members get an employee record automatically (from their invitation, or a new one).
      let link = { employeeId: employeeId || null, employeeIdLabel: employeeLabel || null } as { employeeId: string | null; employeeIdLabel: string | null };
      if (isEmployeeRole(role) && !employeeId) {
        link = await employeeLinkOnApproval({ ...user, displayName, employeeId: undefined }, admin);
      }
      await loggedUpdate(doc(db(), "users", user.id), {
        role,
        displayName,
        active,
        clientId: role === "client" ? clientId || null : null,
        clientIdLabel: role === "client" ? clientLabel || null : null,
        employeeId: link.employeeId,
        employeeIdLabel: link.employeeIdLabel,
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
          {role !== "pending" && <p className="mt-1 text-xs text-muted">{ROLE_DESCRIPTIONS[role]}</p>}
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
            <label htmlFor="u-emp" className={labelClasses}>Employee record</label>
            <ReferenceSelect id="u-emp" field={EMPLOYEE_FIELD} value={employeeId} label={employeeLabel} onChange={(v, l) => { setEmployeeId(v); setEmployeeLabel(l); }} />
            {isEmployeeRole(role) && !employeeId && <p className="mt-1 text-xs text-subtle">Leave empty and one is created for them when you save.</p>}
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

const INVITE_ROLES: Role[] = ["project_manager", "hr_manager", "sales", "staff", "client", "investor", "viewer", "admin"];

function appUrl() {
  return typeof window === "undefined" ? "" : window.location.origin;
}

/** Copy / WhatsApp / email buttons for sending an invitation. */
export function ShareInvite({ invite }: { invite: Pick<Invite, "name" | "email" | "role"> }) {
  const settings = useSettings();
  const [copied, setCopied] = useState(false);
  const text = inviteMessage(invite, ROLE_LABELS[invite.role], appUrl(), settings.business.name);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this message:", text);
    }
  };
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="secondary" onClick={copy}>
        <Copy className="size-3.5" /> {copied ? "Copied" : "Copy message"}
      </Button>
      <a className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-3 text-xs font-medium text-foreground hover:bg-tint-strong" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer">
        <MessageCircle className="size-3.5" /> WhatsApp
      </a>
      <a className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-3 text-xs font-medium text-foreground hover:bg-tint-strong" href={`mailto:${invite.email}?subject=${encodeURIComponent(`Your ${settings.business.name} ERP access`)}&body=${encodeURIComponent(text)}`}>
        <Mail className="size-3.5" /> Email
      </a>
    </div>
  );
}

function InviteModal({ onClose }: { onClose: () => void }) {
  const admin = useProfile();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("staff");
  const [clientId, setClientId] = useState("");
  const [clientLabel, setClientLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Invite | null>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (role === "client" && !clientId) {
      setError("Pick the client company this person belongs to.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      setDone(await createInvite({ email, name, role, clientId, clientIdLabel: clientLabel }, admin));
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      title={done ? "Invitation ready" : "Invite a member"}
      onClose={onClose}
      footer={
        done ? (
          <Button onClick={onClose}>Done</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button type="submit" form="invite-form" disabled={saving}>{saving ? "Saving…" : "Create invitation"}</Button>
          </>
        )
      }
    >
      {done ? (
        <div className="space-y-4 text-sm">
          <p className="text-body">
            <strong className="text-foreground">{done.name}</strong> can now sign in with Google using <strong className="text-foreground">{done.email}</strong> and will get the <strong className="text-foreground">{ROLE_LABELS[done.role]}</strong> role straight away.
            {done.employeeId && " Their employee record has been created; you can fill in the details on the Employees page."}
          </p>
          <p className="text-muted">Send them the link:</p>
          <ShareInvite invite={done} />
        </div>
      ) : (
        <form id="invite-form" onSubmit={save} className="space-y-4">
          {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">{error}</p>}
          <div>
            <label htmlFor="i-name" className={labelClasses}>Name</label>
            <input id="i-name" className={inputClasses} value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <label htmlFor="i-email" className={labelClasses}>Email</label>
            <input id="i-email" type="email" className={inputClasses} value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="name@company.com" />
            <p className="mt-1 text-xs text-subtle">The Google account they will sign in with.</p>
          </div>
          <div>
            <label htmlFor="i-role" className={labelClasses}>Role</label>
            <select id="i-role" className={inputClasses} value={role} onChange={(e) => setRole(e.target.value as Role)}>
              {INVITE_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </select>
            <p className="mt-1 text-xs text-muted">{ROLE_DESCRIPTIONS[role]}</p>
          </div>
          {role === "client" && (
            <div>
              <label htmlFor="i-client" className={labelClasses}>Client company</label>
              <ReferenceSelect id="i-client" field={CLIENT_FIELD} value={clientId} label={clientLabel} onChange={(v, l) => { setClientId(v); setClientLabel(l); }} />
            </div>
          )}
          {isEmployeeRole(role) && <p className="rounded-lg bg-tint px-3 py-2 text-xs text-muted">An employee record is created for them now.</p>}
        </form>
      )}
    </Modal>
  );
}

function InvitesList() {
  const { data, loading, error } = useLiveQuery<BaseRecord & Invite>(() => collection(db(), "invites"), "invites");
  const remove = async (inv: Invite) => {
    if (!window.confirm(`Cancel the invitation for ${inv.email}?${inv.employeeId ? " Their employee record stays; delete it from Employees if it isn't needed." : ""}`)) return;
    try {
      await deleteInvite(inv.id);
    } catch (e) {
      window.alert(friendlyError(e));
    }
  };
  return (
    <Card className="overflow-hidden">
      {loading ? (
        <div className="grid place-items-center py-16"><Spinner /></div>
      ) : error ? (
        <EmptyState title="Couldn't load invitations" description={error} />
      ) : data.length === 0 ? (
        <EmptyState icon={MailPlus} title="No pending invitations" description="Invitations disappear from here once the person signs in." />
      ) : (
        <ul className="divide-y divide-line">
          {data.map((inv) => (
            <li key={inv.id} className="flex flex-col gap-3 px-4 py-4 lg:flex-row lg:items-center">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-foreground">{inv.name}</p>
                <p className="truncate text-sm text-muted">{inv.email} · invited {formatDate(inv.createdAt)} by {inv.invitedByName}</p>
              </div>
              <Badge tone={ROLE_TONES[inv.role]}>{ROLE_LABELS[inv.role]}</Badge>
              <ShareInvite invite={inv} />
              <Button size="sm" variant="ghost" onClick={() => remove(inv)} aria-label="Cancel invitation" title="Cancel invitation" className="hover:text-red-600">
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

const MATRIX_MODULES = Object.keys(PERMISSIONS) as ModuleKey[];

function RolesMatrix() {
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {ROLES.map((r) => (
          <Card key={r} className="p-4">
            <Badge tone={ROLE_TONES[r]}>{ROLE_LABELS[r]}</Badge>
            <p className="mt-2 text-sm text-body">{ROLE_DESCRIPTIONS[r]}</p>
          </Card>
        ))}
      </div>
      <Card className="overflow-hidden">
        <div className="border-b border-line px-5 py-4">
          <h2 className="font-display text-base font-semibold text-foreground">What each role can do</h2>
          <p className="text-sm text-muted">
            Full = add, edit and delete everything. Own entries = only the records they created. Own company = a client&apos;s own projects and invoices.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="bg-tint text-xs tracking-wide text-muted uppercase">
              <tr>
                <th className="sticky left-0 bg-tint px-4 py-3 font-medium">Page</th>
                {ROLES.map((r) => <th key={r} className="px-3 py-3 font-medium whitespace-nowrap">{ROLE_LABELS[r]}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {MATRIX_MODULES.map((m) => (
                <tr key={m}>
                  <th scope="row" className="sticky left-0 bg-surface px-4 py-2.5 font-medium whitespace-nowrap text-foreground">{MODULE_LABELS[m]}</th>
                  {ROLES.map((r) => {
                    const label = describePermission(PERMISSIONS[m][r]);
                    return (
                      <td key={r} className={cn("px-3 py-2.5 whitespace-nowrap", label === "—" ? "text-subtle" : label === "Full" ? "font-medium text-emerald-700 dark:text-emerald-300" : "text-body")}>
                        {label}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
