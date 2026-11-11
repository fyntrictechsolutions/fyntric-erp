import { LayoutDashboard, ShieldCheck, type LucideIcon } from "lucide-react";
import type { ModuleKey } from "@/config/roles";
import { MODULES } from "@/config/modules";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Hidden unless the user can read this module. Omit for pages everyone sees. */
  module?: ModuleKey;
}

export interface NavSection {
  title?: string;
  items: NavItem[];
}

function moduleItem(key: ModuleKey): NavItem {
  const m = MODULES[key]!;
  return { label: m.title, href: m.href, icon: m.icon, module: key };
}

/** Sidebar menu. Add a page here and it appears for every role allowed to read its module. */
export const NAVIGATION: NavSection[] = [
  { items: [{ label: "Dashboard", href: "/dashboard", icon: LayoutDashboard }] },
  { title: "People", items: [moduleItem("employees"), moduleItem("attendance"), moduleItem("leave")] },
  { title: "Sales", items: [moduleItem("leads"), moduleItem("clients")] },
  { title: "Delivery", items: [moduleItem("projects"), moduleItem("timesheets")] },
  { title: "Finance", items: [moduleItem("invoices"), moduleItem("expenses")] },
  { title: "Admin", items: [{ label: "Users & roles", href: "/admin/users", icon: ShieldCheck, module: "users" }] },
];
