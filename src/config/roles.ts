/**
 * Roles and what each role may do in each module.
 *
 * This is the single source of truth for the UI (menus, buttons, queries).
 * The same rules are enforced on the server by `firestore.rules`; when you
 * change a permission here, change it there too (see docs/roles-and-permissions.md).
 */

export const ROLES = [
  "admin",
  "project_manager",
  "hr_manager",
  "sales",
  "staff",
  "client",
  "investor",
  "viewer",
] as const;

export type Role = (typeof ROLES)[number];

/** A signed-up user who has not been given a role by an admin yet. */
export type UserRole = Role | "pending";

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Admin",
  project_manager: "Project Manager",
  hr_manager: "HR Manager",
  sales: "Sales Staff",
  staff: "Other Staff",
  client: "Client",
  investor: "Investor",
  viewer: "Viewer",
  pending: "Pending approval",
};

/** Roles that belong to Fyntric employees (they get attendance, leave, timesheets, expenses). */
export const INTERNAL_ROLES: Role[] = ["admin", "project_manager", "hr_manager", "sales", "staff"];

export type ModuleKey =
  | "employees"
  | "attendance"
  | "leave"
  | "leads"
  | "clients"
  | "projects"
  | "timesheets"
  | "invoices"
  | "expenses"
  | "users";

/**
 * How much of a module a role can see.
 * - "all": every record
 * - "own": only records the user created (matched on `userId`)
 * - "client": only records linked to the user's client account (matched on `clientId`)
 * - "none": the module is hidden
 */
export type ReadScope = "all" | "own" | "client" | "none";

export interface ModulePermission {
  read: ReadScope;
  /** Can add new records. Records created by "own"-scoped users are stamped with their userId. */
  create: boolean;
  /** Can edit any record ("all"), only their own ("own"), or nothing. */
  update: "all" | "own" | "none";
  delete: "all" | "own" | "none";
}

const NONE: ModulePermission = { read: "none", create: false, update: "none", delete: "none" };
const READ_ALL: ModulePermission = { read: "all", create: false, update: "none", delete: "none" };
const FULL: ModulePermission = { read: "all", create: true, update: "all", delete: "all" };
const OWN: ModulePermission = { read: "own", create: true, update: "own", delete: "own" };
const CLIENT_READ: ModulePermission = { read: "client", create: false, update: "none", delete: "none" };

/** Same permissions for every internal staff role, overridden per role where needed. */
function internal(overrides: Partial<Record<Role, ModulePermission>>, base: ModulePermission): Record<Role, ModulePermission> {
  return {
    admin: FULL,
    project_manager: base,
    hr_manager: base,
    sales: base,
    staff: base,
    client: NONE,
    investor: NONE,
    viewer: NONE,
    ...overrides,
  };
}

export const PERMISSIONS: Record<ModuleKey, Record<Role, ModulePermission>> = {
  // HR
  employees: internal({ hr_manager: FULL, investor: NONE }, READ_ALL),
  attendance: internal({ hr_manager: FULL }, OWN),
  leave: internal({ hr_manager: FULL }, OWN),

  // CRM
  leads: internal({ sales: FULL, project_manager: READ_ALL, viewer: READ_ALL }, NONE),
  clients: internal({ sales: FULL, project_manager: READ_ALL, investor: READ_ALL, viewer: READ_ALL }, NONE),

  // Projects
  projects: internal(
    { project_manager: FULL, client: CLIENT_READ, investor: READ_ALL, viewer: READ_ALL },
    READ_ALL,
  ),
  timesheets: internal({ project_manager: FULL }, OWN),

  // Finance
  invoices: internal(
    { sales: { read: "all", create: true, update: "all", delete: "none" }, project_manager: READ_ALL, client: CLIENT_READ, investor: READ_ALL },
    NONE,
  ),
  expenses: internal({ investor: READ_ALL }, OWN),

  // Administration
  users: internal({}, NONE),
};

export function permissionFor(role: UserRole | undefined, module: ModuleKey): ModulePermission {
  if (!role || role === "pending") return NONE;
  return PERMISSIONS[module][role];
}

export function canRead(role: UserRole | undefined, module: ModuleKey): boolean {
  return permissionFor(role, module).read !== "none";
}
