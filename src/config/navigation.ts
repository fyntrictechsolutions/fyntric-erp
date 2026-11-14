import { BarChart3, LayoutDashboard, Settings, ShieldCheck, type LucideIcon } from "lucide-react";
import { MODULES } from "@/config/modules";
import { canRead, INTERNAL_ROLES, type ModuleKey, type Role } from "@/config/roles";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Hidden unless the user can read this module. Omit for pages everyone sees. */
  module?: ModuleKey;
  /** Further limits the item to these roles. */
  roles?: Role[];
}

export interface NavSection {
  title?: string;
  items: NavItem[];
}

function moduleItem(key: ModuleKey, extra: Partial<NavItem> = {}): NavItem {
  const m = MODULES[key]!;
  return { label: m.title, href: m.href, icon: m.icon, module: key, ...extra };
}

/** Sidebar menu. Add a page here and it appears for every role allowed to read its module. */
export const NAVIGATION: NavSection[] = [
  { items: [{ label: "Dashboard", href: "/dashboard", icon: LayoutDashboard }] },
  {
    title: "People",
    items: [
      moduleItem("employees"),
      moduleItem("attendance", { roles: INTERNAL_ROLES }),
      moduleItem("leave", { roles: INTERNAL_ROLES }),
    ],
  },
  { title: "Sales", items: [moduleItem("leads"), moduleItem("estimates"), moduleItem("clients"), moduleItem("products")] },
  { title: "Delivery", items: [moduleItem("projects"), moduleItem("timesheets")] },
  { title: "Purchases", items: [moduleItem("purchases"), moduleItem("suppliers")] },
  { title: "Finance", items: [moduleItem("invoices"), moduleItem("payments"), moduleItem("expenses")] },
  { title: "Insights", items: [{ label: "Reports", href: "/reports", icon: BarChart3, module: "reports" }] },
  {
    title: "Admin",
    items: [
      { label: "Users & roles", href: "/admin/users", icon: ShieldCheck, module: "users" },
      { label: "Settings", href: "/settings", icon: Settings, module: "settings" },
    ],
  },
];

export function navVisible(item: NavItem, role: Role | "pending"): boolean {
  if (role === "pending") return false;
  if (item.roles && !item.roles.includes(role)) return false;
  return !item.module || canRead(role, item.module);
}
