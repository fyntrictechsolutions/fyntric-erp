import { UserSearch } from "lucide-react";
import { todayISO } from "@/lib/format";
import type { ModuleDefinition, SelectOption } from "./types";

export const CANDIDATE_STAGES: SelectOption[] = [
  { value: "applied", label: "Applied", tone: "neutral" },
  { value: "interviewing", label: "Interviewing", tone: "blue" },
  { value: "offered", label: "Offer sent", tone: "violet" },
  { value: "hired", label: "Joined team", tone: "green" },
  { value: "rejected", label: "Not selected", tone: "red" },
  { value: "withdrawn", label: "Withdrawn", tone: "amber" },
];

export const INTERVIEW_PHASES = [
  { key: "phase1", label: "Phase 1" },
  { key: "phase2", label: "Phase 2" },
  { key: "phase3", label: "Phase 3" },
] as const;

export const INTERVIEW_STATUS: SelectOption[] = [
  { value: "pending", label: "Pending", tone: "amber" },
  { value: "passed", label: "Passed", tone: "green" },
  { value: "failed", label: "Not passed", tone: "red" },
];

export const candidatesModule: ModuleDefinition = {
  key: "candidates",
  title: "Hiring",
  singular: "Candidate",
  description: "Job applicants, their interviews and offers. Open a candidate to schedule interviews.",
  icon: UserSearch,
  href: "/hr/hiring",
  detailHref: (id) => `/hr/hiring/view?id=${id}`,
  statusField: "stage",
  searchFields: ["fullName", "email", "phone", "designation", "source"],
  columns: ["fullName", "designation", "experienceYears", "source", "appliedDate", "stage"],
  fields: [
    { name: "fullName", label: "Full name", type: "text", required: true },
    { name: "email", label: "Email", type: "email", required: true, help: "Use their Google account; they sign in with it if hired." },
    { name: "phone", label: "Phone / WhatsApp", type: "tel" },
    { name: "dateOfBirth", label: "Date of birth", type: "date" },
    { name: "city", label: "Current city", type: "text" },
    { name: "designation", label: "Applied for (designation)", type: "text", required: true, placeholder: "e.g. Flutter Developer" },
    { name: "department", label: "Department", type: "select", list: "departments" },
    { name: "source", label: "Source", type: "select", list: "candidateSources" },
    { name: "appliedDate", label: "Applied on", type: "date", defaultValue: () => todayISO() },
    { name: "experienceYears", label: "Experience (years)", type: "number", min: 0, max: 50 },
    { name: "currentCtc", label: "Current CTC (yearly)", type: "currency", min: 0 },
    { name: "expectedCtc", label: "Expected CTC (yearly)", type: "currency", min: 0 },
    { name: "noticePeriod", label: "Notice period at current job", type: "text", placeholder: "e.g. 30 days" },
    { name: "stage", label: "Stage", type: "select", defaultValue: "applied", options: CANDIDATE_STAGES },
    { name: "address", label: "Address", type: "textarea", wide: true },
    { name: "education", label: "Educational qualifications", type: "textarea", wide: true, placeholder: "Degree, college, year, score" },
    { name: "experience", label: "Work experience", type: "textarea", wide: true, placeholder: "Company, role, years, key work" },
    { name: "candidateNote", label: "Candidate's note", type: "textarea", wide: true, help: "Anything the candidate asked us to know." },
    { name: "staffRemarks", label: "Staff-only remarks", type: "textarea", wide: true, help: "Never shared with the candidate." },
  ],
};
