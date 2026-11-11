import type { ModuleKey } from "@/config/roles";
import { clientsModule, leadsModule } from "./crm";
import { expensesModule, invoicesModule } from "./finance";
import { attendanceModule, employeesModule, leaveModule } from "./hr";
import { projectsModule, timesheetsModule } from "./projects";
import type { ModuleDefinition } from "./types";

export type { FieldDefinition, ModuleDefinition, RecordAction, SelectOption } from "./types";

/** Every data module, keyed by module key. "users" is handled by the admin page. */
export const MODULES: Partial<Record<ModuleKey, ModuleDefinition>> = {
  employees: employeesModule,
  attendance: attendanceModule,
  leave: leaveModule,
  leads: leadsModule,
  clients: clientsModule,
  projects: projectsModule,
  timesheets: timesheetsModule,
  invoices: invoicesModule,
  expenses: expensesModule,
};

export function getModule(key: ModuleKey): ModuleDefinition {
  const mod = MODULES[key];
  if (!mod) throw new Error(`Unknown module: ${key}`);
  return mod;
}
