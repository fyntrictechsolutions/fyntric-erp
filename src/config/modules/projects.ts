import { FolderKanban, Timer } from "lucide-react";
import { todayISO } from "@/lib/format";
import { YES_NO } from "./options";
import type { ModuleDefinition } from "./types";

export const projectsModule: ModuleDefinition = {
  key: "projects",
  title: "Projects",
  singular: "Project",
  description: "Client projects with owners, deadlines and progress.",
  icon: FolderKanban,
  href: "/projects",
  statusField: "status",
  searchFields: ["name", "code", "clientIdLabel", "managerIdLabel"],
  columns: ["name", "clientId", "managerId", "dueDate", "progress", "status"],
  fields: [
    { name: "name", label: "Project name", type: "text", required: true },
    { name: "code", label: "Project code", type: "text", placeholder: "FT-P-001" },
    { name: "clientId", label: "Client", type: "reference", reference: { module: "clients", labelField: "name" } },
    { name: "managerId", label: "Project manager", type: "reference", reference: { module: "employees", labelField: "fullName" } },
    { name: "startDate", label: "Start date", type: "date", defaultValue: todayISO },
    { name: "dueDate", label: "Due date", type: "date" },
    { name: "budget", label: "Budget", type: "currency", hiddenFor: ["client", "staff"] },
    {
      name: "priority",
      label: "Priority",
      type: "select",
      defaultValue: "medium",
      options: [
        { value: "low", label: "Low", tone: "neutral" },
        { value: "medium", label: "Medium", tone: "blue" },
        { value: "high", label: "High", tone: "amber" },
        { value: "critical", label: "Critical", tone: "red" },
      ],
    },
    { name: "progress", label: "Progress (%)", type: "percent", min: 0, max: 100, defaultValue: 0, display: "progress" },
    {
      name: "status",
      label: "Status",
      type: "select",
      defaultValue: "planning",
      options: [
        { value: "planning", label: "Planning", tone: "violet" },
        { value: "in_progress", label: "In progress", tone: "blue" },
        { value: "on_hold", label: "On hold", tone: "amber" },
        { value: "completed", label: "Completed", tone: "green" },
        { value: "cancelled", label: "Cancelled", tone: "neutral" },
      ],
    },
    { name: "description", label: "Scope / description", type: "textarea", wide: true },
  ],
};

export const timesheetsModule: ModuleDefinition = {
  key: "timesheets",
  title: "Timesheets",
  singular: "Time entry",
  description: "Hours spent on each project.",
  icon: Timer,
  href: "/projects/timesheets",
  ownerLabel: "Employee",
  statusField: "billable",
  searchFields: ["userName", "projectIdLabel", "task"],
  columns: ["date", "projectId", "task", "hours", "billable"],
  fields: [
    { name: "date", label: "Date", type: "date", required: true, defaultValue: todayISO },
    { name: "projectId", label: "Project", type: "reference", required: true, reference: { module: "projects", labelField: "name" } },
    { name: "hours", label: "Hours", type: "number", required: true, min: 0, max: 24 },
    { name: "billable", label: "Billable", type: "select", defaultValue: "yes", options: YES_NO },
    { name: "task", label: "What did you work on?", type: "textarea", wide: true, required: true },
  ],
};
