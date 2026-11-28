import { Check } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import type { FieldDefinition, LineItem } from "@/config/modules";
import { discountsOf, groupedTotals } from "@/lib/lineItems";
import { asList, formatCurrency, formatDate } from "@/lib/format";
import type { BaseRecord } from "@/types";

/** Shows one field of a record the way it should read in a table or detail view. */
export function FieldValue({ field, record }: { field: FieldDefinition; record: BaseRecord }) {
  const value = record[field.name];
  const empty = <span className="text-subtle">—</span>;

  switch (field.type) {
    case "select": {
      if (!value) return empty;
      if (field.list) return <>{String(value)}</>;
      const opt = field.options?.find((o) => o.value === value);
      return <Badge tone={opt?.tone}>{opt?.label ?? String(value)}</Badge>;
    }
    case "multiselect": {
      const list = asList(value);
      return list.length ? <>{list.join(", ")}</> : empty;
    }
    case "checkbox":
      return value ? <Check className="size-4 text-emerald-600" aria-label="Yes" /> : empty;
    case "items":
      return Array.isArray(value) && value.length ? <>{value.length} item{value.length === 1 ? "" : "s"}</> : empty;
    case "references": {
      const names = asList(record[`${field.name}Label`]);
      return names.length ? <>{names.join(", ")}</> : empty;
    }
    case "reference":
      return record[`${field.name}Label`] ? <>{String(record[`${field.name}Label`])}</> : empty;
    case "currency":
      if (field.display === "billingGroups" && Array.isArray(record.items) && record.items.length) {
        // One-time, yearly and monthly charges don't add up to one figure, so show each.
        const groups = groupedTotals(record.items as LineItem[], discountsOf(record));
        if (groups.length > 1 || groups[0]?.key !== "once")
          return (
            <span className="block space-y-0.5 tabular-nums whitespace-nowrap">
              {groups.map((g) => (
                <span key={g.key} className="block">
                  {formatCurrency(g.total)}
                  {g.per && <span className="text-xs text-muted">{g.per}</span>}
                </span>
              ))}
            </span>
          );
      }
      return value === undefined || value === null || value === "" ? empty : <span className="tabular-nums">{formatCurrency(value)}</span>;
    case "date":
      return value ? <span className="whitespace-nowrap">{formatDate(value)}</span> : empty;
    case "percent":
    case "number": {
      if (value === undefined || value === null || value === "") return empty;
      if (field.display === "progress") {
        const pct = Math.max(0, Math.min(100, Number(value)));
        return (
          <span className="flex min-w-24 items-center gap-2">
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-tint-strong">
              <span className="block h-full rounded-full bg-gradient-to-r from-brand-500 to-accent-cyan" style={{ width: `${pct}%` }} />
            </span>
            <span className="w-9 text-right text-xs tabular-nums text-muted">{pct}%</span>
          </span>
        );
      }
      return <span className="tabular-nums">{String(value)}{field.type === "percent" ? "%" : ""}</span>;
    }
    default:
      return value ? <span className="line-clamp-2 whitespace-pre-line">{String(value)}</span> : empty;
  }
}
