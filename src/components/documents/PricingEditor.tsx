"use client";

import { ArrowDown, ArrowUp, Heading, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { inputClasses, labelClasses } from "@/components/ui/fieldStyles";
import { cn } from "@/lib/cn";
import { formatCurrency } from "@/lib/format";
import { blockHours, blockTotal, NEW_SERVICE_BLOCK, type CostBlock, type CostRow, type Milestone } from "@/lib/salesDocs";

const iconButton = "rounded p-1 text-subtle hover:text-foreground disabled:opacity-30";

/** Payment milestones as label + percentage rows. */
export function MilestonesEditor({ value, onChange, idPrefix = "ms", base }: { value: Milestone[]; onChange: (v: Milestone[]) => void; idPrefix?: string; base?: number | null }) {
  const sum = value.reduce((t, m) => t + (Number(m.percent) || 0), 0);
  const set = (i: number, patch: Partial<Milestone>) => onChange(value.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  return (
    <div>
      <div className="space-y-2">
        {value.map((m, i) => (
          <div key={i} className="flex items-center gap-2">
            <input className={inputClasses} value={m.label} onChange={(e) => set(i, { label: e.target.value })} placeholder="Milestone" aria-label={`${idPrefix} milestone ${i + 1}`} />
            <div className="relative w-24 shrink-0">
              <input type="number" min={0} max={100} className={cn(inputClasses, "pr-6")} value={m.percent} onChange={(e) => set(i, { percent: Number(e.target.value) })} aria-label={`${idPrefix} milestone ${i + 1} percent`} />
              <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-sm text-subtle">%</span>
            </div>
            {base !== undefined && base !== null && <span className="hidden w-24 shrink-0 text-right text-xs text-subtle tabular-nums sm:block">{formatCurrency(Math.round((base * (Number(m.percent) || 0)) / 100))}</span>}
            <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))} className={cn(iconButton, "hover:text-red-600")} aria-label="Remove milestone"><Trash2 className="size-4" /></button>
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-3">
        <Button variant="secondary" size="sm" onClick={() => onChange([...value, { label: "", percent: 0 }])}><Plus className="size-4" /> Add milestone</Button>
        <span className={cn("text-xs", sum === 100 ? "text-subtle" : "text-amber-600")}>Total {sum}%{sum === 100 ? "" : " (should be 100%)"}</span>
      </div>
    </div>
  );
}

/**
 * Hourly pricing: the development block plus any separate services, each with its rate, task-wise hours
 * (with group headings such as "A. Project management") and its own payment milestones.
 */
export function CostBlocksEditor({ value, onChange }: { value: CostBlock[]; onChange: (v: CostBlock[]) => void }) {
  const setBlock = (bi: number, patch: Partial<CostBlock>) => onChange(value.map((b, j) => (j === bi ? { ...b, ...patch } : b)));
  const setRows = (bi: number, rows: CostRow[]) => setBlock(bi, { rows });
  const grand = value.reduce((t, b) => t + blockTotal(b), 0);
  return (
    <div className="space-y-4">
      {value.map((b, bi) => {
        const rows = b.rows;
        const setRow = (ri: number, patch: Partial<CostRow>) => setRows(bi, rows.map((r, j) => (j === ri ? { ...r, ...patch } : r)));
        const move = (ri: number, by: number) => {
          const next = [...rows];
          const [r] = next.splice(ri, 1);
          next.splice(Math.max(0, Math.min(next.length, ri + by)), 0, r);
          setRows(bi, next);
        };
        return (
          <div key={bi} className="rounded-xl border border-line p-3 sm:p-4">
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_8rem]">
              <div>
                <label className={labelClasses} htmlFor={`cb-title-${bi}`}>{bi === 0 ? "Main work" : "Separate service"}</label>
                <input id={`cb-title-${bi}`} className={inputClasses} value={b.title} onChange={(e) => setBlock(bi, { title: e.target.value })} placeholder="Development" />
              </div>
              <div>
                <label className={labelClasses} htmlFor={`cb-sum-${bi}`}>In the summary as</label>
                <input id={`cb-sum-${bi}`} className={inputClasses} value={b.summary} onChange={(e) => setBlock(bi, { summary: e.target.value })} placeholder="Development, branding and AI features" />
              </div>
              <div>
                <label className={labelClasses} htmlFor={`cb-rate-${bi}`}>Rate / hour (₹)</label>
                <input id={`cb-rate-${bi}`} type="number" min={0} className={inputClasses} value={b.rate} onChange={(e) => setBlock(bi, { rate: Number(e.target.value) })} />
              </div>
            </div>

            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[34rem] text-sm">
                <thead>
                  <tr className="text-left text-xs text-subtle">
                    <th className="pb-1 font-medium">Task</th>
                    <th className="w-20 pb-1 font-medium">Hours</th>
                    <th className="w-24 pb-1 font-medium">Own rate</th>
                    <th className="w-24 pb-1 text-right font-medium">Amount</th>
                    <th className="w-24" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, ri) => {
                    const rate = r.rate !== undefined && r.rate !== null ? Number(r.rate) : Number(b.rate) || 0;
                    return (
                      <tr key={ri} className="align-middle">
                        <td className="py-1 pr-2" colSpan={r.heading ? 4 : 1}>
                          <input
                            className={cn(inputClasses, r.heading && "font-semibold text-accent")}
                            value={r.task}
                            onChange={(e) => setRow(ri, { task: e.target.value })}
                            placeholder={r.heading ? "Group heading, e.g. A. Project management" : "Task"}
                            aria-label={`${r.heading ? "Group" : "Task"} ${ri + 1}`}
                          />
                        </td>
                        {!r.heading && (
                          <>
                            <td className="py-1 pr-2">
                              <input type="number" min={0} className={inputClasses} value={r.hours ?? ""} onChange={(e) => setRow(ri, { hours: e.target.value === "" ? 0 : Number(e.target.value) })} aria-label={`Hours for task ${ri + 1}`} />
                            </td>
                            <td className="py-1 pr-2">
                              <input type="number" min={0} className={inputClasses} value={r.rate ?? ""} placeholder={String(b.rate)} onChange={(e) => setRow(ri, { rate: e.target.value === "" ? null : Number(e.target.value) })} aria-label={`Own rate for task ${ri + 1}`} />
                            </td>
                            <td className="py-1 pr-2 text-right text-foreground tabular-nums">{formatCurrency((Number(r.hours) || 0) * rate)}</td>
                          </>
                        )}
                        <td className="py-1 whitespace-nowrap">
                          <button type="button" className={iconButton} onClick={() => move(ri, -1)} disabled={ri === 0} aria-label="Move up"><ArrowUp className="size-4" /></button>
                          <button type="button" className={iconButton} onClick={() => move(ri, 1)} disabled={ri === rows.length - 1} aria-label="Move down"><ArrowDown className="size-4" /></button>
                          <button type="button" className={cn(iconButton, "hover:text-red-600")} onClick={() => setRows(bi, rows.filter((_, j) => j !== ri))} aria-label="Remove row"><Trash2 className="size-4" /></button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button variant="secondary" size="sm" onClick={() => setRows(bi, [...rows, { task: "", hours: 0 }])}><Plus className="size-4" /> Add task</Button>
              <Button variant="secondary" size="sm" onClick={() => setRows(bi, [...rows, { task: "", heading: true }])}><Heading className="size-4" /> Add group heading</Button>
              <span className="ml-auto text-sm text-foreground tabular-nums">
                {blockHours(b)} hours · <strong>{formatCurrency(blockTotal(b))}</strong>
              </span>
            </div>

            <div className="mt-4">
              <p className={labelClasses}>Payment milestones for this part</p>
              <MilestonesEditor idPrefix={`Part ${bi + 1}`} value={b.milestones ?? []} onChange={(milestones) => setBlock(bi, { milestones })} base={blockTotal(b)} />
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-sm text-body">
                <input type="checkbox" className="size-4 accent-brand-600" checked={b.amc} onChange={(e) => setBlock(bi, { amc: e.target.checked })} />
                Counts towards the AMC
              </label>
              {bi > 0 && (
                <Button variant="ghost" size="sm" className="text-red-600" onClick={() => onChange(value.filter((_, j) => j !== bi))}>
                  <Trash2 className="size-4" /> Remove this service
                </Button>
              )}
            </div>
          </div>
        );
      })}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="secondary" size="sm" onClick={() => onChange([...value, structuredClone(NEW_SERVICE_BLOCK)])}>
          <Plus className="size-4" /> Add separate service (e.g. data upload)
        </Button>
        <span className="text-sm text-foreground">
          Total project cost <strong className="tabular-nums">{formatCurrency(grand)}</strong>
        </span>
      </div>
    </div>
  );
}
