import type { ModuleKey } from "@/config/roles";
import { clientsModule, leadsModule } from "./crm";
import { expensesModule, invoicesModule, paymentsModule } from "./finance";
import { attendanceModule, employeesModule, leaveModule } from "./hr";
import { projectsModule, timesheetsModule } from "./projects";
import { purchasesModule, suppliersModule } from "./purchases";
import { estimatesModule, followupsModule, productsModule } from "./sales";
import type { ModuleDefinition } from "./types";

export type { FieldDefinition, FormContext, LineItem, ModuleDefinition, RecordAction, SelectOption } from "./types";

/** Every data module, keyed by module key. Reports, settings and users are pages, not modules. */
export const MODULES: Partial<Record<ModuleKey, ModuleDefinition>> = {
  employees: employeesModule,
  attendance: attendanceModule,
  leave: leaveModule,
  leads: leadsModule,
  followups: followupsModule,
  estimates: estimatesModule,
  clients: clientsModule,
  products: productsModule,
  projects: projectsModule,
  timesheets: timesheetsModule,
  suppliers: suppliersModule,
  purchases: purchasesModule,
  invoices: invoicesModule,
  payments: paymentsModule,
  expenses: expensesModule,
};

export function getModule(key: ModuleKey): ModuleDefinition {
  const mod = MODULES[key];
  if (!mod) throw new Error(`Unknown module: ${key}`);
  return mod;
}
