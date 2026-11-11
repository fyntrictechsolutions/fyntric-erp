import { Building2, Handshake, Target } from "lucide-react";
import { createRecord, updateRecord } from "@/lib/records";
import { SERVICES } from "./options";
import type { ModuleDefinition } from "./types";

export const leadsModule: ModuleDefinition = {
  key: "leads",
  title: "Leads",
  singular: "Lead",
  description: "Sales pipeline from first enquiry to won deal.",
  icon: Target,
  href: "/crm/leads",
  ownerLabel: "Added by",
  statusField: "stage",
  searchFields: ["name", "company", "email", "phone", "service"],
  columns: ["name", "company", "service", "estimatedValue", "nextFollowUp", "stage"],
  fields: [
    { name: "name", label: "Contact name", type: "text", required: true },
    { name: "company", label: "Company", type: "text" },
    { name: "email", label: "Email", type: "email" },
    { name: "phone", label: "Phone / WhatsApp", type: "tel" },
    {
      name: "source",
      label: "Source",
      type: "select",
      defaultValue: "website",
      options: [
        { value: "website", label: "Website" },
        { value: "whatsapp", label: "WhatsApp" },
        { value: "referral", label: "Referral" },
        { value: "linkedin", label: "LinkedIn" },
        { value: "outreach", label: "Cold outreach" },
        { value: "event", label: "Event" },
        { value: "other", label: "Other" },
      ],
    },
    { name: "service", label: "Service interested in", type: "select", options: SERVICES },
    { name: "estimatedValue", label: "Estimated value", type: "currency" },
    {
      name: "stage",
      label: "Stage",
      type: "select",
      defaultValue: "new",
      options: [
        { value: "new", label: "New", tone: "blue" },
        { value: "contacted", label: "Contacted", tone: "violet" },
        { value: "qualified", label: "Qualified", tone: "violet" },
        { value: "proposal", label: "Proposal sent", tone: "amber" },
        { value: "negotiation", label: "Negotiation", tone: "amber" },
        { value: "won", label: "Won", tone: "green" },
        { value: "lost", label: "Lost", tone: "red" },
      ],
    },
    { name: "nextFollowUp", label: "Next follow-up", type: "date" },
    { name: "notes", label: "Notes", type: "textarea", wide: true },
  ],
  actions: [
    {
      label: "Convert to client",
      icon: Handshake,
      requires: "manager",
      when: (r) => r.stage !== "won" && r.stage !== "lost",
      confirm: "Create a client from this lead and mark the lead as won?",
      run: async (lead, { profile }) => {
        await createRecord(
          "clients",
          {
            name: (lead.company as string) || (lead.name as string),
            contactPerson: lead.name,
            email: lead.email,
            phone: lead.phone,
            status: "active",
            country: "India",
            notes: lead.notes,
            fromLeadId: lead.id,
          },
          profile,
        );
        await updateRecord("leads", lead.id, { stage: "won" });
      },
    },
  ],
};

export const clientsModule: ModuleDefinition = {
  key: "clients",
  title: "Clients",
  singular: "Client",
  description: "Companies you work with and their contact details.",
  icon: Building2,
  href: "/crm/clients",
  statusField: "status",
  searchFields: ["name", "contactPerson", "email", "city", "industry"],
  columns: ["name", "contactPerson", "email", "phone", "city", "status"],
  fields: [
    { name: "name", label: "Company name", type: "text", required: true },
    { name: "contactPerson", label: "Contact person", type: "text" },
    { name: "email", label: "Email", type: "email" },
    { name: "phone", label: "Phone", type: "tel" },
    { name: "industry", label: "Industry", type: "text" },
    { name: "gstin", label: "GSTIN", type: "text" },
    { name: "city", label: "City", type: "text" },
    { name: "country", label: "Country", type: "text", defaultValue: "India" },
    {
      name: "status",
      label: "Status",
      type: "select",
      defaultValue: "active",
      options: [
        { value: "active", label: "Active", tone: "green" },
        { value: "inactive", label: "Inactive", tone: "neutral" },
      ],
    },
    { name: "address", label: "Billing address", type: "textarea", wide: true },
    { name: "notes", label: "Notes", type: "textarea", wide: true },
  ],
};
