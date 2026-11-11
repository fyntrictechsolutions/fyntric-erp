// Checks firestore.rules against the role matrix using the local Firebase emulators.
// Run with: npm run test:rules
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { initializeApp as initAdmin } from "firebase-admin/app";
import { getFirestore as adminDb } from "firebase-admin/firestore";
import { deleteApp, initializeApp } from "firebase/app";
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth } from "firebase/auth";
import {
  addDoc, collection, connectFirestoreEmulator, deleteDoc, doc, getDoc, getDocs, getFirestore, query, setDoc, updateDoc, where,
} from "firebase/firestore";

const PROJECT = "demo-fyntric";
process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
const admin = adminDb(initAdmin({ projectId: PROJECT }, "admin"));

const ROLES = ["admin", "project_manager", "hr_manager", "sales", "staff", "client", "investor", "viewer", "pending"];
/** role -> { uid, db } */
const users = {};
const apps = [];

async function signUp(role) {
  const app = initializeApp({ apiKey: "demo", projectId: PROJECT }, `u-${role}`);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  const cred = await createUserWithEmailAndPassword(auth, `${role}-${Date.now()}@test.dev`, "secret123");
  return { uid: cred.user.uid, db };
}

const allowed = (p) => p.then(() => true, (e) => (String(e.code).includes("permission-denied") ? false : Promise.reject(e)));

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
  test("staff can check out but not move check-in", async () => {
    assert.equal(await allowed(updateDoc(doc(users.staff.db, "attendance", "a1"), { checkOut: "18:00" })), true);
    assert.equal(await allowed(updateDoc(doc(users.staff.db, "attendance", "a1"), { checkIn: "08:00" })), false);
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
  test("employees: HR writes, staff reads, investor/viewer/client nothing", async () => {
    assert.equal(await allowed(addDoc(collection(users.hr_manager.db, "employees"), { fullName: "A", userId: users.hr_manager.uid })), true);
    assert.equal(await allowed(addDoc(collection(users.staff.db, "employees"), { fullName: "A", userId: users.staff.uid })), false);
    assert.equal(await allowed(getDocs(collection(users.staff.db, "employees"))), true);
    for (const r of ["investor", "viewer", "client"]) assert.equal(await allowed(getDocs(collection(users[r].db, "employees"))), false, r);
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
