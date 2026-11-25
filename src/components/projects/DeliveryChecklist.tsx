"use client";

import { closestCenter, DndContext, KeyboardSensor, MouseSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Check, GripVertical, Pencil, Plus, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useProfile } from "@/components/auth/AuthProvider";
import { friendlyError } from "@/components/resource/RecordEditor";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { inputClasses } from "@/components/ui/fieldStyles";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";
import { addChecklistItem, byOrder, deleteChecklistItem, reorderChecklist, setChecklistDone, updateChecklistText, type ChecklistEntry } from "@/lib/projectWork";
import type { ProjectWork } from "./ProjectDetail";

/** What must be in place before handing over: tick items off, drag the handle to reorder. */
export function DeliveryChecklist({ projectId, manages, items, loading }: ProjectWork & { items: ChecklistEntry[]; loading: boolean }) {
  const profile = useProfile();
  const live = useMemo(() => [...items].sort(byOrder), [items]);
  // Shown while a reorder is being saved, so the list doesn't jump back.
  const [pending, setPending] = useState<ChecklistEntry[] | null>(null);
  const list = pending ?? live;
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const done = list.filter((i) => i.done).length;

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = text.trim();
    if (!value) return;
    setText("");
    await run(() => addChecklistItem(projectId, value, list.length ? Math.max(...list.map((i) => Number(i.order) || 0)) + 1 : 0, profile));
  };

  const onEnd = async ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = list.findIndex((i) => i.id === active.id);
    const to = list.findIndex((i) => i.id === over.id);
    const next = arrayMove(list, from, to);
    setPending(next);
    await run(() => reorderChecklist(projectId, next));
    setPending(null);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Count label="Total items" value={list.length} />
        <Count label="Done" value={done} tone="text-emerald-600 dark:text-emerald-400" />
        <Count label="Pending" value={list.length - done} tone={list.length - done ? "text-amber-600 dark:text-amber-400" : undefined} />
      </div>

      <Card className="overflow-hidden">
        {list.length > 0 && (
          <div className="h-1 bg-tint-strong">
            <div className="h-full bg-emerald-500 transition-all" style={{ width: `${(done / list.length) * 100}%` }} />
          </div>
        )}
        {error && <p className="m-4 mb-0 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">{error}</p>}

        {loading && !list.length ? (
          <p className="px-5 py-8 text-center text-sm text-muted">Loading…</p>
        ) : !list.length ? (
          <p className="px-5 py-8 text-center text-sm text-muted">{manages ? "No items yet. Add the first one below." : "No items yet."}</p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[restrictToVerticalAxis]} onDragEnd={onEnd}>
            <SortableContext items={list.map((i) => i.id)} strategy={verticalListSortingStrategy}>
              <ul className="divide-y divide-line">
                {list.map((i) => (
                  <Row
                    key={i.id}
                    item={i}
                    manages={manages}
                    onToggle={(v) => run(() => setChecklistDone(projectId, i.id, v, profile))}
                    onSave={(v) => run(() => updateChecklistText(projectId, i.id, v))}
                    onDelete={() => window.confirm("Delete this item?") && run(() => deleteChecklistItem(projectId, i.id))}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        )}

        {manages && (
          <form onSubmit={add} className="flex gap-2 border-t border-line p-3">
            <input className={inputClasses} value={text} onChange={(e) => setText(e.target.value)} placeholder="Add an item, e.g. Admin login handed over" aria-label="New checklist item" />
            <Button type="submit" disabled={!text.trim()}>
              <Plus className="size-4" /> Add
            </Button>
          </form>
        )}
      </Card>
      {manages && list.length > 1 && <p className="text-xs text-subtle">Drag the ⋮⋮ handle to change the order. On a phone, press and hold it first.</p>}
    </div>
  );
}

function Count({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <Card className="p-3 text-center sm:p-4">
      <p className={cn("font-display text-2xl font-semibold tabular-nums text-foreground", tone)}>{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </Card>
  );
}

function Row({
  item,
  manages,
  onToggle,
  onSave,
  onDelete,
}: {
  item: ChecklistEntry;
  manages: boolean;
  onToggle: (done: boolean) => Promise<unknown>;
  onSave: (text: string) => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: item.id, disabled: !manages });
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(item.text);
  // Ticks show at once; the saved value takes over when the save finishes.
  const [ticking, setTicking] = useState<boolean | null>(null);
  const checked = ticking ?? item.done;

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("group flex items-start gap-2 bg-surface px-3 py-2.5 sm:px-4", isDragging && "relative z-10 shadow-lg ring-1 ring-brand-500/30")}
    >
      {manages && (
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          className="mt-0.5 -ml-1 cursor-grab touch-none rounded p-1 text-subtle hover:text-foreground active:cursor-grabbing"
          aria-label={`Move ${item.text}`}
        >
          <GripVertical className="size-4" />
        </button>
      )}
      <input
        type="checkbox"
        checked={checked}
        disabled={!manages}
        onChange={(e) => {
          const v = e.target.checked;
          setTicking(v);
          void onToggle(v).finally(() => setTicking(null));
        }}
        className="mt-1 size-4.5 shrink-0 cursor-pointer accent-emerald-600 disabled:cursor-default"
        aria-label={item.text}
      />
      {editing ? (
        <form
          className="flex flex-1 gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim()) onSave(text);
            setEditing(false);
          }}
        >
          <input autoFocus className={cn(inputClasses, "h-8 py-1")} value={text} onChange={(e) => setText(e.target.value)} />
          <button type="submit" className="rounded p-1 text-emerald-600" aria-label="Save">
            <Check className="size-4" />
          </button>
          <button type="button" onClick={() => (setText(item.text), setEditing(false))} className="rounded p-1 text-subtle" aria-label="Cancel">
            <X className="size-4" />
          </button>
        </form>
      ) : (
        <div className="min-w-0 flex-1 pt-0.5">
          <p className={cn("text-sm break-words text-foreground", checked && "text-muted line-through")}>{item.text}</p>
          {item.done && item.doneBy && <p className="text-xs text-subtle">Done by {item.doneBy}{item.doneAt ? ` · ${formatDate(Number(item.doneAt))}` : ""}</p>}
        </div>
      )}
      {manages && !editing && (
        <div className="flex shrink-0 opacity-60 group-hover:opacity-100">
          <button type="button" onClick={() => setEditing(true)} className="rounded p-1 text-subtle hover:text-foreground" aria-label="Edit">
            <Pencil className="size-3.5" />
          </button>
          <button type="button" onClick={onDelete} className="rounded p-1 text-subtle hover:text-red-600" aria-label="Delete">
            <Trash2 className="size-3.5" />
          </button>
        </div>
      )}
    </li>
  );
}
