import { doc, getDoc } from "firebase/firestore";
import { loggedDelete, loggedSet, loggedUpdate } from "@/lib/audit";
import { EMPLOYEE_ROLES, type Role, type UserRole } from "@/config/roles";
import { db } from "@/lib/firebase";
import { todayISO } from "@/lib/format";
import { createRecord } from "@/lib/records";
import type { UserProfile } from "@/types";

/** An invitation waiting for someone to sign in, stored at invites/{email in lower case}. */
export interface Invite {
  id: string;
  email: string;
  name: string;
  role: Role;
  clientId?: string | null;
  clientIdLabel?: string | null;
  employeeId?: string | null;
  employeeIdLabel?: string | null;
  invitedBy: string;
  invitedByName: string;
  createdAt: number;
}

export function inviteId(email: string) {
  return email.trim().toLowerCase();
}

export function isEmployeeRole(role: UserRole): boolean {
  return (EMPLOYEE_ROLES as UserRole[]).includes(role);
}

/** Creates the employee record for a team member (Admin, or HR when hiring). Returns its id and display name. */
export async function createEmployeeFor(
  person: { name: string; email: string; accountId?: string; details?: Record<string, unknown> },
  admin: UserProfile,
): Promise<{ id: string; label: string }> {
  const ref = await createRecord(
    "employees",
    {
      ...person.details,
      fullName: person.name,
      email: person.email,
      status: "active",
      employmentType: "full_time",
      joiningDate: person.details?.joiningDate ?? todayISO(),
      accountId: person.accountId ?? null,
      accountEmail: person.email,
      // The employee record belongs to the person, not to the admin who created it.
      employeeId: null,
    },
    admin,
  );
  return { id: ref.id, label: person.name };
}

/** Saves an invitation. Team roles get their employee record straight away. */
export async function createInvite(
  input: { email: string; name: string; role: Role; clientId?: string; clientIdLabel?: string; employeeDetails?: Record<string, unknown> },
  admin: UserProfile,
): Promise<Invite> {
  const id = inviteId(input.email);
  const existing = await getDoc(doc(db(), "invites", id));
  let employee: { id: string; label: string } | null = null;
  if (existing.exists() && existing.data().employeeId) {
    employee = { id: existing.data().employeeId, label: existing.data().employeeIdLabel ?? input.name };
  } else if (isEmployeeRole(input.role)) {
    employee = await createEmployeeFor({ name: input.name, email: id, details: input.employeeDetails }, admin);
  }
  const invite: Invite = {
    id,
    email: id,
    name: input.name.trim(),
    role: input.role,
    clientId: input.role === "client" ? input.clientId || null : null,
    clientIdLabel: input.role === "client" ? input.clientIdLabel || null : null,
    employeeId: employee?.id ?? null,
    employeeIdLabel: employee?.label ?? null,
    invitedBy: admin.id,
    invitedByName: admin.displayName,
    createdAt: Date.now(),
  };
  const { id: _omit, ...data } = invite;
  void _omit;
  await loggedSet(doc(db(), "invites", id), data);
  return invite;
}

export async function deleteInvite(id: string) {
  await loggedDelete(doc(db(), "invites", id));
}

/** Message an admin can send to the person they invited. */
export function inviteMessage(invite: Pick<Invite, "name" | "email">, roleLabel: string, appUrl: string, company: string) {
  return [
    `Hi ${invite.name},`,
    "",
    `You've been invited to ${company}'s ERP as ${roleLabel}.`,
    `Open ${appUrl} and sign in with Google using ${invite.email}. Your access is ready as soon as you sign in.`,
  ].join("\n");
}

/**
 * When an admin gives someone a team role: link the invite's employee record if there was one,
 * otherwise create a new employee record. Returns the fields to save on the user.
 */
export async function employeeLinkOnApproval(user: UserProfile, admin: UserProfile) {
  if (user.employeeId) return { employeeId: user.employeeId, employeeIdLabel: user.employeeIdLabel ?? user.displayName };
  const invite = await getDoc(doc(db(), "invites", inviteId(user.email)));
  let link: { id: string; label: string };
  if (invite.exists() && invite.data().employeeId) {
    link = { id: invite.data().employeeId, label: invite.data().employeeIdLabel ?? user.displayName };
    await loggedUpdate(doc(db(), "employees", link.id), { accountId: user.id, accountEmail: user.email, updatedAt: Date.now() });
  } else {
    link = await createEmployeeFor({ name: user.displayName, email: user.email, accountId: user.id }, admin);
  }
  if (invite.exists()) await loggedDelete(invite.ref);
  return { employeeId: link.id, employeeIdLabel: link.label };
}
