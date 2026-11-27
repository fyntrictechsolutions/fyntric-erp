import { Building2, Handshake, Target } from "lucide-react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { createRecord, deleteRecord, updateRecord } from "@/lib/records";
import { moveLeadDocsToClient } from "@/lib/salesDocs";
import { nowTime, todayISO } from "@/lib/format";
import type { ModuleDefinition } from "./types";

export const leadsModule: ModuleDefinition = {
  key: "leads",
  title: "Leads",
  singular: "Lead",
  description: "Sales pipeline from first enquiry to won deal.",
  icon: Target,
  href: "/crm/leads",
  ownerLabel: "Added by",
  detailHref: (id) => `/crm/leads/view?id=${id}`,
  // Every new lead starts with an introduction call at the moment it was added. A summary typed into
  // the new-lead form means that call already happened.
  afterCreate: async (id, data, { profile }) => {
    const summary = typeof data.firstCallSummary === "string" ? data.firstCallSummary.trim() : "";
    await createRecord(
      "followups",
      {
        leadId: id,
        leadIdLabel: data.name,
        date: todayISO(),
        time: nowTime(),
        mode: "Phone call",
        goal: "Introduction Call",
        status: summary ? "done" : "scheduled",
        summary: summary || null,
        isFirstCall: true,
      },
      profile,
    );
  },
  statusField: "stage",
  searchFields: ["name", "company", "email", "phone", "address", "service"],
  columns: [{ label: "Lead", fields: ["name", "company", "phone"] }, "service", "estimatedValue", "stage"],
  fields: [
    { name: "name", label: "Contact name", type: "text", required: true },
    { name: "company", label: "Company", type: "text" },
    { name: "email", label: "Email", type: "email" },
    { name: "phone", label: "Phone / WhatsApp", type: "tel" },
    { name: "address", label: "Address", type: "textarea", wide: true },
    { name: "source", label: "Source", type: "select", list: "leadSources" },
    { name: "service", label: "Services interested in", type: "multiselect", list: "services", wide: true, help: "Pick one or more." },
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
      quickEdit: true,
    },
    { name: "notes", label: "Notes", type: "textarea", wide: true },
    {
      name: "firstCallSummary",
      label: "Summary of discussion",
      type: "textarea",
      wide: true,
      createOnly: true,
      help: "What you talked about in the first call. It's saved on the lead's first call in the follow-up list.",
    },
  ],
  actions: [
    {
      label: "Convert to client",
      icon: Handshake,
      requires: "manager",
      // Also for leads marked "Won" by hand, as long as no client was made from them yet.
      when: (r) => r.stage !== "lost" && !r.clientId,
      confirm: "Create a client from this lead and mark the lead as won?",
      run: async (lead, { profile }) => {
        const client = await createRecord(
          "clients",
          {
            name: (lead.company as string) || (lead.name as string),
            contactPerson: lead.name,
            email: lead.email,
            phone: lead.phone,
            address: lead.address,
            status: "active",
            country: "India",
            notes: lead.notes,
            fromLeadId: lead.id,
          },
          profile,
        );
        const label = (lead.company as string) || (lead.name as string);
        await updateRecord("leads", lead.id, { stage: "won", clientId: client.id, clientIdLabel: label });
        // The lead's documents (NDA, SOW…) now belong to the client too: the same records, shown on both pages.
        await moveLeadDocsToClient(lead.id, client.id, label).catch(() => undefined);
      },
    },
  ],
  // Follow-up calls belong to the lead, so they go with it. Estimates stay as a record of what was quoted.
  afterDelete: async (lead) => {
    const snap = await getDocs(query(collection(db(), "followups"), where("leadId", "==", lead.id)));
    await Promise.all(snap.docs.map((d) => deleteRecord("followups", d.id)));
  },
};

export const clientsModule: ModuleDefinition = {
  key: "clients",
  title: "Clients",
  singular: "Client",
  description: "Companies you work with and their contact details.",
  icon: Building2,
  href: "/crm/clients",
  detailHref: (id) => `/crm/clients/view?id=${id}`,
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
