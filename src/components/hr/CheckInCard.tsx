"use client";

import { collection, query, where } from "firebase/firestore";
import { LogIn, LogOut } from "lucide-react";
import { useState } from "react";
import { useProfile } from "@/components/auth/AuthProvider";
import { friendlyError } from "@/components/resource/ResourcePage";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { inputClasses } from "@/components/ui/fieldStyles";
import { INTERNAL_ROLES, type Role } from "@/config/roles";
import { useLiveQuery } from "@/hooks/useCollection";
import { db } from "@/lib/firebase";
import { hoursBetween, nowTime, todayISO } from "@/lib/format";
import { createRecord, updateRecord } from "@/lib/records";

/** One-tap check-in / check-out for today, shown above the attendance list. */
export function CheckInCard() {
  const profile = useProfile();
  const [today] = useState(todayISO);
  const [mode, setMode] = useState("office");
  const [busy, setBusy] = useState(false);
  const isStaff = INTERNAL_ROLES.includes(profile.role as Role);

  const { data, loading } = useLiveQuery(
    () => (isStaff ? query(collection(db(), "attendance"), where("userId", "==", profile.id), where("date", "==", today)) : null),
    `checkin:${profile.id}:${today}`,
  );
  const entry = data[0];

  if (!isStaff) return null;

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      window.alert(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const checkIn = () => act(() => createRecord("attendance", { date: today, checkIn: nowTime(), workMode: mode }, profile));
  const checkOut = () =>
    act(() => {
      const out = nowTime();
      return updateRecord("attendance", entry!.id, { checkOut: out, hours: hoursBetween(entry!.checkIn, out) ?? null });
    });

  return (
    <Card className="relative mb-6 overflow-hidden p-5">
      <div aria-hidden className="pointer-events-none absolute -top-16 -right-16 size-48 rounded-full bg-brand-500/15 blur-3xl" />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-muted">Today</p>
          <p className="font-display text-lg font-semibold text-foreground">
            {loading
              ? "…"
              : !entry
                ? "You haven't checked in yet"
                : entry.checkOut
                  ? `Done for the day: ${String(entry.checkIn)} to ${String(entry.checkOut)}`
                  : `Checked in at ${String(entry.checkIn)}`}
          </p>
        </div>
        {!loading && !entry && (
          <div className="flex gap-2">
            <select className={`${inputClasses} w-36`} value={mode} onChange={(e) => setMode(e.target.value)} aria-label="Work mode">
              <option value="office">Office</option>
              <option value="remote">Remote</option>
              <option value="client_site">Client site</option>
            </select>
            <Button onClick={checkIn} disabled={busy}><LogIn className="size-4" /> Check in</Button>
          </div>
        )}
        {!loading && entry && !entry.checkOut && (
          <Button onClick={checkOut} disabled={busy}><LogOut className="size-4" /> Check out</Button>
        )}
      </div>
    </Card>
  );
}
