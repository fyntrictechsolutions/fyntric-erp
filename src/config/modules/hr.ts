import { CalendarCheck, CalendarOff, Check, Users, X } from "lucide-react";
import { daysInclusive, hoursBetween, nowTime, todayISO } from "@/lib/format";
import { APPROVAL_STATUS, DEPARTMENTS } from "./options";
import type { ModuleDefinition } from "./types";

export const employeesModule: ModuleDefinition = {
  key: "employees",
  title: "Employees",
  singular: "Employee",
  description: "Team directory with roles, departments and joining details.",
  icon: Users,
  href: "/hr/employees",
  statusField: "status",
  searchFields: ["fullName", "employeeCode", "email", "designation", "department"],
  columns: ["fullName", "employeeCode", "department", "designation", "joiningDate", "status"],
  fields: [
    { name: "fullName", label: "Full name", type: "text", required: true },
    { name: "employeeCode", label: "Employee ID", type: "text", placeholder: "FT-001" },
    { name: "email", label: "Work email", type: "email" },
    { name: "phone", label: "Phone", type: "tel" },
    { name: "department", label: "Department", type: "select", options: DEPARTMENTS },
    { name: "designation", label: "Designation", type: "text", placeholder: "Senior Developer" },
    {
      name: "employmentType",
      label: "Employment type",
      type: "select",
      defaultValue: "full_time",
      options: [
        { value: "full_time", label: "Full-time" },
        { value: "part_time", label: "Part-time" },
        { value: "contract", label: "Contract" },
        { value: "intern", label: "Intern" },
      ],
    },
    { name: "joiningDate", label: "Joining date", type: "date" },
    {
      name: "status",
      label: "Status",
      type: "select",
      defaultValue: "active",
      options: [
        { value: "active", label: "Active", tone: "green" },
        { value: "notice", label: "On notice", tone: "amber" },
        { value: "exited", label: "Exited", tone: "neutral" },
      ],
    },
    { name: "emergencyContact", label: "Emergency contact", type: "text" },
    { name: "address", label: "Address", type: "textarea", wide: true },
  ],
};

export const attendanceModule: ModuleDefinition = {
  key: "attendance",
  title: "Attendance",
  singular: "Attendance entry",
  description: "Daily check-in and check-out times.",
  icon: CalendarCheck,
  href: "/hr/attendance",
  ownerLabel: "Employee",
  statusField: "workMode",
  searchFields: ["userName", "date", "notes"],
  columns: ["date", "checkIn", "checkOut", "hours", "workMode"],
  fields: [
    { name: "date", label: "Date", type: "date", required: true, defaultValue: todayISO, lockedAfterCreate: true },
    { name: "checkIn", label: "Check-in", type: "time", required: true, defaultValue: nowTime, lockedAfterCreate: true },
    { name: "checkOut", label: "Check-out", type: "time" },
    { name: "hours", label: "Hours", type: "number", computed: true },
    {
      name: "workMode",
      label: "Work mode",
      type: "select",
      defaultValue: "office",
      lockedAfterCreate: true,
      options: [
        { value: "office", label: "Office", tone: "blue" },
        { value: "remote", label: "Remote", tone: "violet" },
        { value: "client_site", label: "Client site", tone: "amber" },
      ],
    },
    { name: "notes", label: "Notes", type: "textarea", wide: true },
  ],
  beforeSave: (data) => ({ ...data, hours: hoursBetween(data.checkIn, data.checkOut) ?? null }),
};

export const leaveModule: ModuleDefinition = {
  key: "leave",
  title: "Leave",
  singular: "Leave request",
  description: "Apply for leave and track approvals.",
  icon: CalendarOff,
  href: "/hr/leave",
  ownerLabel: "Employee",
  statusField: "status",
  searchFields: ["userName", "reason", "leaveType"],
  columns: ["leaveType", "fromDate", "toDate", "days", "status"],
  fields: [
    {
      name: "leaveType",
      label: "Leave type",
      type: "select",
      required: true,
      defaultValue: "casual",
      options: [
        { value: "casual", label: "Casual" },
        { value: "sick", label: "Sick" },
        { value: "earned", label: "Earned" },
        { value: "wfh", label: "Work from home" },
        { value: "unpaid", label: "Unpaid" },
      ],
    },
    { name: "fromDate", label: "From", type: "date", required: true, defaultValue: todayISO },
    { name: "toDate", label: "To", type: "date", required: true, defaultValue: todayISO },
    { name: "days", label: "Days", type: "number", computed: true },
    { name: "reason", label: "Reason", type: "textarea", wide: true, required: true },
    { name: "status", label: "Status", type: "select", managerOnly: true, defaultValue: "pending", options: APPROVAL_STATUS },
    { name: "reviewNote", label: "Reviewer note", type: "textarea", wide: true, managerOnly: true },
  ],
  ownerEditableWhen: (r) => r.status === "pending",
  beforeSave: (data) => ({ ...data, days: daysInclusive(data.fromDate, data.toDate) ?? null }),
  actions: [
    {
      label: "Approve",
      icon: Check,
      requires: "manager",
      when: (r) => r.status === "pending",
      patch: (_r, { profile }) => ({ status: "approved", reviewedBy: profile.displayName }),
    },
    {
      label: "Reject",
      icon: X,
      variant: "danger",
      requires: "manager",
      when: (r) => r.status === "pending",
      patch: (_r, { profile }) => ({ status: "rejected", reviewedBy: profile.displayName }),
    },
  ],
};
