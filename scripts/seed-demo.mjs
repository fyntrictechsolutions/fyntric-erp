// Fills the local Firebase emulators with demo users and sample data.
// Usage: start `npm run emulators`, then `npm run seed:demo` in another terminal.
// Every demo user's password is "fyntric123". Never point this at the real project.
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= "127.0.0.1:9099";
const app = initializeApp({ projectId: "demo-fyntric" });
const auth = getAuth(app);
const db = getFirestore(app);

const iso = (offsetDays = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
};
const now = Date.now();

const PEOPLE = [
  ["admin", "Midhun Admin", "admin@fyntric.test"],
  ["project_manager", "Anjali Menon", "pm@fyntric.test"],
  ["hr_manager", "Rahul Nair", "hr@fyntric.test"],
  ["sales", "Sneha Pillai", "sales@fyntric.test"],
  ["staff", "Arjun Das", "staff@fyntric.test"],
  ["client", "Vikram Shah", "client@fyntric.test"],
  ["investor", "Priya Iyer", "investor@fyntric.test"],
  ["viewer", "Guest Viewer", "viewer@fyntric.test"],
  ["pending", "New Joiner", "new@fyntric.test"],
];

// Team members and the employee record each one is linked to.
const EMPLOYEE_OF = { project_manager: "emp0", hr_manager: "emp1", sales: "emp2", staff: "emp3" };
const uid = {};
for (const [role, name, email] of PEOPLE) {
  let user;
  try {
    user = await auth.getUserByEmail(email);
  } catch {
    user = await auth.createUser({ email, password: "fyntric123", displayName: name });
  }
  uid[role] = user.uid;
  await db.doc(`users/${user.uid}`).set({
    email, displayName: name, role, active: true, createdAt: now, updatedAt: now,
    ...(role === "client" ? { clientId: "acme", clientIdLabel: "Acme Retail Pvt Ltd" } : {}),
    ...(EMPLOYEE_OF[role] ? { employeeId: EMPLOYEE_OF[role], employeeIdLabel: name } : {}),
  });
}

const stamp = (role, extra = {}) => ({ userId: uid[role], userName: PEOPLE.find((p) => p[0] === role)[1], employeeId: EMPLOYEE_OF[role] ?? null, createdBy: uid[role], createdAt: now, updatedAt: now, ...extra });
const ACCOUNT_OF = Object.fromEntries(Object.entries(EMPLOYEE_OF).map(([role, emp]) => [emp, role]));

const employees = [
  ["Anjali Menon", "FT-002", "Management", "Project Manager", "active"],
  ["Rahul Nair", "FT-003", "Human Resources", "HR Manager", "active"],
  ["Sneha Pillai", "FT-004", "Sales & Marketing", "Business Development Executive", "active"],
  ["Arjun Das", "FT-005", "Engineering", "Full-stack Developer", "active"],
  ["Fathima Rasheed", "FT-006", "Design", "UI/UX Designer", "active"],
  ["Kiran Thomas", "FT-007", "Engineering", "Flutter Developer", "notice"],
];
for (const [i, [fullName, employeeCode, department, designation, status]] of employees.entries()) {
  const account = ACCOUNT_OF[`emp${i}`];
  await db.doc(`employees/emp${i}`).set(stamp("admin", { employeeId: null, fullName, employeeCode, department, designation, status, employmentType: "full_time", joiningDate: iso(-400 + i * 40), email: `${fullName.split(" ")[0].toLowerCase()}@fyntrictech.co.in`, accountId: account ? uid[account] : null, accountEmail: account ? PEOPLE.find((p) => p[0] === account)[2] : null }));
}

const clients = [
  ["acme", "Acme Retail Pvt Ltd", "Vikram Shah", "Mumbai"],
  ["greenleaf", "GreenLeaf Organics", "Meera Krishnan", "Kochi"],
  ["northwind", "Northwind Logistics", "David Joseph", "Dubai"],
];
for (const [id, name, contactPerson, city] of clients) {
  await db.doc(`clients/${id}`).set(stamp("sales", { name, contactPerson, city, country: city === "Dubai" ? "UAE" : "India", status: "active", email: `${contactPerson.split(" ")[0].toLowerCase()}@example.com` }));
}

const leads = [
  ["Ravi Kumar", "Spice Route Foods", "ERP / CRM solutions", 450000, "proposal", "Meta ads"],
  ["Aisha Khan", "Bloom Clinics", "Mobile app development", 320000, "qualified", "Website"],
  ["Manoj Varghese", "Coastal Realty", "Web development", 120000, "new", "Google ads"],
  ["Lakshmi R", "EduNext Academy", "Web development", 200000, "contacted", "Referral"],
  ["Sanjay Gupta", "UrbanFit Gyms", "Mobile app development", 550000, "negotiation", "Meta ads"],
  ["Neha Joshi", "Craftly", "UI / UX design", 90000, "lost", "WhatsApp"],
];
for (const [i, [name, company, service, estimatedValue, stage, source]] of leads.entries()) {
  const added = now - (20 - i * 3) * 86_400_000;
  await db.doc(`leads/lead${i}`).set(stamp("sales", { name, company, service, estimatedValue, stage, source, phone: `98470${String(10000 + i * 1111)}`, createdAt: added }));
  const t = new Date(added);
  await db.doc(`followups/fu${i}a`).set(stamp("sales", {
    leadId: `lead${i}`, leadIdLabel: name, date: t.toISOString().slice(0, 10), time: "10:30", mode: "Phone call", goal: "Introduction Call",
    status: "done", isFirstCall: true, summary: `Spoke to ${name.split(" ")[0]} about ${service.toLowerCase()}. Interested; asked for a quote.`, createdAt: added,
  }));
  if (i < 3) {
    await db.doc(`followups/fu${i}b`).set(stamp("sales", {
      leadId: `lead${i}`, leadIdLabel: name, date: iso(i + 1), time: "15:00", mode: "Google Meet", goal: "Walk through the estimate",
      status: "scheduled", points: "Scope and timeline\nPayment terms\nHosting options",
    }));
  }
}

const products = [
  ["Business website (up to 8 pages)", "service", "Website", 45000, "Project", false, null],
  ["E-commerce website", "service", "Website", 120000, "Project", false, null],
  ["Mobile app (Android + iOS)", "service", "Mobile app", 280000, "Project", false, null],
  ["Annual maintenance (website)", "service", "Support plan", 12000, "Year", true, "annually"],
  ["Cloud hosting (managed)", "service", "Hosting & domain", 2500, "Month", true, "monthly"],
  ["UI / UX design (per screen)", "service", "Design", 3500, "Screen", false, null],
];
for (const [i, [name, kind, category, price, unit, isSubscription, billingCycle]] of products.entries()) {
  await db.doc(`products/prd${i}`).set(stamp("sales", { name, kind, category, price, unit, taxRate: 18, status: "active", isSubscription, billingCycle, code: "998314" }));
}

const line = (i, qty = 1) => {
  const [name, , , rate, unit] = products[i];
  return { productId: `prd${i}`, name, qty, unit, rate, taxRate: 18, amount: rate * qty };
};
const estimates = [
  ["lead0", "Ravi Kumar", "Restaurant ERP", [line(2), line(3)], "sent", -6],
  ["lead1", "Aisha Khan", "Clinic booking app", [line(2), line(5, 12)], "revision", -4],
  ["lead4", "Sanjay Gupta", "Gym membership app", [line(2), line(4, 12)], "approved", -9],
  ["lead2", "Manoj Varghese", "Property listing site", [line(0), line(4, 12)], "draft", 0],
];
for (const [i, [leadId, leadIdLabel, title, items, status, day]] of estimates.entries()) {
  const subtotal = items.reduce((t, it) => t + it.amount, 0);
  const taxTotal = Math.round(subtotal * 0.18);
  await db.doc(`estimates/est${i}`).set(stamp("sales", { estimateNumber: `EST-202611-${3001 + i}`, leadId, leadIdLabel, title, items, status, issueDate: iso(day), validUntil: iso(day + 15), subtotal, taxTotal, total: subtotal + taxTotal, terms: "50% advance to start the work, balance on delivery." }));
}

const projects = [
  ["Acme e-commerce revamp", "acme", "Acme Retail Pvt Ltd", 65, "in_progress", "high", 800000, 30],
  ["GreenLeaf delivery app", "greenleaf", "GreenLeaf Organics", 35, "in_progress", "medium", 600000, 60],
  ["Northwind fleet dashboard", "northwind", "Northwind Logistics", 10, "planning", "medium", 450000, 90],
  ["Acme loyalty programme", "acme", "Acme Retail Pvt Ltd", 100, "completed", "low", 250000, -20],
];
for (const [i, [name, clientId, clientIdLabel, progress, status, priority, budget, due]] of projects.entries()) {
  await db.doc(`projects/proj${i}`).set(stamp("project_manager", { name, code: `FT-P-00${i + 1}`, clientId, clientIdLabel, managerId: "emp0", managerIdLabel: "Anjali Menon", progress, status, priority, budget, startDate: iso(-60), dueDate: iso(due) }));
}

const invoices = [
  ["acme", "Acme Retail Pvt Ltd", 200000, "paid", -150, -140],
  ["greenleaf", "GreenLeaf Organics", 150000, "paid", -110, -100],
  ["acme", "Acme Retail Pvt Ltd", 180000, "paid", -70, -60],
  ["northwind", "Northwind Logistics", 120000, "paid", -40, -30],
  ["greenleaf", "GreenLeaf Organics", 160000, "sent", -12, null],
  ["acme", "Acme Retail Pvt Ltd", 220000, "overdue", -45, null],
  ["northwind", "Northwind Logistics", 90000, "paid", -5, -2],
];
for (const [i, [clientId, clientIdLabel, amount, status, issued, paid]] of invoices.entries()) {
  const total = amount * 1.18;
  const amountPaid = status === "paid" ? total : 0;
  await db.doc(`invoices/inv${i}`).set(stamp("sales", { invoiceNumber: `INV-2026-${1001 + i}`, clientId, clientIdLabel, amount, taxRate: 18, total, amountPaid, balance: total - amountPaid, status, issueDate: iso(issued), dueDate: iso(issued + 15), paidDate: paid === null ? null : iso(paid) }));
  if (status === "paid") {
    await db.doc(`payments/pay${i}`).set(stamp("sales", { direction: "received", invoiceId: `inv${i}`, invoiceIdLabel: `INV-2026-${1001 + i}`, against: `Invoice INV-2026-${1001 + i}`, date: iso(paid), amount: total, mode: "Bank transfer", reference: `UTR${88000 + i}` }));
  }
}

const suppliers = [
  ["sup0", "Google Workspace", "Software / SaaS"],
  ["sup1", "Godrej Interio", "Furniture"],
  ["sup2", "Kerala Vision Broadband", "Internet & telecom"],
  ["sup3", "Lenovo Store Kozhikode", "Hardware"],
];
for (const [id, name, category] of suppliers) {
  await db.doc(`suppliers/${id}`).set(stamp("admin", { name, category, status: "active" }));
}
const bills = [
  ["sup0", "Google Workspace", "GW-1101", "Software & subscriptions", 8400, -20, true, "monthly", 10, 8400 * 1.18],
  ["sup1", "Godrej Interio", "GI-5520", "Furniture", 96000, -45, false, null, null, 50000],
  ["sup2", "Kerala Vision Broadband", "KV-772", "Internet & telecom", 14400, -100, true, "annually", 265, 14400 * 1.18],
  ["sup3", "Lenovo Store Kozhikode", "LS-3391", "Computers & hardware", 168000, -8, false, null, null, 0],
];
for (const [i, [supplierId, supplierIdLabel, billNumber, category, amount, day, isSubscription, billingCycle, renew, paid]] of bills.entries()) {
  const total = amount * 1.18;
  const balance = Math.round((total - paid) * 100) / 100;
  await db.doc(`purchases/bill${i}`).set(stamp("admin", { supplierId, supplierIdLabel, billNumber, category, amount, taxRate: 18, total, amountPaid: paid, balance, status: paid <= 0 ? "unpaid" : balance <= 0 ? "paid" : "partial", billDate: iso(day), dueDate: iso(day + 15), isSubscription, billingCycle, renewalDate: renew === null ? null : iso(renew) }));
  if (paid > 0) await db.doc(`payments/out${i}`).set(stamp("admin", { direction: "paid", billId: `bill${i}`, billIdLabel: billNumber, against: `Bill ${billNumber}`, date: iso(day + 3), amount: paid, mode: "UPI" }));
}

// Two months of attendance for everyone on the team, with a few short or missed days.
for (const [r, role] of ["staff", "project_manager", "sales", "hr_manager"].entries()) {
  for (let back = 60; back >= 0; back--) {
    const d = new Date();
    d.setDate(d.getDate() - back);
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    const date = d.toISOString().slice(0, 10);
    if ((back + r) % 17 === 5) continue; // missed day
    if (back === 0) {
      await db.doc(`attendance/${role}-${date}`).set(stamp(role, { date, checkIn: "09:12", workMode: "office" }));
      continue;
    }
    const short = (back + r) % 9 === 3;
    const checkOut = short ? "15:40" : `18:${String(10 + ((back * 7) % 40)).padStart(2, "0")}`;
    const [h, m] = checkOut.split(":").map(Number);
    const hours = Math.round(((h * 60 + m - (9 * 60 + 5)) / 60) * 100) / 100;
    await db.doc(`attendance/${role}-${date}`).set(stamp(role, { date, checkIn: "09:05", checkOut, hours, workMode: back % 5 === 0 ? "remote" : "office" }));
  }
}

await db.doc("leave/lv1").set(stamp("staff", { leaveType: "casual", fromDate: iso(5), toDate: iso(6), days: 2, reason: "Family function", status: "pending" }));
await db.doc("leave/lv2").set(stamp("sales", { leaveType: "sick", fromDate: iso(-10), toDate: iso(-10), days: 1, reason: "Fever", status: "approved" }));
await db.doc("leave/lv3").set(stamp("staff", { leaveType: "earned", fromDate: iso(-25), toDate: iso(-23), days: 3, reason: "Trip home", status: "approved" }));

for (const [i, [hours, task]] of [[6, "Checkout flow API"], [7.5, "Product listing UI"], [4, "Code review and fixes"]].entries()) {
  await db.doc(`timesheets/ts${i}`).set(stamp("staff", { date: iso(-i), projectId: "proj0", projectIdLabel: "Acme e-commerce revamp", hours, task, billable: "yes" }));
}

await db.doc("expenses/ex1").set(stamp("staff", { date: iso(-2), category: "Travel", amount: 1850, paymentMode: "UPI", description: "Client visit to Kochi", status: "pending" }));
await db.doc("expenses/ex2").set(stamp("admin", { date: iso(-8), category: "Software & subscriptions", amount: 12400, paymentMode: "Card", description: "Figma and GitHub seats", status: "approved" }));
for (let m = 1; m <= 4; m++) {
  const d = new Date();
  d.setMonth(d.getMonth() - m, 1);
  const date = d.toISOString().slice(0, 10);
  await db.doc(`expenses/sal${m}`).set(stamp("admin", { date, category: "Salaries", amount: 385000, paymentMode: "Bank transfer", description: `Salaries for ${d.toLocaleString("en-IN", { month: "long" })}`, status: "reimbursed" }));
}

console.log("Demo data ready. Sign in with e.g. admin@fyntric.test / fyntric123");
process.exit(0);
