import { collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import type { LineItem } from "@/config/modules/types";
import type { BusinessSettings } from "@/config/settingsDefaults";
import { docNumber } from "@/config/modules/options";
import { loggedAdd, loggedDelete, loggedUpdate } from "@/lib/audit";
import { db, storage } from "@/lib/firebase";
import { formatDate, todayISO } from "@/lib/format";
import { groupedTotals } from "@/lib/lineItems";
import { fillTemplate } from "@/lib/offerLetter";
import type { BaseRecord, UserProfile } from "@/types";

/**
 * Documents sent to leads and clients, from the first email to the signed contract.
 *
 * - Library (shared with every lead): the company profile (documents/company-profile) and case studies.
 * - Per lead or client: NDA, discovery questionnaire, proposal / SOW with quotation (with revisions and an
 *   acceptance page) and the software development agreement. Each starts from a template (Sales → Documents
 *   → Templates, stored as documents/template-<kind>) and is then edited freely.
 *
 * Sharing copies the finished document to shared/{token}: anyone with the link can read that copy (and print
 * or save it as PDF), nothing else. Sharing again refreshes it; Stop sharing deletes it.
 */

export type DocKind = "profile" | "case_study" | "nda" | "questionnaire" | "proposal" | "agreement";
export type DocStatus = "draft" | "sent" | "signed" | "superseded";

export interface Section {
  heading: string;
  body: string;
}

export interface Party {
  name: string;
  contact?: string;
  address?: string;
  email?: string;
  phone?: string;
}

export interface Fact {
  label: string;
  value: string;
}

export interface Milestone {
  label: string;
  percent: number;
}

export interface DocImage {
  url: string;
  path: string;
  caption?: string;
}

/** A document's own fields (what the shared copy carries). */
export interface DocFields {
  kind: DocKind;
  title: string;
  number?: string;
  status: DocStatus;
  /** Date printed on the document. */
  date?: string;
  /** The other side (lead or client company). */
  party?: Party | null;
  leadId?: string | null;
  leadIdLabel?: string | null;
  clientId?: string | null;
  clientIdLabel?: string | null;
  projectId?: string | null;
  projectIdLabel?: string | null;
  sections: Section[];
  /** Proposals: the price, copied from an estimate. */
  estimateId?: string | null;
  estimateNumber?: string | null;
  items?: LineItem[];
  discountOnce?: number | null;
  discountAnnually?: number | null;
  discountMonthly?: number | null;
  validUntil?: string | null;
  /** Proposals: line under the title, e.g. "Scope of Work & Commercial Quotation · Android & iOS". */
  subtitle?: string;
  /** Proposals: key details shown in the box under the title (client location, duration, support…). */
  facts?: Fact[];
  /** Proposals: e.g. "replaces initial estimate", shown next to the revision number. */
  revisionNote?: string;
  /** Proposals: total project cost. Filled from the estimate's one-time total; can be typed in. */
  totalPrice?: number | null;
  /** Proposals: show the estimate's lines as well as the total. */
  showItems?: boolean;
  /** Proposals: payment milestones as a share of the total. */
  milestones?: Milestone[];
  /** Proposals: yearly maintenance from the second year, as % of the total. */
  amcPercent?: number | null;
  /** Proposals: revision 1, 2, 3… and the one it replaced. */
  version?: number;
  previousId?: string | null;
  /** Case studies: one line for lists, services it matches (to suggest it for a lead), screenshots. */
  summary?: string;
  services?: string[];
  images?: DocImage[];
  /** Templates (one per kind) and the company profile are library entries. */
  template?: boolean;
  /** Who signed or accepted it for the other side, and when. */
  signedBy?: string | null;
  signedTitle?: string | null;
  signedOn?: string | null;
  shareToken?: string | null;
  sharedAt?: number | null;
  createdAt?: number;
  updatedAt?: number;
  userName?: string;
}

export type SalesDoc = BaseRecord & DocFields;

export const KINDS: Record<DocKind, { label: string; short: string; prefix: string; story: string; signed: string }> = {
  profile: { label: "Company profile", short: "Profile", prefix: "", story: "Introduction", signed: "" },
  case_study: { label: "Case study", short: "Case study", prefix: "CS", story: "Introduction", signed: "" },
  nda: { label: "Mutual NDA", short: "NDA", prefix: "NDA", story: "Discovery", signed: "Signed" },
  questionnaire: { label: "Discovery questionnaire", short: "Questionnaire", prefix: "DQ", story: "Discovery", signed: "Completed" },
  proposal: { label: "Scope of work & quotation", short: "SOW / Quotation", prefix: "QT", story: "Proposal", signed: "Accepted" },
  agreement: { label: "Software development agreement", short: "Agreement", prefix: "AGR", story: "Closing", signed: "Signed" },
};

/** Documents made for one lead or client, in the order they're usually sent. */
export const DEAL_KINDS: DocKind[] = ["nda", "questionnaire", "proposal", "agreement"];

export const statusLabel = (d: Pick<SalesDoc, "kind" | "status">) =>
  d.status === "signed" ? KINDS[d.kind].signed || "Done" : d.status === "superseded" ? "Replaced" : d.status === "sent" ? "Sent" : "Draft";

export const statusTone = (s: DocStatus) => (s === "signed" ? "green" : s === "sent" ? "blue" : s === "superseded" ? "neutral" : "amber") as "green" | "blue" | "neutral" | "amber";

/** Proposal defaults (also kept on the proposal template). */
export const DEFAULT_FACTS: Fact[] = [
  { label: "Client location", value: "" },
  { label: "Project duration", value: "Maximum 3 months (90 days)" },
  { label: "Support", value: "12 months after go-live" },
];
export const DEFAULT_MILESTONES: Milestone[] = [
  { label: "Project initiation (advance, on acceptance of this quotation)", percent: 40 },
  { label: "Development milestone (build review)", percent: 30 },
  { label: "Testing & final review (UAT build delivered)", percent: 20 },
  { label: "Deployment & handover (production launch)", percent: 10 },
];
export const DEFAULT_SUBTITLE = "Scope of Work & Commercial Quotation";
export const DEFAULT_AMC = 15;
const VALID_DAYS = 15;

/** The proposal's total: the typed-in price, or else the estimate's one-time total. */
export function proposalTotal(d: Pick<DocFields, "totalPrice" | "items" | "discountOnce">): number | null {
  if (d.totalPrice !== undefined && d.totalPrice !== null && !Number.isNaN(Number(d.totalPrice))) return Number(d.totalPrice);
  const once = groupedTotals(d.items ?? [], { once: d.discountOnce }).find((g) => g.key === "once");
  return once ? once.total : null;
}

export const PROFILE_ID = "company-profile";
export const templateId = (kind: DocKind) => `template-${kind}`;

// ---------- Default wording ----------

const S = (heading: string, body: string): Section => ({ heading, body });

export function defaultSections(kind: DocKind): Section[] {
  switch (kind) {
    case "profile":
      return [
        S("Who we are", "{company} helps businesses turn ideas, processes and operational challenges into scalable digital products. We build websites, mobile apps, CRM platforms, SaaS products, AI automation systems and blockchain solutions for businesses in India, the GCC and selected international markets."),
        S("Our team", "- Project management and business analysis\n- UI/UX design\n- Web and mobile developers\n- Quality assurance\n- Cloud and DevOps\n- Support and maintenance"),
        S("Services", "- Web development\n- Mobile app development\n- E-commerce, Shopify and WordPress development\n- Custom software development\n- CRM development\n- SaaS development\n- AI automation and AI agents\n- Blockchain development\n- Digital marketing"),
        S("Technologies", "Next.js, React, Flutter, Node.js, Python, PHP, PostgreSQL, MySQL, MongoDB, Firebase, AWS, Shopify and WooCommerce."),
        S("How we work", "1. Discovery and requirements\n2. Product and technical strategy\n3. UI/UX design\n4. Development in short, reviewed milestones\n5. Testing and quality assurance\n6. Deployment\n7. Support and improvements"),
        S("Industries we serve", "Retail and supermarkets, education, healthcare, real estate, automotive, logistics and distribution, hospitality, travel and tourism, startups and growing businesses."),
        S("Why clients choose us", "- Business-focused custom development\n- Scalable, maintainable architecture\n- Modern technology stack\n- AI and automation built in where it helps\n- Responsive, user-focused design\n- Support and improvements after launch"),
        S("Clients and testimonials", "Add client names and a few short testimonials here."),
      ];
    case "case_study":
      return [
        S("The client", "Who the client is and what they do."),
        S("The problem", "What wasn't working, and what they needed."),
        S("What we built", "- Main features\n- Integrations\n- Who uses it"),
        S("The result", "- Measurable outcome (time saved, sales, orders…)\n- What the client says"),
        S("Technologies", "e.g. Next.js, Firebase, Flutter"),
      ];
    case "nda":
      return [
        S("Parties", "This Mutual Non-Disclosure Agreement is made on {date} between {company}, {companyAddress} (\"Fyntric\") and {client}{clientAddressComma} (\"the Client\"), each a \"Party\"."),
        S("Purpose", "The Parties wish to discuss {projectOr} (\"the Purpose\") and may share confidential information with each other for that Purpose."),
        S("Confidential information", "Confidential information means any business, technical, financial or customer information, ideas, designs, source code, data and documents shared by one Party with the other, in any form, that is marked confidential or would reasonably be understood to be confidential."),
        S("Obligations", "- Use confidential information only for the Purpose.\n- Not disclose it to anyone except employees and advisers who need to know it and are bound by similar duties.\n- Protect it with at least reasonable care.\n- Return or delete it on request."),
        S("Exceptions", "These obligations do not apply to information that is or becomes public through no fault of the receiving Party, was already known to it, is received lawfully from a third party, is developed independently, or must be disclosed by law (with prompt notice where allowed)."),
        S("Term", "This Agreement lasts for two (2) years from the date above, and the confidentiality obligations survive for three (3) years after it ends."),
        S("No licence", "No rights or licences to any intellectual property are granted by this Agreement. Ideas and information remain the property of the Party that disclosed them."),
        S("Law and jurisdiction", "This Agreement is governed by the laws of India. The courts at Kozhikode, Kerala have exclusive jurisdiction."),
      ];
    case "questionnaire":
      return [
        S("About your business: what do you do, and who are your customers?", ""),
        S("What problem should this project solve? What happens today without it?", ""),
        S("Who will use it (staff, customers, partners)? Roughly how many users?", ""),
        S("Main features you need on day one", ""),
        S("Nice-to-have features for later", ""),
        S("Any existing systems, apps or data we need to connect to or move over?", ""),
        S("Platforms: website, Android, iPhone, admin panel?", ""),
        S("Design: do you have a brand guide or examples you like?", ""),
        S("Content: who provides text, images and products?", ""),
        S("Payments, SMS, WhatsApp, email or other services to integrate", ""),
        S("Target launch date, and is there a fixed deadline?", ""),
        S("Budget range", ""),
        S("Who decides and signs off on the project?", ""),
        S("Hosting, domain and maintenance: anything already in place?", ""),
      ];
    case "proposal":
      return [
        S("Introduction", "This document defines the Scope of Work (SOW), deliverables, timeline, commercial terms and conditions for {projectOr} for {client}. Anything not described in this document is outside the scope of this quotation."),
        S("Project overview", "{company} will design, develop and launch the following for {client}. The platform consists of:\n\n- Customer app (Android & iOS) for …\n- Admin app or panel for …\n- Backend, APIs and database hosted on the cloud."),
        S("Detailed scope of work", "## Customer application\n- Registration and login with OTP verification; profile management.\n- Feature …\n\n## Admin application\n- Admin login and dashboard.\n- Feature …\n\n## Backend and integrations\n- APIs, database and business logic.\n- Payment gateway, push notifications, SMS / OTP."),
        S("Out of scope", "The following items are not included in this quotation. They can be taken up later under a separate quotation:\n\n- Integration with third-party systems not listed in this document.\n- Web panel or app platforms not listed under the scope.\n- Content entry (product data, images, descriptions), photography and marketing.\n- Major new features or changes requested after scope sign-off (handled as change requests)."),
        S("Technical deliverables", "| Deliverable | Details |\n| Mobile apps | Android and iOS |\n| Backend | APIs, database, admin configuration and business logic |\n| Integrations | Payment gateway, push notifications, SMS / OTP |\n| Security | Authentication, role-based access, encrypted data transfer (HTTPS) |\n| Testing | Functional, integration and user acceptance testing support |\n| Deployment | Cloud deployment, production launch and Play Store / App Store submission |\n| Handover | Source code, admin credentials and a basic user guide |"),
        S("Project timeline", "Target completion is within 90 days from project initiation (receipt of advance payment and finalized requirements).\n\n| Phase | Timeline | Key activities |\n| Month 1 | Days 1–30 | Requirement finalization, UI/UX design, architecture, database design, backend and API foundation, progress review. |\n| Month 2 | Days 31–60 | Core app features, admin features, payment gateway integration. |\n| Month 3 | Days 61–90 | Full system testing and bug fixing, UAT, cloud deployment, store submission and production launch. |\n\n> The timeline depends on timely approvals, feedback and inputs from the Client, and on access to third-party accounts (payment gateway, SMS, developer accounts). App store review times are controlled by Apple and Google."),
        S("Client responsibilities & assumptions", "- Provide brand assets (logo, colours), app content and policies (returns, delivery, privacy).\n- Create or provide access to the Apple Developer, Google Play, payment gateway, SMS / OTP and cloud hosting accounts.\n- Nominate one point of contact for approvals; give feedback on designs and builds within 3 working days.\n- Design approval is final; changes after approval may affect the timeline and cost."),
        S("Change requests & acceptance", "- Any work outside this SOW will be charged extra. It will be estimated separately and taken up only after the Client approves its cost and timeline impact in writing.\n- **Small improvements:** small improvements not described in this SOW, but related to items within this scope and needed to make those items fully usable, will be done free of cost during the free support period.\n- **New features:** any request that can reasonably be counted as a new feature, or as an enhancement beyond making an in-scope item usable, will be charged extra.\n- Each milestone is shared for review. If no issues are reported within 5 working days of delivery, the milestone is considered accepted.\n- Bugs against the approved scope found during UAT will be fixed before launch at no extra cost."),
        S("Project investment", "All modules and deliverables described in the scope of work and technical deliverables are included in the project price, subject to this approved scope."),
        S("Payment terms", "Payments are due within 7 days of each milestone invoice. Work on the next milestone starts after the previous payment is received."),
        S("Support, maintenance & AMC", "## First year: free support (included)\n12 months of cost-free support and maintenance from the production launch date, within the approved scope:\n\n- Bug fixing, application troubleshooting and API troubleshooting.\n- Technical support and assistance; database issue support.\n- Security updates, performance monitoring support and stability support.\n- Minor software updates and OS-compatibility fixes.\n\n> Support does not cover new features, design changes, third-party service charges or issues caused by changes made by others to the code or servers.\n\n## From the second year: Annual Maintenance Contract (AMC)\nFrom the second year onwards, any support will be provided under an Annual Maintenance Contract at {amcPercent}% of the total project cost per year, i.e. {amcAmount} per year ({amcPercent}% of {total}), payable in advance for each year. The AMC covers the same support items listed above. New features remain chargeable separately."),
        S("Third-party costs (payable by the client)", "This quotation covers development only. All third-party subscriptions, services and usage charges required to build, run and publish the platform are to be paid by the Client, directly or reimbursed to us at actual cost. These include, but are not limited to:\n\n- Domain registration and renewal.\n- Cloud server, hosting, storage, database and backup charges.\n- SMS / OTP and WhatsApp Business API charges.\n- Payment gateway setup and transaction fees.\n- AI / LLM API charges, where used.\n- Maps, email, push notification or any other third-party API charges.\n- Apple Developer Account and Google Play Developer Account fees.\n- Any other third-party subscriptions, licences or paid plugins."),
        S("General terms", "- **Ownership:** on receipt of full payment, the Client owns the application source code and data developed for this project.\n- **Confidentiality:** both parties will keep each other's business information confidential.\n- **Validity:** this quotation is valid for {validDays} days from the date of issue."),
      ];
    case "agreement":
      return [
        S("Parties", "This Software Development Agreement is made on {date} between {company}, {companyAddress} (\"Developer\") and {client}{clientAddressComma} (\"Client\")."),
        S("Services", "The Developer will design, develop and deliver {projectOr} as described in the accepted proposal / statement of work{proposalRef} (\"the SOW\"), which forms part of this Agreement. Where they differ, the SOW governs scope and price, and this Agreement governs everything else."),
        S("Fees and payment", "The Client pays the fees in the SOW on the payment terms set out there. Invoices are due within 7 days. Work may be paused while payments are overdue. Fees exclude GST and third-party costs."),
        S("Changes", "Changes to scope are agreed in writing, with their effect on price and timeline, before work on them starts."),
        S("Client responsibilities", "The Client provides content, access, approvals and feedback on time. Delays on the Client's side extend the timeline accordingly."),
        S("Intellectual property", "On full payment, the Client owns the custom software and designs made for it. The Developer keeps ownership of its pre-existing tools, libraries and know-how, and grants the Client a perpetual licence to use them as part of the delivered software. Open-source components remain under their own licences. The Developer may mention the Client and show non-confidential screenshots in its portfolio unless the Client objects in writing."),
        S("Confidentiality", "Each party keeps the other's confidential information secret and uses it only for this project, during the Agreement and for three (3) years after."),
        S("Warranty", "The Developer fixes defects reported within three (3) months of launch at no cost. The warranty does not cover changes made by others, misuse, or third-party services and hosting."),
        S("Limitation of liability", "Neither party is liable for indirect or consequential loss, or lost profits or data. The Developer's total liability under this Agreement is limited to the fees paid by the Client in the twelve (12) months before the claim."),
        S("Termination", "Either party may end this Agreement with 30 days' written notice, or at once if the other materially breaches it and does not fix the breach within 15 days of notice. The Client pays for work done up to the end date; the Developer hands over completed work on payment."),
        S("Dispute resolution", "The parties will first try to resolve any dispute through good-faith discussion. Disputes not resolved within 30 days go to arbitration by a sole arbitrator under the Arbitration and Conciliation Act, 1996, seated at Kozhikode, in English."),
        S("Law and jurisdiction", "This Agreement is governed by the laws of India. Subject to arbitration, the courts at Kozhikode, Kerala have exclusive jurisdiction."),
      ];
  }
}

export function defaultTitle(kind: DocKind, project?: string | null, client?: string | null) {
  const forWhat = project || client;
  switch (kind) {
    case "profile":
      return "Company profile";
    case "case_study":
      return "New case study";
    case "nda":
      return client ? `Mutual NDA with ${client}` : "Mutual non-disclosure agreement";
    case "questionnaire":
      return forWhat ? `Requirements: ${forWhat}` : "Requirement questionnaire";
    case "proposal":
      return forWhat ? `Proposal: ${forWhat}` : "Proposal and statement of work";
    case "agreement":
      return forWhat ? `Software development agreement: ${forWhat}` : "Software development agreement";
  }
}

// ---------- Making documents ----------

export interface DealContext {
  leadId?: string | null;
  leadIdLabel?: string | null;
  clientId?: string | null;
  clientIdLabel?: string | null;
  projectId?: string | null;
  projectIdLabel?: string | null;
  party: Party;
}

/** Fills the template's {placeholders} for this lead or client. */
function placeholders(ctx: DealContext, business: BusinessSettings, date: string, extra: Record<string, string> = {}) {
  const client = ctx.party.name || "the Client";
  return {
    company: business.name,
    companyAddress: business.address.replace(/\n/g, ", "),
    client,
    clientAddress: ctx.party.address?.replace(/\n/g, ", ") ?? "",
    clientAddressComma: ctx.party.address ? `, ${ctx.party.address.replace(/\n/g, ", ")}` : "",
    contact: ctx.party.contact || client,
    project: ctx.projectIdLabel ?? "",
    projectOr: ctx.projectIdLabel ? `the ${ctx.projectIdLabel} project` : "a software project",
    date: formatDate(date),
    proposalRef: "",
    ...extra,
  };
}

/** Proposal terms kept on the template besides its sections. */
const PROPOSAL_TERMS = ["subtitle", "facts", "milestones", "amcPercent"] as const;

async function templateFor(kind: DocKind): Promise<{ sections: Section[]; terms: Partial<DocFields> }> {
  const snap = await getDoc(doc(db(), "documents", templateId(kind))).catch(() => null);
  const data = snap?.exists() ? (snap.data() as Partial<DocFields>) : {};
  const terms: Partial<DocFields> = {};
  if (kind === "proposal") {
    Object.assign(terms, proposalDefaults());
    for (const k of PROPOSAL_TERMS) if (data[k] !== undefined && data[k] !== null) Object.assign(terms, { [k]: data[k] });
  }
  return { sections: data.sections?.length ? data.sections : defaultSections(kind), terms };
}

function proposalDefaults(): Partial<DocFields> {
  return { subtitle: DEFAULT_SUBTITLE, facts: DEFAULT_FACTS, milestones: DEFAULT_MILESTONES, amcPercent: DEFAULT_AMC };
}

/** "YYYY-MM-DD" plus some days. */
export function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const stamp = (profile: UserProfile) => {
  const now = Date.now();
  return { userId: profile.id, userName: profile.displayName, createdBy: profile.id, createdAt: now, updatedAt: now };
};

/** A new NDA, questionnaire, proposal or agreement for a lead or client, from its template. Returns the new id. */
export async function createDealDoc(kind: DocKind, ctx: DealContext, business: BusinessSettings, profile: UserProfile): Promise<string> {
  const date = todayISO();
  let proposalRef = "";
  if (kind === "agreement") {
    // Refer to the latest accepted (or else latest) proposal for the same lead or client.
    const accepted = (await dealDocs(ctx)).filter((d) => d.kind === "proposal" && d.status !== "superseded").sort((a, b) => Number(b.createdAt) - Number(a.createdAt));
    const p = accepted.find((d) => d.status === "signed") ?? accepted[0];
    if (p) proposalRef = ` ${p.number ?? ""}${p.version && p.version > 1 ? ` (revision ${p.version})` : ""}`;
  }
  const values = placeholders(ctx, business, date, { proposalRef });
  const template = await templateFor(kind);
  const sections = template.sections.map((s) => ({ heading: fillTemplate(s.heading, values), body: fillTemplate(s.body, values) }));
  const ref = await loggedAdd(collection(db(), "documents"), {
    kind,
    title: defaultTitle(kind, ctx.projectIdLabel, ctx.party.name),
    number: docNumber(KINDS[kind].prefix),
    status: "draft",
    date,
    party: ctx.party,
    leadId: ctx.leadId ?? null,
    leadIdLabel: ctx.leadIdLabel ?? null,
    clientId: ctx.clientId ?? null,
    clientIdLabel: ctx.clientIdLabel ?? null,
    projectId: ctx.projectId ?? null,
    projectIdLabel: ctx.projectIdLabel ?? null,
    sections,
    ...template.terms,
    ...(kind === "proposal"
      ? {
          version: 1,
          previousId: null,
          items: [],
          totalPrice: null,
          validUntil: addDays(date, VALID_DAYS),
          revisionNote: "",
          facts: (template.terms.facts ?? DEFAULT_FACTS).map((f) => (/location/i.test(f.label) && !f.value && ctx.party.address ? { ...f, value: ctx.party.address.split(/\n|,/).slice(-2).join(",").trim() } : f)),
        }
      : {}),
    ...stamp(profile),
  });
  return ref.id;
}

/** Documents made for this lead, client or project. */
export async function dealDocs(ctx: Pick<DealContext, "leadId" | "clientId" | "projectId">): Promise<SalesDoc[]> {
  const all = new Map<string, SalesDoc>();
  for (const [field, value] of [["leadId", ctx.leadId], ["clientId", ctx.clientId], ["projectId", ctx.projectId]] as const) {
    if (!value) continue;
    const snap = await getDocs(query(collection(db(), "documents"), where(field, "==", value)));
    snap.forEach((d) => all.set(d.id, { id: d.id, ...d.data() } as SalesDoc));
  }
  return [...all.values()];
}

export async function createCaseStudy(profile: UserProfile): Promise<string> {
  const ref = await loggedAdd(collection(db(), "documents"), {
    kind: "case_study",
    title: "New case study",
    number: docNumber("CS"),
    status: "draft",
    summary: "",
    services: [],
    images: [],
    sections: defaultSections("case_study"),
    ...stamp(profile),
  });
  return ref.id;
}

/** The company profile, made from the default wording the first time someone opens it. */
export async function ensureProfile(business: BusinessSettings, profile: UserProfile) {
  const target = doc(db(), "documents", PROFILE_ID);
  const snap = await getDoc(target);
  if (snap.exists()) return;
  const values = placeholders({ party: { name: "" } }, business, todayISO());
  await setDoc(target, {
    kind: "profile",
    title: `${business.name}: company profile`,
    status: "draft",
    template: true,
    sections: defaultSections("profile").map((s) => ({ heading: s.heading, body: fillTemplate(s.body, values) })),
    ...stamp(profile),
  });
}

/** The template for a kind, made from the default wording the first time someone edits it. */
export async function ensureTemplate(kind: DocKind, profile: UserProfile) {
  const target = doc(db(), "documents", templateId(kind));
  const snap = await getDoc(target);
  if (snap.exists()) return;
  await setDoc(target, { kind, title: `${KINDS[kind].label} template`, status: "draft", template: true, sections: defaultSections(kind), ...(kind === "proposal" ? proposalDefaults() : {}), ...stamp(profile) });
}

export async function saveDoc(id: string, data: Partial<SalesDoc>) {
  await loggedUpdate(doc(db(), "documents", id), { ...data, updatedAt: Date.now() });
}

export async function deleteDocument(d: SalesDoc) {
  if (d.shareToken) await deleteDoc(doc(db(), "shared", d.shareToken)).catch(() => undefined);
  await loggedDelete(doc(db(), "documents", d.id));
}

/** A new revision of a proposal: the same content as version n+1; the old one is marked replaced. */
export async function reviseProposal(d: SalesDoc, profile: UserProfile): Promise<string> {
  const { id, shareToken, sharedAt, signedBy, signedOn, signedTitle, createdAt, updatedAt, userId, userName, createdBy, ...rest } = d;
  void shareToken; void sharedAt; void signedBy; void signedOn; void signedTitle; void createdAt; void updatedAt; void userId; void userName; void createdBy;
  const ref = await loggedAdd(collection(db(), "documents"), { ...rest, status: "draft", version: (d.version ?? 1) + 1, previousId: id, date: todayISO(), validUntil: addDays(todayISO(), VALID_DAYS), revisionNote: "", shareToken: null, sharedAt: null, ...stamp(profile) });
  await saveDoc(id, { status: "superseded" });
  return ref.id;
}

// ---------- Case study images ----------

export async function uploadImage(docId: string, file: File): Promise<DocImage> {
  if (!file.type.startsWith("image/")) throw new Error(`${file.name} isn't an image.`);
  if (file.size > 10 * 1024 * 1024) throw new Error(`${file.name} is larger than 10 MB.`);
  const name = `${Date.now()}-${file.name.replace(/[^\w.\-]+/g, "_").slice(-80)}`;
  const path = `documents/${docId}/${name}`;
  const target = ref(storage(), path);
  await uploadBytes(target, file, { contentType: file.type });
  return { url: await getDownloadURL(target), path, caption: "" };
}

// ---------- Sharing ----------

export interface SharedCopy {
  doc: DocFields;
  business: Pick<BusinessSettings, "name" | "address" | "phone" | "email" | "website" | "gstin" | "logo">;
  /** Company profile: the case studies shown as portfolio highlights. */
  highlights?: { title: string; summary?: string; image?: string | null; link?: string | null }[];
  sharedAt: number;
}

const newToken = () => {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 28);
};

export const shareUrl = (token: string) => `${typeof window === "undefined" ? "" : window.location.origin}/share?t=${token}`;

/** Publishes (or refreshes) the read-only copy behind the document's link, and returns the link. */
export async function shareDoc(d: SalesDoc, business: BusinessSettings, highlights?: SharedCopy["highlights"]): Promise<string> {
  const token = d.shareToken || newToken();
  const { id, shareToken, userId, createdBy, ...content } = d;
  void id; void shareToken; void userId; void createdBy;
  const copy: SharedCopy = {
    doc: JSON.parse(JSON.stringify(content)),
    business: { name: business.name, address: business.address, phone: business.phone, email: business.email, website: business.website, gstin: business.gstin, logo: business.logo },
    ...(highlights ? { highlights } : {}),
    sharedAt: Date.now(),
  };
  await setDoc(doc(db(), "shared", token), { ...copy, sourceId: d.id });
  const patch: Partial<SalesDoc> = { shareToken: token, sharedAt: copy.sharedAt };
  // Sharing a draft with the other side counts as sending it (not for library entries).
  if (d.status === "draft" && DEAL_KINDS.includes(d.kind)) patch.status = "sent";
  await updateDoc(doc(db(), "documents", d.id), { ...patch, updatedAt: Date.now() });
  return shareUrl(token);
}

export async function stopSharing(d: SalesDoc) {
  if (!d.shareToken) return;
  await deleteDoc(doc(db(), "shared", d.shareToken));
  await updateDoc(doc(db(), "documents", d.id), { shareToken: null, sharedAt: null, updatedAt: Date.now() });
}

/** Case studies as portfolio highlights in the company profile (shared ones link to their own page). */
export function highlightsFrom(caseStudies: SalesDoc[]) {
  return caseStudies
    .filter((c) => c.kind === "case_study")
    .sort((a, b) => Number(b.createdAt) - Number(a.createdAt))
    .map((c) => ({ title: c.title, summary: c.summary ?? "", image: c.images?.[0]?.url ?? null, link: c.shareToken ? shareUrl(c.shareToken) : null }));
}

export async function readShared(token: string): Promise<SharedCopy | null> {
  const snap = await getDoc(doc(db(), "shared", token));
  return snap.exists() ? (snap.data() as SharedCopy) : null;
}
