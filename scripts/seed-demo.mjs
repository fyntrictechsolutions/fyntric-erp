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
  });
}

const stamp = (role, extra = {}) => ({ userId: uid[role], userName: PEOPLE.find((p) => p[0] === role)[1], createdBy: uid[role], createdAt: now, updatedAt: now, ...extra });

const employees = [
  ["Anjali Menon", "FT-002", "Management", "Project Manager", "active"],
  ["Rahul Nair", "FT-003", "Human Resources", "HR Manager", "active"],
  ["Sneha Pillai", "FT-004", "Sales & Marketing", "Business Development Executive", "active"],
  ["Arjun Das", "FT-005", "Engineering", "Full-stack Developer", "active"],
  ["Fathima Rasheed", "FT-006", "Design", "UI/UX Designer", "active"],
  ["Kiran Thomas", "FT-007", "Engineering", "Flutter Developer", "notice"],
];
for (const [i, [fullName, employeeCode, department, designation, status]] of employees.entries()) {
  await db.doc(`employees/emp${i}`).set(stamp("hr_manager", { fullName, employeeCode, department, designation, status, employmentType: "full_time", joiningDate: iso(-400 + i * 40), email: `${fullName.split(" ")[0].toLowerCase()}@fyntrictech.co.in` }));
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
  ["Ravi Kumar", "Spice Route Foods", "ERP / CRM solutions", 450000, "proposal"],
  ["Aisha Khan", "Bloom Clinics", "Mobile app development", 320000, "qualified"],
  ["Manoj Varghese", "Coastal Realty", "Web development", 120000, "new"],
  ["Lakshmi R", "EduNext Academy", "Web development", 200000, "contacted"],
  ["Sanjay Gupta", "UrbanFit Gyms", "Mobile app development", 550000, "negotiation"],
  ["Neha Joshi", "Craftly", "UI / UX design", 90000, "lost"],
];
for (const [i, [name, company, service, estimatedValue, stage]] of leads.entries()) {
  await db.doc(`leads/lead${i}`).set(stamp("sales", { name, company, service, estimatedValue, stage, source: "website", nextFollowUp: iso(i + 1) }));
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
  await db.doc(`invoices/inv${i}`).set(stamp("sales", { invoiceNumber: `FT-2026-${1001 + i}`, clientId, clientIdLabel, amount, taxRate: 18, total: amount * 1.18, status, issueDate: iso(issued), dueDate: iso(issued + 15), paidDate: paid === null ? null : iso(paid) }));
}

for (const [i, role] of ["staff", "project_manager", "sales", "hr_manager"].entries()) {
  await db.doc(`attendance/att${i}`).set(stamp(role, { date: iso(0), checkIn: `09:${10 + i * 7}`, workMode: i === 1 ? "remote" : "office" }));
}

await db.doc("leave/lv1").set(stamp("staff", { leaveType: "casual", fromDate: iso(5), toDate: iso(6), days: 2, reason: "Family function", status: "pending" }));
await db.doc("leave/lv2").set(stamp("sales", { leaveType: "sick", fromDate: iso(-10), toDate: iso(-10), days: 1, reason: "Fever", status: "approved" }));

for (const [i, [hours, task]] of [[6, "Checkout flow API"], [7.5, "Product listing UI"], [4, "Code review and fixes"]].entries()) {
  await db.doc(`timesheets/ts${i}`).set(stamp("staff", { date: iso(-i), projectId: "proj0", projectIdLabel: "Acme e-commerce revamp", hours, task, billable: "yes" }));
}

await db.doc("expenses/ex1").set(stamp("staff", { date: iso(-2), category: "Travel", amount: 1850, paymentMode: "upi", description: "Client visit to Kochi", status: "pending" }));
await db.doc("expenses/ex2").set(stamp("admin", { date: iso(-8), category: "Software & subscriptions", amount: 12400, paymentMode: "card", description: "Figma and GitHub seats", status: "approved" }));

console.log("Demo data ready. Sign in with e.g. admin@fyntric.test / fyntric123");
process.exit(0);
