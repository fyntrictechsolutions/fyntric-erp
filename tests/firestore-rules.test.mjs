// Checks firestore.rules against the role matrix using the local Firebase emulators.
// Run with: npm run test:rules
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { initializeApp as initAdmin } from "firebase-admin/app";
import { getAuth as adminAuth } from "firebase-admin/auth";
import { getFirestore as adminDb } from "firebase-admin/firestore";
import { deleteApp, initializeApp } from "firebase/app";
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth } from "firebase/auth";
import { connectStorageEmulator, deleteObject, getBytes, getStorage, ref, uploadBytes } from "firebase/storage";
import {
  addDoc, collection, connectFirestoreEmulator, deleteDoc, doc, getDoc, getDocs, getFirestore, query, serverTimestamp, setDoc, updateDoc, where,
} from "firebase/firestore";

const PROJECT = "demo-fyntric";
process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= "127.0.0.1:9099";
const adminApp = initAdmin({ projectId: PROJECT }, "admin");
const admin = adminDb(adminApp);

const ROLES = ["admin", "project_manager", "hr_manager", "sales", "staff", "client", "investor", "viewer", "pending"];
/** role -> { uid, db } */
const users = {};
const apps = [];

async function signUp(role, email = `${role}-${Date.now()}@test.dev`) {
  const app = initializeApp({ apiKey: "demo", projectId: PROJECT, storageBucket: `${PROJECT}.appspot.com` }, `u-${role}-${Math.random()}`);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  const storage = getStorage(app);
  connectStorageEmulator(storage, "127.0.0.1", 9199);
  const cred = await createUserWithEmailAndPassword(auth, email, "secret123");
  return { uid: cred.user.uid, db, auth, email, storage };
}

const allowed = (p) => p.then(() => true, (e) => (/permission-denied|storage\/unauthorized/.test(String(e.code)) ? false : Promise.reject(e)));

before(async () => {
  for (const role of ROLES) {
    users[role] = await signUp(role);
    // Every user registers themselves as pending (allowed by the rules)...
    await setDoc(doc(users[role].db, "users", users[role].uid), { email: role, displayName: role, role: "pending", active: true });
    // ...then an "admin" sets the real role (seeded directly, bypassing rules).
    await admin.doc(`users/${users[role].uid}`).update({ role, ...(role === "client" ? { clientId: "c1" } : {}) });
  }
  await admin.doc("clients/c1").set({ name: "Acme", userId: users.sales.uid });
  await admin.doc("clients/c2").set({ name: "Other", userId: users.sales.uid });
  await admin.doc("projects/p1").set({ name: "Acme site", clientId: "c1", userId: users.project_manager.uid });
  await admin.doc("projects/p2").set({ name: "Other app", clientId: "c2", userId: users.project_manager.uid });
  await admin.doc("invoices/i1").set({ clientId: "c1", total: 100, status: "sent", userId: users.sales.uid });
  await admin.doc("leave/l1").set({ status: "pending", userId: users.staff.uid, reason: "x" });
  await admin.doc("expenses/e1").set({ status: "pending", amount: 10, userId: users.staff.uid });
  await admin.doc("attendance/a1").set({ date: "2026-11-11", checkIn: "09:00", workMode: "office", userId: users.staff.uid });
  await admin.doc("purchases/b1").set({ billNumber: "B1", total: 118, amount: 100, userId: users.admin.uid });
  await admin.doc("estimates/est1").set({ leadId: "x", status: "draft", userId: users.sales.uid });
});

after(async () => {
  await Promise.all(apps.map((a) => deleteApp(a)));
});

describe("users", () => {
  test("cannot register yourself with a role other than pending", async () => {
    const u = await signUp("sneaky");
    assert.equal(await allowed(setDoc(doc(u.db, "users", u.uid), { role: "admin", active: true })), false);
  });
  test("cannot promote yourself", async () => {
    assert.equal(await allowed(updateDoc(doc(users.staff.db, "users", users.staff.uid), { role: "admin" })), false);
  });
  test("can rename yourself", async () => {
    assert.equal(await allowed(updateDoc(doc(users.staff.db, "users", users.staff.uid), { displayName: "Staff Person" })), true);
  });
  test("admin can assign roles to others but not change their own", async () => {
    assert.equal(await allowed(updateDoc(doc(users.admin.db, "users", users.viewer.uid), { role: "viewer" })), true);
    assert.equal(await allowed(updateDoc(doc(users.admin.db, "users", users.admin.uid), { role: "staff" })), false);
  });
  test("only admin lists users", async () => {
    assert.equal(await allowed(getDocs(collection(users.admin.db, "users"))), true);
    assert.equal(await allowed(getDocs(collection(users.hr_manager.db, "users"))), false);
  });
});

describe("hiring, salaries and exits", () => {
  test("HR and admin manage candidates; others can't see them", async () => {
    const hr = users.hr_manager;
    const ref = await addDoc(collection(hr.db, "candidates"), { fullName: "C", email: "c@test.dev", userId: hr.uid });
    assert.equal(await allowed(updateDoc(doc(hr.db, "candidates", ref.id), { stage: "interviewing", "interviews.phase1": { status: "passed" } })), true);
    for (const r of ["project_manager", "staff", "investor", "viewer"]) assert.equal(await allowed(getDocs(collection(users[r].db, "candidates"))), false, r);
  });
  test("salaries and exits: HR and admin only", async () => {
    assert.equal(await allowed(setDoc(doc(users.hr_manager.db, "salaries", "emp1"), { current: { total: 50000 } })), true);
    assert.equal(await allowed(getDoc(doc(users.admin.db, "salaries", "emp1"))), true);
    for (const r of ["staff", "project_manager", "investor", "viewer"]) assert.equal(await allowed(getDoc(doc(users[r].db, "salaries", "emp1"))), false, r);
    assert.equal(await allowed(setDoc(doc(users.hr_manager.db, "exits", "emp1"), { status: "requested" })), true);
    assert.equal(await allowed(setDoc(doc(users.staff.db, "exits", "emp1"), { status: "withdrawn" })), false);
  });
  test("employees submit, cancel and withdraw their own resignation", async () => {
    const staff = users.staff;
    await admin.doc(`users/${staff.uid}`).update({ employeeId: "empS" });
    const own = doc(staff.db, "exits", "empS");
    const base = { employeeId: "empS", employeeName: "S", status: "requested", source: "self", receivedOn: "2026-11-23", requestedLastDay: null, reason: "Moving", userId: staff.uid, userName: "S", submittedAt: Date.now(), createdAt: Date.now(), updatedAt: Date.now() };
    // The 24-hour cool-off can't be skipped, and nobody files for someone else.
    assert.equal(await allowed(setDoc(own, { ...base, sendAt: Date.now() + 1000 })), false);
    assert.equal(await allowed(setDoc(doc(staff.db, "exits", "emp1"), { ...base, employeeId: "emp1", sendAt: Date.now() + 864e5 + 60000 })), false);
    assert.equal(await allowed(setDoc(own, { ...base, sendAt: Date.now() + 864e5 + 60000, checklist: [] })), false);
    assert.equal(await allowed(setDoc(own, { ...base, sendAt: Date.now() + 864e5 + 60000 })), true);
    assert.equal(await allowed(getDoc(own)), true);
    assert.equal(await allowed(getDoc(doc(staff.db, "exits", "emp1"))), false);
    assert.equal(await allowed(updateDoc(own, { status: "processing" })), false);
    // Cancel during the cool-off.
    assert.equal(await allowed(deleteDoc(own)), true);
    // After the cool-off: no deleting, but withdrawing works until HR processes it.
    await admin.doc("exits/empS").set({ ...base, sendAt: Date.now() - 1000 });
    assert.equal(await allowed(deleteDoc(own)), false);
    assert.equal(await allowed(updateDoc(own, { status: "withdrawn", withdrawnOn: "2026-11-24", withdrawnBy: "S", updatedAt: Date.now() })), true);
    assert.equal(await allowed(setDoc(own, { ...base, sendAt: Date.now() + 864e5 + 60000 })), true);
    await admin.doc("exits/empS").update({ status: "processing" });
    assert.equal(await allowed(updateDoc(own, { status: "withdrawn", updatedAt: Date.now() })), false);
    // Other staff can't see it.
    assert.equal(await allowed(getDoc(doc(users.sales.db, "exits", "empS"))), false);
  });
  test("files: HR uploads; others can't read", async () => {
    const hr = users.hr_manager;
    assert.equal(await allowed(addDoc(collection(hr.db, "files"), { ownerId: "x", data: "data:,hi", userId: hr.uid })), true);
    assert.equal(await allowed(getDocs(collection(users.staff.db, "files"))), false);
  });
  test("HR can invite a hire only as Other Staff, and create their employee record but not edit it", async () => {
    const hr = users.hr_manager;
    assert.equal(await allowed(setDoc(doc(hr.db, "invites", "hire@test.dev"), { email: "hire@test.dev", role: "staff" })), true);
    assert.equal(await allowed(setDoc(doc(hr.db, "invites", "boss@test.dev"), { email: "boss@test.dev", role: "admin" })), false);
    const emp = await addDoc(collection(hr.db, "employees"), { fullName: "Hire", userId: hr.uid });
    assert.equal(await allowed(updateDoc(doc(hr.db, "employees", emp.id), { designation: "CEO" })), false);
  });
});

describe("payroll", () => {
  const slip = (uid, accountId, status = "draft") => ({ employeeId: "emp1", month: "2026-11", accountId, status, gross: 1000, net: 900, userId: uid });
  test("HR and admin prepare payslips; staff can't", async () => {
    assert.equal(await allowed(setDoc(doc(users.hr_manager.db, "payroll", "emp1_2026-11"), slip(users.hr_manager.uid, users.staff.uid))), true);
    assert.equal(await allowed(setDoc(doc(users.staff.db, "payroll", "emp2_2026-11"), slip(users.staff.uid, users.staff.uid))), false);
    assert.equal(await allowed(setDoc(doc(users.admin.db, "payroll", "emp3_2026-11"), slip(users.admin.uid, users.sales.uid, "paid"))), true);
  });
  test("people see only their own payslips, and only once paid", async () => {
    assert.equal(await allowed(getDoc(doc(users.staff.db, "payroll", "emp1_2026-11"))), false);
    await updateDoc(doc(users.hr_manager.db, "payroll", "emp1_2026-11"), { status: "paid" });
    assert.equal(await allowed(getDoc(doc(users.staff.db, "payroll", "emp1_2026-11"))), true);
    assert.equal(await allowed(getDoc(doc(users.sales.db, "payroll", "emp1_2026-11"))), false);
    assert.equal(await allowed(getDocs(query(collection(users.staff.db, "payroll"), where("accountId", "==", users.staff.uid), where("status", "==", "paid")))), true);
    assert.equal(await allowed(getDocs(collection(users.staff.db, "payroll"))), false);
    assert.equal(await allowed(getDocs(collection(users.investor.db, "payroll"))), false);
  });
  test("HR keeps the monthly Salaries expense, but can't add other expenses as approved", async () => {
    const exp = (uid) => ({ source: "payroll", month: "2026-11", category: "Salaries", amount: 1000, status: "reimbursed", userId: uid });
    assert.equal(await allowed(setDoc(doc(users.hr_manager.db, "expenses", "payroll-2026-11"), exp(users.hr_manager.uid))), true);
    assert.equal(await allowed(setDoc(doc(users.hr_manager.db, "expenses", "payroll-2026-11"), { ...exp(users.hr_manager.uid), amount: 2000 })), true);
    assert.equal(await allowed(setDoc(doc(users.hr_manager.db, "expenses", "payroll-2026-12"), { ...exp(users.hr_manager.uid) })), false);
    assert.equal(await allowed(setDoc(doc(users.hr_manager.db, "expenses", "x1"), { ...exp(users.hr_manager.uid), source: "other" })), false);
    assert.equal(await allowed(updateDoc(doc(users.hr_manager.db, "expenses", "e1"), { status: "approved" })), false);
    assert.equal(await allowed(getDoc(doc(users.investor.db, "expenses", "payroll-2026-11"))), true);
    assert.equal(await allowed(deleteDoc(doc(users.hr_manager.db, "expenses", "payroll-2026-11"))), true);
  });
  test("HR reads invoices to work out commission, but can't change them", async () => {
    assert.equal(await allowed(getDocs(query(collection(users.hr_manager.db, "invoices"), where("userId", "==", users.sales.uid)))), true);
    assert.equal(await allowed(updateDoc(doc(users.hr_manager.db, "invoices", "i1"), { total: 1 })), false);
  });
});

describe("activity log", () => {
  const entry = (uid, extra = {}) => ({ action: "update", module: "leads", changes: [], userId: uid, at: serverTimestamp(), ...extra });
  test("anyone signed in adds entries for themselves, with the server's time", async () => {
    for (const r of ["staff", "client", "pending"]) assert.equal(await allowed(addDoc(collection(users[r].db, "logs"), entry(users[r].uid))), true, r);
    assert.equal(await allowed(addDoc(collection(users.staff.db, "logs"), entry(users.admin.uid))), false, "as someone else");
    assert.equal(await allowed(addDoc(collection(users.staff.db, "logs"), entry(users.staff.uid, { at: new Date(2020, 0, 1) }))), false, "backdated");
    assert.equal(await allowed(addDoc(collection(users.staff.db, "logs"), entry(users.staff.uid, { action: "hack" }))), false, "unknown action");
  });
  test("only admins read it, and nobody edits or deletes entries", async () => {
    const ref = await addDoc(collection(users.admin.db, "logs"), entry(users.admin.uid, { action: "login" }));
    assert.equal(await allowed(getDocs(collection(users.admin.db, "logs"))), true);
    for (const r of ["hr_manager", "staff", "investor", "viewer"]) assert.equal(await allowed(getDocs(collection(users[r].db, "logs"))), false, r);
    assert.equal(await allowed(updateDoc(doc(users.admin.db, "logs", ref.id), { action: "logout" })), false);
    assert.equal(await allowed(deleteDoc(doc(users.admin.db, "logs", ref.id))), false);
  });
});

describe("invitations", () => {
  async function verified(role, email) {
    const u = await signUp(role, email);
    await adminAuth(adminApp).updateUser(u.uid, { emailVerified: true });
    await u.auth.currentUser.getIdToken(true);
    return u;
  }
  test("only admin creates invitations", async () => {
    assert.equal(await allowed(setDoc(doc(users.admin.db, "invites", "new@test.dev"), { email: "new@test.dev", role: "staff" })), true);
    assert.equal(await allowed(setDoc(doc(users.hr_manager.db, "invites", "x@test.dev"), { email: "x@test.dev", role: "admin" })), false);
  });
  test("invited person signs in with the invited role", async () => {
    const email = `invitee-${Date.now()}@test.dev`;
    await admin.doc(`invites/${email}`).set({ email, role: "sales", employeeId: "emp9", clientId: null });
    const u = await verified("invitee", email);
    assert.equal(await allowed(getDoc(doc(u.db, "invites", email))), true);
    const profile = { email, displayName: "I", active: true, inviteId: email, employeeId: "emp9", clientId: null };
    assert.equal(await allowed(setDoc(doc(u.db, "users", u.uid), { ...profile, role: "admin" })), false);
    assert.equal(await allowed(setDoc(doc(u.db, "users", u.uid), { ...profile, role: "sales" })), true);
    assert.equal(await allowed(deleteDoc(doc(u.db, "invites", email))), true);
  });
  test("someone else can't use or read an invitation", async () => {
    const email = `target-${Date.now()}@test.dev`;
    await admin.doc(`invites/${email}`).set({ email, role: "admin" });
    const other = await verified("other", `other-${Date.now()}@test.dev`);
    assert.equal(await allowed(getDoc(doc(other.db, "invites", email))), false);
    assert.equal(await allowed(setDoc(doc(other.db, "users", other.uid), { role: "admin", active: true, inviteId: email })), false);
  });
  test("an unverified email can't claim its invitation", async () => {
    const email = `unverified-${Date.now()}@test.dev`;
    await admin.doc(`invites/${email}`).set({ email, role: "staff" });
    const u = await signUp("unverified", email);
    assert.equal(await allowed(setDoc(doc(u.db, "users", u.uid), { role: "staff", active: true, inviteId: email })), false);
  });
});

describe("pending users", () => {
  test("see nothing", async () => {
    for (const c of ["employees", "projects", "clients", "leads", "invoices"]) {
      assert.equal(await allowed(getDocs(collection(users.pending.db, c))), false, c);
    }
  });
});

describe("leave approvals", () => {
  test("staff cannot approve their own leave", async () => {
    assert.equal(await allowed(updateDoc(doc(users.staff.db, "leave", "l1"), { status: "approved" })), false);
  });
  test("staff can edit their pending leave", async () => {
    assert.equal(await allowed(updateDoc(doc(users.staff.db, "leave", "l1"), { reason: "family" })), true);
  });
  test("staff cannot create pre-approved leave", async () => {
    const s = users.staff;
    assert.equal(await allowed(addDoc(collection(s.db, "leave"), { status: "approved", userId: s.uid })), false);
    assert.equal(await allowed(addDoc(collection(s.db, "leave"), { status: "pending", userId: s.uid })), true);
  });
  test("cannot create a record on someone else's behalf", async () => {
    assert.equal(await allowed(addDoc(collection(users.staff.db, "leave"), { status: "pending", userId: users.sales.uid })), false);
  });
  test("staff only list their own leave; other staff see none of it", async () => {
    const mine = query(collection(users.staff.db, "leave"), where("userId", "==", users.staff.uid));
    assert.equal(await allowed(getDocs(mine)), true);
    assert.equal(await allowed(getDocs(collection(users.staff.db, "leave"))), false);
    assert.equal(await allowed(getDoc(doc(users.sales.db, "leave", "l1"))), false);
  });
  test("HR approves", async () => {
    assert.equal(await allowed(updateDoc(doc(users.hr_manager.db, "leave", "l1"), { status: "approved" })), true);
  });
  test("staff cannot edit or delete once approved", async () => {
    assert.equal(await allowed(updateDoc(doc(users.staff.db, "leave", "l1"), { reason: "changed" })), false);
    assert.equal(await allowed(deleteDoc(doc(users.staff.db, "leave", "l1"))), false);
  });
});

describe("attendance", () => {
  test("staff can check out once but not move check-in", async () => {
    assert.equal(await allowed(updateDoc(doc(users.staff.db, "attendance", "a1"), { checkIn: "08:00" })), false);
    assert.equal(await allowed(updateDoc(doc(users.staff.db, "attendance", "a1"), { checkOut: "18:00", hours: 9 })), true);
    assert.equal(await allowed(updateDoc(doc(users.staff.db, "attendance", "a1"), { checkOut: "20:00" })), false);
  });
  test("admin and PM correct entries; HR can only look", async () => {
    assert.equal(await allowed(updateDoc(doc(users.project_manager.db, "attendance", "a1"), { checkIn: "08:30" })), true);
    assert.equal(await allowed(updateDoc(doc(users.admin.db, "attendance", "a1"), { checkIn: "08:45" })), true);
    assert.equal(await allowed(updateDoc(doc(users.hr_manager.db, "attendance", "a1"), { checkIn: "08:00" })), false);
    for (const r of ["hr_manager", "project_manager", "investor", "viewer"]) {
      assert.equal(await allowed(getDocs(collection(users[r].db, "attendance"))), true, r);
    }
    assert.equal(await allowed(getDocs(collection(users.sales.db, "attendance"))), false);
  });
  test("staff cannot delete attendance", async () => {
    assert.equal(await allowed(deleteDoc(doc(users.staff.db, "attendance", "a1"))), false);
  });
  test("clients and investors have no attendance", async () => {
    const c = users.client;
    assert.equal(await allowed(addDoc(collection(c.db, "attendance"), { userId: c.uid })), false);
  });
});

describe("expenses", () => {
  test("staff cannot approve, admin can, investor reads", async () => {
    assert.equal(await allowed(updateDoc(doc(users.staff.db, "expenses", "e1"), { status: "approved" })), false);
    assert.equal(await allowed(updateDoc(doc(users.admin.db, "expenses", "e1"), { status: "approved" })), true);
    assert.equal(await allowed(getDocs(collection(users.investor.db, "expenses"))), true);
    assert.equal(await allowed(updateDoc(doc(users.investor.db, "expenses", "e1"), { status: "rejected" })), false);
  });
});

describe("client portal", () => {
  test("client lists only their own projects and invoices", async () => {
    const c = users.client;
    assert.equal(await allowed(getDocs(query(collection(c.db, "projects"), where("clientId", "==", "c1")))), true);
    assert.equal(await allowed(getDocs(query(collection(c.db, "invoices"), where("clientId", "==", "c1")))), true);
    assert.equal(await allowed(getDocs(collection(c.db, "projects"))), false);
    assert.equal(await allowed(getDoc(doc(c.db, "projects", "p2"))), false);
    assert.equal(await allowed(getDocs(collection(c.db, "clients"))), false);
  });
});

describe("module access by role", () => {
  test("leads: sales & admin write; PM & viewer read; staff, client and investor nothing", async () => {
    for (const r of ["sales", "admin"]) assert.equal(await allowed(addDoc(collection(users[r].db, "leads"), { name: "L", userId: users[r].uid })), true, r);
    for (const r of ["project_manager", "viewer"]) {
      assert.equal(await allowed(getDocs(collection(users[r].db, "leads"))), true, r);
      assert.equal(await allowed(addDoc(collection(users[r].db, "leads"), { userId: users[r].uid })), false, r);
    }
    for (const r of ["staff", "client", "investor", "hr_manager"]) assert.equal(await allowed(getDocs(collection(users[r].db, "leads"))), false, r);
  });
  test("employees: admin writes; HR, PM, investor, viewer read; staff can't create", async () => {
    assert.equal(await allowed(addDoc(collection(users.admin.db, "employees"), { fullName: "A", userId: users.admin.uid })), true);
    assert.equal(await allowed(addDoc(collection(users.staff.db, "employees"), { fullName: "A", userId: users.staff.uid })), false);
    for (const r of ["hr_manager", "project_manager", "investor", "viewer"]) assert.equal(await allowed(getDocs(collection(users[r].db, "employees"))), true, r);
    for (const r of ["staff", "sales", "client"]) assert.equal(await allowed(getDocs(collection(users[r].db, "employees"))), false, r);
  });
  test("follow-ups and estimates: sales writes; PM and viewer read", async () => {
    assert.equal(await allowed(addDoc(collection(users.sales.db, "followups"), { leadId: "x", userId: users.sales.uid })), true);
    assert.equal(await allowed(updateDoc(doc(users.sales.db, "estimates", "est1"), { status: "sent" })), true);
    for (const r of ["project_manager", "viewer"]) {
      assert.equal(await allowed(getDocs(collection(users[r].db, "followups"))), true, r);
      assert.equal(await allowed(updateDoc(doc(users[r].db, "estimates", "est1"), { status: "approved" })), false, r);
    }
    assert.equal(await allowed(getDocs(collection(users.investor.db, "estimates"))), true);
    assert.equal(await allowed(getDocs(collection(users.staff.db, "estimates"))), false);
  });
  test("products: everyone internal reads, sales writes", async () => {
    assert.equal(await allowed(getDocs(collection(users.staff.db, "products"))), true);
    assert.equal(await allowed(addDoc(collection(users.sales.db, "products"), { name: "Site", userId: users.sales.uid })), true);
    assert.equal(await allowed(addDoc(collection(users.staff.db, "products"), { name: "Site", userId: users.staff.uid })), false);
    assert.equal(await allowed(getDocs(collection(users.client.db, "products"))), false);
  });
  test("sales gallery: internal, investor and viewer read; sales and admin add, edit and delete", async () => {
    const entry = (role) => ({ gallery: "sales", name: "Brochure", visibility: "public", userId: users[role].uid });
    const salesQuery = (role) => query(collection(users[role].db, "gallery"), where("gallery", "==", "sales"));
    assert.equal(await allowed(addDoc(collection(users.sales.db, "gallery"), entry("sales"))), true);
    assert.equal(await allowed(addDoc(collection(users.staff.db, "gallery"), entry("staff"))), false);
    assert.equal(await allowed(addDoc(collection(users.sales.db, "gallery"), { ...entry("sales"), gallery: "hr" })), false);
    for (const role of ["staff", "investor", "viewer", "project_manager"]) assert.equal(await allowed(getDocs(salesQuery(role))), true, role);
    assert.equal(await allowed(getDocs(salesQuery("client"))), false);
    // Lists must ask for one gallery.
    assert.equal(await allowed(getDocs(collection(users.staff.db, "gallery"))), false);
    const ref = await addDoc(collection(users.sales.db, "gallery"), entry("sales"));
    assert.equal(await allowed(updateDoc(doc(users.admin.db, "gallery", ref.id), { name: "Renamed", visibility: "private" })), true);
    assert.equal(await allowed(updateDoc(doc(users.staff.db, "gallery", ref.id), { name: "Mine" })), false);
    assert.equal(await allowed(updateDoc(doc(users.sales.db, "gallery", ref.id), { userId: users.staff.uid })), false);
    assert.equal(await allowed(deleteDoc(doc(users.viewer.db, "gallery", ref.id))), false);
    assert.equal(await allowed(deleteDoc(doc(users.sales.db, "gallery", ref.id))), true);
  });
  test("sales gallery files in Storage: sales and admin upload and delete; staff, investor and viewer read; clients nothing", async () => {
    const file = (role, path = "gallery/sales/f1/brochure.pdf") => ref(users[role].storage, path);
    const pdf = new Uint8Array([37, 80, 68, 70]);
    assert.equal(await allowed(uploadBytes(file("sales"), pdf, { contentType: "application/pdf" })), true);
    assert.equal(await allowed(uploadBytes(file("staff", "gallery/sales/f2/x.pdf"), pdf, { contentType: "application/pdf" })), false);
    assert.equal(await allowed(uploadBytes(file("admin", "elsewhere/x.pdf"), pdf, { contentType: "application/pdf" })), false);
    for (const role of ["staff", "investor", "viewer", "project_manager"]) assert.equal(await allowed(getBytes(file(role))), true, role);
    assert.equal(await allowed(getBytes(file("client"))), false);
    assert.equal(await allowed(getBytes(file("pending"))), false);
    // Too large for a PDF (over 25 MB).
    assert.equal(await allowed(uploadBytes(file("sales", "gallery/sales/f3/big.pdf"), new Uint8Array(26 * 1024 * 1024), { contentType: "application/pdf" })), false);
    assert.equal(await allowed(deleteObject(file("viewer"))), false);
    assert.equal(await allowed(deleteObject(file("sales"))), true);
  });
  test("purchases and suppliers: admin only writes; investor reads; sales nothing", async () => {
    assert.equal(await allowed(addDoc(collection(users.admin.db, "suppliers"), { name: "S", userId: users.admin.uid })), true);
    assert.equal(await allowed(getDocs(collection(users.investor.db, "purchases"))), true);
    assert.equal(await allowed(updateDoc(doc(users.investor.db, "purchases", "b1"), { total: 1 })), false);
    assert.equal(await allowed(getDocs(collection(users.sales.db, "purchases"))), false);
  });
  test("payments: sales records money received only; admin records both", async () => {
    const s = users.sales;
    assert.equal(await allowed(addDoc(collection(s.db, "payments"), { direction: "received", invoiceId: "i1", amount: 50, userId: s.uid })), true);
    assert.equal(await allowed(addDoc(collection(s.db, "payments"), { direction: "paid", billId: "b1", amount: 50, userId: s.uid })), false);
    assert.equal(await allowed(addDoc(collection(users.admin.db, "payments"), { direction: "paid", billId: "b1", amount: 50, userId: users.admin.uid })), true);
    assert.equal(await allowed(getDocs(collection(users.staff.db, "payments"))), false);
  });
  test("settings: everyone signed in reads, only admin writes", async () => {
    assert.equal(await allowed(setDoc(doc(users.admin.db, "settings", "business"), { name: "Fyntric" }, { merge: true })), true);
    assert.equal(await allowed(getDoc(doc(users.client.db, "settings", "business"))), true);
    assert.equal(await allowed(setDoc(doc(users.hr_manager.db, "settings", "business"), { name: "X" }, { merge: true })), false);
    assert.equal(await allowed(getDoc(doc(users.pending.db, "settings", "business"))), false);
  });
  test("projects: PM writes, staff/investor/viewer read only", async () => {
    assert.equal(await allowed(updateDoc(doc(users.project_manager.db, "projects", "p1"), { progress: 50 })), true);
    for (const r of ["staff", "investor", "viewer"]) {
      assert.equal(await allowed(getDocs(collection(users[r].db, "projects"))), true, r);
      assert.equal(await allowed(updateDoc(doc(users[r].db, "projects", "p1"), { progress: 60 })), false, r);
    }
  });
  test("invoices: sales edits but can't delete; investor reads; staff nothing", async () => {
    assert.equal(await allowed(updateDoc(doc(users.sales.db, "invoices", "i1"), { status: "paid" })), true);
    assert.equal(await allowed(deleteDoc(doc(users.sales.db, "invoices", "i1"))), false);
    assert.equal(await allowed(getDocs(collection(users.investor.db, "invoices"))), true);
    assert.equal(await allowed(getDocs(collection(users.staff.db, "invoices"))), false);
  });
  test("nobody can reassign ownership of a record", async () => {
    assert.equal(await allowed(updateDoc(doc(users.admin.db, "invoices", "i1"), { userId: users.admin.uid })), false);
  });
  test("disabled users lose access", async () => {
    await admin.doc(`users/${users.viewer.uid}`).update({ active: false });
    assert.equal(await allowed(getDocs(collection(users.viewer.db, "projects"))), false);
  });
});
