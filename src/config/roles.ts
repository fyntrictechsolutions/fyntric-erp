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

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  admin: "Runs the company account: everything, including users, settings, purchases and payments.",
  project_manager: "Owns projects and timesheets, edits attendance, and can see sales and finance for delivery.",
  hr_manager: "Runs hiring, salaries, payroll, resignations and leave approvals, and sees the team's employee records and attendance.",
  sales: "Works leads, follow-ups, estimates, clients and invoices, and records payments received.",
  staff: "Checks in, applies for leave, logs timesheets, claims expenses, and works on the projects whose team they're in.",
  client: "Sees only their own company's projects and invoices.",
  investor: "Read-only view of the business: projects, finance, purchases and reports.",
  viewer: "Read-only view of sales, projects, team and reports.",
};

/** Roles that belong to Fyntric employees (they get attendance, leave, timesheets, expenses). */
export const INTERNAL_ROLES: Role[] = ["admin", "project_manager", "hr_manager", "sales", "staff"];

/** Roles that get an employee record automatically when approved or invited. */
export const EMPLOYEE_ROLES: Role[] = ["project_manager", "hr_manager", "sales", "staff"];

export type ModuleKey =
  | "employees"
  | "attendance"
  | "leave"
  | "candidates"
  | "salaries"
  | "payroll"
  | "exits"
  | "leads"
  | "followups"
  | "estimates"
  | "clients"
  | "products"
  | "salesGallery"
  | "documents"
  | "projects"
  | "timesheets"
  | "suppliers"
  | "purchases"
  | "invoices"
  | "payments"
  | "recurring"
  | "expenses"
  | "reports"
  | "settings"
  | "users"
  | "logs";

/**
 * How much of a module a role can see.
 * - "all": every record
 * - "own": only records the user created (matched on `userId`)
 * - "client": only records linked to the user's client account (matched on `clientId`)
 * - "team": only records whose `teamIds` include the user's employee record (projects they work on)
 * - "none": the module is hidden
 */
export type ReadScope = "all" | "own" | "client" | "team" | "none";

export interface ModulePermission {
  read: ReadScope;
  /** Can add new records. Records are always stamped with the creator's userId. */
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

/** Builds one module's row: admin always has FULL, everyone else NONE unless listed. */
function row(perms: Partial<Record<Role, ModulePermission>>): Record<Role, ModulePermission> {
  return {
    admin: FULL,
    project_manager: NONE,
    hr_manager: NONE,
    sales: NONE,
    staff: NONE,
    client: NONE,
    investor: NONE,
    viewer: NONE,
    ...perms,
  };
}

/** Same permission for every internal role except admin. */
function staffWide(p: ModulePermission): Partial<Record<Role, ModulePermission>> {
  return { project_manager: p, hr_manager: p, sales: p, staff: p };
}

export const PERMISSIONS: Record<ModuleKey, Record<Role, ModulePermission>> = {
  // People
  employees: row({ hr_manager: READ_ALL, project_manager: READ_ALL, investor: READ_ALL, viewer: READ_ALL }),
  attendance: row({
    ...staffWide({ read: "own", create: true, update: "none", delete: "none" }),
    // Managers see everyone's attendance on the employee pages; PM can also correct entries.
    project_manager: { read: "all", create: true, update: "all", delete: "none" },
    hr_manager: { read: "all", create: true, update: "none", delete: "none" },
    investor: READ_ALL,
    viewer: READ_ALL,
  }),
  leave: row({
    ...staffWide(OWN),
    hr_manager: FULL,
    project_manager: { ...OWN, read: "all" },
    investor: READ_ALL,
    viewer: READ_ALL,
  }),
  // Hiring, pay and exits are HR's own work: Admin and HR Manager only.
  candidates: row({ hr_manager: FULL }),
  salaries: row({ hr_manager: FULL }),
  // HR runs payroll; everyone on the team sees their own paid payslips (matched on the payslip's accountId).
  payroll: row({ ...staffWide({ read: "own", create: false, update: "none", delete: "none" }), hr_manager: FULL }),
  exits: row({ hr_manager: FULL }),

  // Sales
  leads: row({ sales: FULL, project_manager: READ_ALL, viewer: READ_ALL }),
  followups: row({ sales: FULL, project_manager: READ_ALL, viewer: READ_ALL }),
  estimates: row({ sales: FULL, project_manager: READ_ALL, investor: READ_ALL, viewer: READ_ALL }),
  clients: row({ sales: FULL, project_manager: READ_ALL, investor: READ_ALL, viewer: READ_ALL }),
  // Other Staff (engineering) don't see selling prices or sales material: the Sales section is hidden for them.
  products: row({ ...staffWide(READ_ALL), staff: NONE, sales: FULL, investor: READ_ALL, viewer: READ_ALL }),
  // Files about products (photos, brochures, demo videos): same people as the price list.
  salesGallery: row({ ...staffWide(READ_ALL), staff: NONE, sales: FULL, investor: READ_ALL, viewer: READ_ALL }),
  // Company profile, case studies, NDAs, questionnaires, proposals and agreements.
  documents: row({ sales: FULL, project_manager: READ_ALL }),

  // Delivery
  // Other Staff see only the projects whose team they're in.
  projects: row({ ...staffWide(READ_ALL), staff: { read: "team", create: false, update: "none", delete: "none" }, project_manager: FULL, client: CLIENT_READ, investor: READ_ALL, viewer: READ_ALL }),
  timesheets: row({ ...staffWide(OWN), project_manager: FULL }),

  // Purchases
  suppliers: row({ investor: READ_ALL, viewer: READ_ALL }),
  purchases: row({ investor: READ_ALL, viewer: READ_ALL }),

  // Finance
  invoices: row({
    sales: { read: "all", create: true, update: "all", delete: "none" },
    // To work out sales commission on payroll.
    hr_manager: READ_ALL,
    project_manager: READ_ALL,
    client: CLIENT_READ,
    investor: READ_ALL,
    viewer: READ_ALL,
  }),
  payments: row({ sales: { read: "all", create: true, update: "none", delete: "none" }, investor: READ_ALL, viewer: READ_ALL }),
  // Whoever raises invoices keeps the schedule (and moves it on when they bill a period).
  recurring: row({ sales: { read: "all", create: true, update: "all", delete: "none" }, investor: READ_ALL, viewer: READ_ALL }),
  expenses: row({ ...staffWide(OWN), investor: READ_ALL, viewer: READ_ALL }),

  // Insights and administration (pages, not collections)
  reports: row({ investor: READ_ALL, viewer: READ_ALL }),
  settings: row({}),
  users: row({}),
  // Admins only, and read-only: entries can't be edited or deleted.
  logs: row({}),
};

/** Modules shown in the role matrix, with a readable name. */
export const MODULE_LABELS: Record<ModuleKey, string> = {
  employees: "Employees",
  attendance: "Attendance",
  leave: "Leave",
  candidates: "Hiring (candidates)",
  salaries: "Salary structure",
  payroll: "Payroll",
  exits: "Resignations",
  leads: "Leads",
  followups: "Lead follow-ups",
  estimates: "Estimates",
  clients: "Clients",
  products: "Products & services",
  salesGallery: "Sales gallery",
  documents: "Sales documents",
  projects: "Projects",
  timesheets: "Timesheets",
  suppliers: "Suppliers",
  purchases: "Purchase bills",
  invoices: "Invoices",
  payments: "Payments",
  recurring: "Recurring billing",
  expenses: "Expenses",
  reports: "Reports",
  settings: "Settings",
  users: "Users & roles",
  logs: "Activity log",
};

export function permissionFor(role: UserRole | undefined, module: ModuleKey): ModulePermission {
  if (!role || role === "pending") return NONE;
  return PERMISSIONS[module][role] ?? NONE;
}

export function canRead(role: UserRole | undefined, module: ModuleKey): boolean {
  return permissionFor(role, module).read !== "none";
}

/** One-word summary of a permission for the role matrix. */
export function describePermission(p: ModulePermission): string {
  if (p.read === "none") return "—";
  if (p.read === "client") return "Own company";
  if (p.read === "team") return "Their team's (view)";
  if (p.read === "own") return p.create ? "Own entries" : "Own (view)";
  if (p.update === "all" && p.delete === "all") return "Full";
  if (p.update === "all") return "Add & edit";
  if (p.create) return p.update === "own" ? "View all, edit own" : "View & add";
  return "View";
}
