import { collection, doc, getDoc, getDocs, query, updateDoc, where } from "firebase/firestore";
import { db } from "@/lib/firebase";

/**
 * Re-adds every payment recorded against an invoice or purchase bill and saves
 * the paid amount, balance and status on it.
 */
export async function recalcPaid(target: "invoices" | "purchases", id: string) {
  const field = target === "invoices" ? "invoiceId" : "billId";
  const snap = await getDocs(query(collection(db(), "payments"), where(field, "==", id)));
  const paid = Math.round(snap.docs.reduce((t, d) => t + (Number(d.data().amount) || 0), 0) * 100) / 100;

  const ref = doc(db(), target, id);
  const current = await getDoc(ref);
  if (!current.exists()) return;
  const data = current.data();
  const total = Number(data.total) || 0;
  const balance = Math.round((total - paid) * 100) / 100;

  let status = data.status as string;
  if (target === "invoices") {
    if (paid > 0 && balance <= 0) status = "paid";
    else if (paid > 0) status = "partial";
    else if (status === "paid" || status === "partial") status = "sent";
  } else {
    status = paid <= 0 ? "unpaid" : balance <= 0 ? "paid" : "partial";
  }

  await updateDoc(ref, {
    amountPaid: paid,
    balance,
    status,
    ...(status === "paid" && target === "invoices" && !data.paidDate ? { paidDate: new Date().toISOString().slice(0, 10) } : {}),
    updatedAt: Date.now(),
  });
}
