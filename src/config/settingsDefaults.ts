/**
 * Company settings stored in Firestore under settings/{business|lists|app|offer}.
 * Admins edit them on the Settings page; these defaults apply until they do.
 */

export interface BusinessSettings {
  name: string;
  phone: string;
  email: string;
  website: string;
  address: string;
  gstin: string;
  pan: string;
  invoicePrefix: string;
  estimatePrefix: string;
  upiId: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  ifsc: string;
}

export interface Holiday {
  date: string; // YYYY-MM-DD
  name: string;
}

/** Dropdown lists that admins can edit (lists that have no other place to be added from). */
export interface ListSettings {
  departments: string[];
  services: string[];
  leadSources: string[];
  followupModes: string[];
  productCategories: string[];
  units: string[];
  expenseCategories: string[];
  purchaseCategories: string[];
  supplierCategories: string[];
  paymentModes: string[];
  candidateSources: string[];
  salaryComponents: string[];
  exitChecklist: string[];
  holidays: Holiday[];
}

export type ListKey = Exclude<keyof ListSettings, "holidays">;

export interface AppSettings {
  /** Hours a day counts as a full working day on the attendance calendar. */
  workHours: number;
  /** "HH:MM". A check-in after this time counts as late. */
  officeOpenTime: string;
  officeCloseTime: string;
  defaultTaxRate: number;
  estimateValidityDays: number;
  estimateTerms: string;
}

export const DEFAULT_BUSINESS: BusinessSettings = {
  name: "Fyntric Tech IT Solutions",
  phone: "+91 99957 15997",
  email: "info@fyntrictech.co.in",
  website: "https://fyntrictech.co.in",
  address: "6th Floor, Tower 2, HiLite Business Park, Palazhi, Kozhikode - 673014",
  gstin: "",
  pan: "",
  invoicePrefix: "INV",
  estimatePrefix: "EST",
  upiId: "",
  bankName: "",
  accountName: "",
  accountNumber: "",
  ifsc: "",
};

/** Kerala government public holidays 2026 (source: Onmanorama, 29 Oct 2025; moon-dependent dates may move). */
const KERALA_HOLIDAYS_2026: Holiday[] = [
  ["2026-01-02", "Mannam Jayanthi"],
  ["2026-01-26", "Republic Day"],
  ["2026-03-20", "Id-ul Fitr (Ramzan)"],
  ["2026-04-02", "Maundy Thursday"],
  ["2026-04-03", "Good Friday"],
  ["2026-04-14", "Dr B R Ambedkar Jayanthi"],
  ["2026-04-15", "Vishu"],
  ["2026-05-01", "May Day"],
  ["2026-05-27", "Bakrid"],
  ["2026-06-25", "Muharram"],
  ["2026-08-12", "Karkidaka Vavu"],
  ["2026-08-15", "Independence Day"],
  ["2026-08-25", "First Onam / Milad-i-Sherif"],
  ["2026-08-26", "Thiruvonam"],
  ["2026-08-27", "Third Onam"],
  ["2026-08-28", "Fourth Onam / Sree Narayana Guru Jayanthi"],
  ["2026-09-04", "Sree Krishna Jayanthi"],
  ["2026-09-21", "Sree Narayana Guru Samadhi"],
  ["2026-10-02", "Gandhi Jayanthi"],
  ["2026-10-20", "Mahanavami"],
  ["2026-10-21", "Vijayadasami"],
  ["2026-12-25", "Christmas"],
].map(([date, name]) => ({ date, name }));

export const DEFAULT_LISTS: ListSettings = {
  departments: ["Engineering", "Design", "Quality Assurance", "Sales & Marketing", "Human Resources", "Finance & Accounts", "Operations", "Management"],
  services: ["Web development", "Mobile app development", "ERP / CRM solutions", "UI / UX design", "Cloud & DevOps", "AI & data", "Digital marketing", "Support & maintenance", "Other"],
  leadSources: ["Website", "WhatsApp", "Meta ads", "Google ads", "Referral", "LinkedIn", "Cold outreach", "Event", "Other"],
  followupModes: ["Phone call", "WhatsApp", "Google Meet", "Zoom", "In person", "Email"],
  productCategories: ["Website", "Mobile app", "Software / ERP", "Design", "Hosting & domain", "Cloud", "Marketing", "Support plan", "Hardware", "Other"],
  units: ["Nos", "Project", "Month", "Year", "Hour", "Day", "Page", "Screen", "User", "Licence"],
  expenseCategories: ["Travel", "Software & subscriptions", "Hardware", "Office & rent", "Utilities & internet", "Marketing", "Salaries", "Food & hospitality", "Other"],
  purchaseCategories: ["Software & subscriptions", "Furniture", "Computers & hardware", "Stationery", "Office supplies", "Internet & phone", "Rent", "Services", "Other"],
  supplierCategories: ["Software / SaaS", "Hardware", "Furniture", "Stationery", "Internet & telecom", "Services", "Other"],
  paymentModes: ["UPI", "Bank transfer", "Card", "Cash", "Cheque"],
  candidateSources: ["Website", "LinkedIn", "Naukri", "Indeed", "Referral", "Walk-in", "Campus", "Other"],
  salaryComponents: ["Basic", "HRA", "Special allowance", "Conveyance", "Medical allowance", "Performance bonus"],
  exitChecklist: ["Knowledge transfer done", "Laptop and accessories returned", "ID card returned", "Email and tool access removed", "Final settlement paid", "Relieving and experience letters issued"],
  holidays: KERALA_HOLIDAYS_2026,
};

export const DEFAULT_APP: AppSettings = {
  workHours: 8,
  officeOpenTime: "09:30",
  officeCloseTime: "18:30",
  defaultTaxRate: 18,
  estimateValidityDays: 15,
  estimateTerms: "50% advance to start the work, balance on delivery.\nPrices are exclusive of GST unless stated.\nThis estimate is valid until the date shown above.",
};

export const LIST_META: Record<keyof ListSettings, { label: string; help: string }> = {
  departments: { label: "Departments", help: "Used on employee records." },
  services: { label: "Services", help: "What a lead is interested in." },
  leadSources: { label: "Lead sources", help: "Where a lead came from." },
  followupModes: { label: "Follow-up modes", help: "How a follow-up happens (call, Meet…)." },
  productCategories: { label: "Product & service categories", help: "Groups on the Products & services page." },
  units: { label: "Units", help: "Units for products and estimate lines." },
  expenseCategories: { label: "Expense categories", help: "Categories for expense claims." },
  purchaseCategories: { label: "Purchase categories", help: "Categories for purchase bills." },
  supplierCategories: { label: "Supplier categories", help: "What a supplier provides." },
  paymentModes: { label: "Payment modes", help: "How money was paid or received." },
  candidateSources: { label: "Candidate sources", help: "Where a job applicant came from." },
  salaryComponents: { label: "Salary components", help: "Suggested parts of a salary structure." },
  exitChecklist: { label: "Exit checklist", help: "Default steps when processing a resignation." },
  holidays: { label: "Holidays", help: "Shown in blue on the attendance calendar, with weekends." },
};

/** Common parts of every offer letter. Placeholders in {curly braces} are filled from the offer form. */
export interface OfferSettings {
  subject: string;
  body: string;
  terms: string;
  signatoryName: string;
  signatoryTitle: string;
  probationMonths: number;
  noticePeriodDays: number;
}

export const OFFER_PLACEHOLDERS = ["name", "designation", "department", "ctc", "monthly", "joiningDate", "reportingTo", "location", "probationMonths", "noticePeriodDays", "company"] as const;

export const DEFAULT_OFFER: OfferSettings = {
  subject: "Offer of employment: {designation}",
  body:
    "Dear {name},\n\nWe are pleased to offer you the position of {designation} in our {department} team at {company}. Your annual cost to company (CTC) will be {ctc} ({monthly} per month).\n\nYour date of joining will be {joiningDate}, at {location}. You will report to {reportingTo}.\n\nYou will be on probation for {probationMonths} months from your date of joining. After confirmation, either side may end the employment with {noticePeriodDays} days' notice.\n\nPlease sign and return a copy of this letter to confirm your acceptance.",
  terms:
    "This offer is subject to verification of your certificates and previous employment.\nYou will follow the company's policies on attendance, leave and confidentiality.",
  signatoryName: "",
  signatoryTitle: "Director",
  probationMonths: 6,
  noticePeriodDays: 30,
};
