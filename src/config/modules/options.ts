import type { SelectOption } from "./types";

/** Shared dropdown lists. Edit here to change them everywhere. */

export const DEPARTMENTS: SelectOption[] = [
  "Engineering",
  "Design",
  "Quality Assurance",
  "Sales & Marketing",
  "Human Resources",
  "Finance & Accounts",
  "Operations",
  "Management",
].map((d) => ({ value: d, label: d }));

export const SERVICES: SelectOption[] = [
  "Web development",
  "Mobile app development",
  "ERP / CRM solutions",
  "UI / UX design",
  "Cloud & DevOps",
  "AI & data",
  "Digital marketing",
  "Support & maintenance",
  "Other",
].map((s) => ({ value: s, label: s }));

export const YES_NO: SelectOption[] = [
  { value: "yes", label: "Yes", tone: "green" },
  { value: "no", label: "No", tone: "neutral" },
];

export const APPROVAL_STATUS: SelectOption[] = [
  { value: "pending", label: "Pending", tone: "amber" },
  { value: "approved", label: "Approved", tone: "green" },
  { value: "rejected", label: "Rejected", tone: "red" },
];
