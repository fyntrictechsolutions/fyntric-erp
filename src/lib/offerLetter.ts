import type { BusinessSettings, OfferSettings } from "@/config/settingsDefaults";
import { formatCurrency, formatDate } from "@/lib/format";

/** What HR fills in for one candidate. */
export interface OfferInput {
  designation: string;
  department: string;
  ctc: number;
  joiningDate: string;
  reportingTo: string;
  location: string;
  probationMonths: number;
  noticePeriodDays: number;
}

/** The offer as stored on the candidate: the inputs plus the finished wording, so it reads the same later. */
export interface OfferLetter extends OfferInput {
  candidateName: string;
  company: string;
  companyAddress: string;
  subject: string;
  body: string;
  terms: string;
  signatoryName: string;
  signatoryTitle: string;
  issuedOn: string;
  preparedBy: string;
  sentAt?: number | null;
}

export function fillTemplate(text: string, values: Record<string, string>) {
  return text.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? values[key] : match));
}

export function buildOfferLetter(
  input: OfferInput,
  candidateName: string,
  template: OfferSettings,
  business: BusinessSettings,
  preparedBy: string,
  issuedOn: string,
): OfferLetter {
  const values: Record<string, string> = {
    name: candidateName,
    designation: input.designation,
    department: input.department || "our",
    ctc: formatCurrency(input.ctc),
    monthly: formatCurrency(Math.round(input.ctc / 12)),
    joiningDate: formatDate(input.joiningDate),
    reportingTo: input.reportingTo || "your team lead",
    location: input.location,
    probationMonths: String(input.probationMonths),
    noticePeriodDays: String(input.noticePeriodDays),
    company: business.name,
  };
  return {
    ...input,
    candidateName,
    company: business.name,
    companyAddress: business.address,
    subject: fillTemplate(template.subject, values),
    body: fillTemplate(template.body, values),
    terms: fillTemplate(template.terms, values),
    signatoryName: template.signatoryName,
    signatoryTitle: template.signatoryTitle,
    issuedOn,
    preparedBy,
    sentAt: null,
  };
}

/** Plain-text version for an email body. */
export function offerAsText(o: OfferLetter) {
  return [
    o.body,
    "",
    o.terms ? `Terms:\n${o.terms}` : "",
    "",
    "Regards,",
    o.signatoryName,
    o.signatoryTitle,
    o.company,
  ]
    .filter((l, i, a) => !(l === "" && a[i - 1] === ""))
    .join("\n");
}
