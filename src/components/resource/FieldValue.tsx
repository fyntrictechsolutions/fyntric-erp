import { Badge } from "@/components/ui/Badge";
import type { FieldDefinition } from "@/config/modules";
import { formatCurrency, formatDate } from "@/lib/format";
import type { BaseRecord } from "@/types";

/** Shows one field of a record the way it should read in a table or detail view. */
export function FieldValue({ field, record }: { field: FieldDefinition; record: BaseRecord }) {
  const value = record[field.name];
  const empty = <span className="text-subtle">—</span>;

  switch (field.type) {
    case "select": {
      if (!value) return empty;
      const opt = field.options?.find((o) => o.value === value);
      return <Badge tone={opt?.tone}>{opt?.label ?? String(value)}</Badge>;
    }
    case "reference":
      return record[`${field.name}Label`] ? <>{String(record[`${field.name}Label`])}</> : empty;
    case "currency":
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
      return value ? <span className="line-clamp-2">{String(value)}</span> : empty;
  }
}
