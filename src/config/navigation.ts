import { BarChart3, Banknote, History, Images, LayoutDashboard, LifeBuoy, Settings, ShieldCheck, type LucideIcon } from "lucide-react";
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
    title: "HR",
    items: [
      moduleItem("employees"),
      moduleItem("attendance", { roles: INTERNAL_ROLES }),
      moduleItem("leave", { roles: INTERNAL_ROLES }),
      moduleItem("candidates"),
      { label: "Payroll", href: "/hr/payroll", icon: Banknote, module: "payroll" },
    ],
  },
  { title: "Sales", items: [moduleItem("leads"), moduleItem("estimates"), moduleItem("clients"), moduleItem("products"), { label: "Gallery", href: "/crm/gallery", icon: Images, module: "salesGallery" }] },
  { title: "Delivery", items: [moduleItem("projects"), moduleItem("timesheets")] },
  { title: "Purchases", items: [moduleItem("purchases"), moduleItem("suppliers")] },
  { title: "Finance", items: [moduleItem("invoices"), moduleItem("recurring"), moduleItem("payments"), moduleItem("expenses")] },
  { title: "Insights", items: [{ label: "Reports", href: "/reports", icon: BarChart3, module: "reports" }] },
  {
    title: "Admin",
    items: [
      { label: "Users & roles", href: "/admin/users", icon: ShieldCheck, module: "users" },
      { label: "Activity log", href: "/admin/logs", icon: History, module: "logs" },
      { label: "Settings", href: "/settings", icon: Settings, module: "settings" },
    ],
  },
  { items: [{ label: "Help & support", href: "/help", icon: LifeBuoy }] },
];

export function navVisible(item: NavItem, role: Role | "pending"): boolean {
  if (role === "pending") return false;
  if (item.roles && !item.roles.includes(role)) return false;
  return !item.module || canRead(role, item.module);
}
