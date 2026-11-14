"use client";

import { useMemo } from "react";
import type { BaseRecord } from "@/types";
import { useRecordsWhere } from "./useCollection";

/** Records of one person: matched on the employee link, and on their login account when it's known. */
export function usePersonRecords(module: "attendance" | "leave", employeeId: string, accountId: string | null) {
  const byEmployee = useRecordsWhere(module, "employeeId", employeeId);
  const byAccount = useRecordsWhere(module, "userId", accountId);
  const data = useMemo(() => {
    const seen = new Map<string, BaseRecord>();
    for (const r of [...byEmployee.data, ...byAccount.data]) seen.set(r.id, r);
    return [...seen.values()];
  }, [byEmployee.data, byAccount.data]);
  return { data, loading: byEmployee.loading || byAccount.loading, error: byEmployee.error ?? byAccount.error };
}

