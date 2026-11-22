import logoColor from "@/assets/brand/logo-color.png";
import type { BusinessSettings } from "@/config/settingsDefaults";
import { monthLabel, rupeesInWords, type Payslip } from "@/lib/payroll";

/** Money for the PDF: "Rs. 1,25,000.00" (the built-in PDF fonts have no ₹ sign). */
const money = (n: unknown) => `Rs. ${(Number(n) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function toDataUrl(src: string): Promise<string | null> {
  try {
    const blob = await (await fetch(src)).blob();
    return await new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => resolve(null);
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function imageSize(dataUrl: string): Promise<{ w: number; h: number } | null> {
  return new Promise((resolve) => {
    const i = new Image();
    i.onload = () => resolve({ w: i.naturalWidth, h: i.naturalHeight });
    i.onerror = () => resolve(null);
    i.src = dataUrl;
  });
}

/** The payslip as an A4 PDF, with the company logo from Settings (or the Fyntric logo until one is uploaded). */
export async function payslipPdf(slip: Payslip, business: BusinessSettings): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210;
  const M = 16;
  const ink = (g: number) => pdf.setTextColor(g, g, g);
  let y = M;

  // Header: logo left, company right.
  const logo = business.logo || (await toDataUrl(logoColor.src));
  if (logo) {
    const size = await imageSize(logo);
    if (size) {
      const h = 13;
      const w = Math.min(60, (size.w / size.h) * h);
      try {
        pdf.addImage(logo, logo.startsWith("data:image/png") ? "PNG" : "JPEG", M, y, w, (size.h / size.w) * w);
      } catch {
        /* an unreadable logo just leaves the space empty */
      }
    }
  }
  pdf.setFont("helvetica", "bold").setFontSize(11);
  ink(20);
  pdf.text(business.name, W - M, y + 4, { align: "right" });
  pdf.setFont("helvetica", "normal").setFontSize(8.5);
  ink(90);
  const addr = pdf.splitTextToSize(business.address, 80) as string[];
  pdf.text(addr, W - M, y + 9, { align: "right" });
  const contact = [business.phone, business.email].filter(Boolean).join("  ·  ");
  if (contact) pdf.text(contact, W - M, y + 9 + addr.length * 3.8, { align: "right" });
  y += Math.max(20, 12 + addr.length * 3.8);

  pdf.setDrawColor(220).line(M, y, W - M, y);
  y += 9;
  pdf.setFont("helvetica", "bold").setFontSize(14);
  ink(20);
  pdf.text(`Payslip for ${monthLabel(slip.month)}`, M, y);
  y += 8;

  // Employee details, two columns.
  const details: [string, string][] = [
    ["Employee", slip.employeeName],
    ["Employee ID", slip.employeeCode || "—"],
    ["Designation", slip.designation || "—"],
    ["Department", slip.department || "—"],
    ["Days in month", String(slip.daysInMonth)],
    ["Paid days", `${slip.paidDays}${slip.lopDays ? ` (${slip.lopDays} unpaid)` : ""}`],
    ["Paid on", slip.paidOn ? new Date(`${slip.paidOn}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "Not paid yet"],
    ["Payment mode", [slip.paymentMode, slip.reference].filter(Boolean).join(", ") || "—"],
  ];
  pdf.setFontSize(9);
  details.forEach(([k, v], i) => {
    const x = i % 2 === 0 ? M : W / 2 + 2;
    const yy = y + Math.floor(i / 2) * 6;
    pdf.setFont("helvetica", "normal");
    ink(110);
    pdf.text(k, x, yy);
    pdf.setFont("helvetica", "bold");
    ink(25);
    pdf.text(String(v), x + 30, yy);
  });
  y += Math.ceil(details.length / 2) * 6 + 5;

  // Earnings and deductions side by side.
  const earnings = [...slip.earnings.filter((e) => Number(e.amount))];
  if (slip.commission?.amount) earnings.push({ name: `Sales commission (on ${money(slip.commission.sales)} sales)`, amount: slip.commission.amount });
  const deductions = slip.deductions.filter((d) => Number(d.amount));
  const colW = (W - 2 * M - 6) / 2;
  const table = (x: number, title: string, rows: { name: string; amount: number }[], totalLabel: string, total: number) => {
    let yy = y;
    pdf.setFillColor(243, 245, 249).rect(x, yy, colW, 8, "F");
    pdf.setFont("helvetica", "bold").setFontSize(9);
    ink(40);
    pdf.text(title, x + 3, yy + 5.3);
    pdf.text("Amount", x + colW - 3, yy + 5.3, { align: "right" });
    yy += 8;
    pdf.setFont("helvetica", "normal");
    for (const r of rows) {
      ink(50);
      const name = pdf.splitTextToSize(r.name, colW - 38) as string[];
      pdf.text(name, x + 3, yy + 5);
      pdf.text(money(r.amount), x + colW - 3, yy + 5, { align: "right" });
      yy += 3 + name.length * 4;
      pdf.setDrawColor(235).line(x, yy, x + colW, yy);
    }
    if (!rows.length) {
      ink(140);
      pdf.text("None", x + 3, yy + 5);
      yy += 7;
    }
    pdf.setFont("helvetica", "bold");
    ink(20);
    pdf.text(totalLabel, x + 3, yy + 6);
    pdf.text(money(total), x + colW - 3, yy + 6, { align: "right" });
    return yy + 9;
  };
  const endL = table(M, "Earnings", earnings, "Gross earnings", slip.gross);
  const endR = table(M + colW + 6, "Deductions", deductions, "Total deductions", slip.totalDeductions);
  y = Math.max(endL, endR) + 4;

  // Net pay.
  pdf.setFillColor(237, 244, 255).roundedRect(M, y, W - 2 * M, 18, 2, 2, "F");
  pdf.setFont("helvetica", "bold").setFontSize(11);
  ink(20);
  pdf.text("Net pay", M + 4, y + 7.5);
  pdf.setFontSize(13);
  pdf.text(money(slip.net), W - M - 4, y + 8, { align: "right" });
  pdf.setFont("helvetica", "normal").setFontSize(8.5);
  ink(90);
  pdf.text(rupeesInWords(slip.net), M + 4, y + 13.5);
  y += 26;

  if (slip.notes) {
    pdf.setFontSize(9);
    ink(70);
    const lines = pdf.splitTextToSize(`Note: ${slip.notes}`, W - 2 * M) as string[];
    pdf.text(lines, M, y);
    y += lines.length * 4.5 + 4;
  }
  pdf.setFontSize(8);
  ink(140);
  pdf.text("This is a computer-generated payslip and does not need a signature.", W / 2, 285, { align: "center" });
  return pdf.output("blob");
}

export const payslipFileName = (slip: Payslip) => `Payslip-${slip.employeeName.replace(/[^\w]+/g, "-")}-${slip.month}.pdf`;
