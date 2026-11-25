"use client";

import {
  closestCorners,
  DndContext,
  pointerWithin,
  rectIntersection,
  type CollisionDetection,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CalendarDays, Plus, Trash2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useProfile } from "@/components/auth/AuthProvider";
import { friendlyError } from "@/components/resource/RecordEditor";
import { Button } from "@/components/ui/Button";
import { inputClasses, labelClasses } from "@/components/ui/fieldStyles";
import { Modal } from "@/components/ui/Modal";
import { useModuleRecords } from "@/hooks/useCollection";
import { cn } from "@/lib/cn";
import { formatDate, todayISO } from "@/lib/format";
import { addTask, byOrder, deleteTask, moveTask, TASK_COLUMNS, updateTask, type ProjectTask, type TaskStatus } from "@/lib/projectWork";
import type { ProjectWork } from "./ProjectDetail";

type Columns = Record<TaskStatus, ProjectTask[]>;

const COLUMN_IDS = new Set<string>(TASK_COLUMNS.map((c) => c.key));

/** The column (or card) under the pointer; a card wins over the column it's in. Keyboard drags fall back to overlap. */
const collision: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  const pool = hits.length ? hits : rectIntersection(args);
  const card = pool.find((h) => !COLUMN_IDS.has(String(h.id)));
  if (card) return [card];
  return pool.length ? [pool[0]] : closestCorners(args);
};

const group = (tasks: ProjectTask[]): Columns => {
  const cols = Object.fromEntries(TASK_COLUMNS.map((c) => [c.key, [] as ProjectTask[]])) as Columns;
  for (const t of [...tasks].sort(byOrder)) (cols[t.status] ?? cols.todo).push(t);
  return cols;
};

const columnOf = (cols: Columns, id: string): TaskStatus | null => {
  if (id in cols) return id as TaskStatus;
  return (Object.keys(cols) as TaskStatus[]).find((k) => cols[k].some((t) => t.id === id)) ?? null;
};

/**
 * A simple board: To do, In progress, In review, Done. Drag a card to another column to change its status.
 * Admins and project managers add, edit and move every task; others move the tasks assigned to them.
 */
export function TaskBoard({ projectId, manages, tasks, loading }: ProjectWork & { tasks: ProjectTask[]; loading: boolean }) {
  const profile = useProfile();
  const live = useMemo(() => group(tasks), [tasks]);
  // While dragging (and until the move is saved) the board shows this copy instead of the live one.
  const [drag, setDrag] = useState<Columns | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ task: ProjectTask | null; status: TaskStatus } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cols = drag ?? live;
  // A drag ends with a click on the card; don't open it then.
  const dragEndedAt = useRef(0);
  const canMove = (t: ProjectTask) => manages || (Boolean(profile.employeeId) && t.assigneeId === profile.employeeId);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    // On phones, press and hold a card to pick it up, so the board still scrolls normally.
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onStart = (e: DragStartEvent) => {
    setActiveId(String(e.active.id));
    setDrag(live);
    setError(null);
  };

  const onOver = ({ active, over }: DragOverEvent) => {
    if (!over || !drag) return;
    const from = columnOf(drag, String(active.id));
    const to = columnOf(drag, String(over.id));
    if (!from || !to || from === to) return;
    // Moving into another column: take the card out of its column and put it where the pointer is.
    setDrag((c) => {
      if (!c) return c;
      const task = c[from].find((t) => t.id === active.id);
      if (!task) return c;
      const target = c[to];
      const overIndex = target.findIndex((t) => t.id === over.id);
      const at = overIndex < 0 ? target.length : overIndex;
      return { ...c, [from]: c[from].filter((t) => t.id !== active.id), [to]: [...target.slice(0, at), task, ...target.slice(at)] };
    });
  };

  const onEnd = async ({ active, over }: DragEndEvent) => {
    setActiveId(null);
    dragEndedAt.current = Date.now();
    if (!over || !drag) return setDrag(null);
    const id = String(active.id);
    const to = columnOf(drag, String(over.id));
    if (!to) return setDrag(null);
    let next = drag;
    const oldIndex = drag[to].findIndex((t) => t.id === id);
    const newIndex = drag[to].findIndex((t) => t.id === over.id);
    if (oldIndex >= 0 && newIndex >= 0 && oldIndex !== newIndex) next = { ...drag, [to]: arrayMove(drag[to], oldIndex, newIndex) };
    setDrag(next);
    const task = tasks.find((t) => t.id === id);
    try {
      if (manages) await moveTask(projectId, next, id, to);
      // Others only change their own card: its status and place.
      else if (task) await updateTask(projectId, id, { status: to, order: Math.max(0, next[to].findIndex((t) => t.id === id)) });
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setDrag(null);
    }
  };

  const active = activeId ? tasks.find((t) => t.id === activeId) : null;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">
          {manages ? "Drag a card to another column to change its status." : "You can move the tasks assigned to you."}
          <span className="sm:hidden"> On a phone, press and hold a card first.</span>
        </p>
        {manages && (
          <Button onClick={() => setEditor({ task: null, status: "todo" })}>
            <Plus className="size-4" /> Add task
          </Button>
        )}
      </div>
      {error && <p className="mb-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">{error}</p>}

      <DndContext sensors={sensors} collisionDetection={collision} onDragStart={onStart} onDragOver={onOver} onDragEnd={onEnd} onDragCancel={() => (setDrag(null), setActiveId(null))}>
        <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-3 sm:mx-0 sm:px-0 lg:grid lg:grid-cols-4 lg:overflow-visible">
          {TASK_COLUMNS.map((c) => (
            <Column key={c.key} status={c.key} label={c.label} dot={c.dot} tasks={cols[c.key]} loading={loading} onAdd={manages ? () => setEditor({ task: null, status: c.key }) : undefined}>
              {cols[c.key].map((t) => (
                <SortableCard key={t.id} task={t} disabled={!canMove(t)} onOpen={() => Date.now() - dragEndedAt.current > 300 && setEditor({ task: t, status: t.status })} />
              ))}
            </Column>
          ))}
        </div>
        <DragOverlay>{active ? <CardBody task={active} lifted /> : null}</DragOverlay>
      </DndContext>

      {editor && (
        <TaskEditor
          projectId={projectId}
          task={editor.task}
          status={editor.status}
          manages={manages}
          canMove={editor.task ? canMove(editor.task) : manages}
          nextOrder={cols[editor.status].length}
          onClose={() => setEditor(null)}
        />
      )}
    </div>
  );
}

function Column({
  status,
  label,
  dot,
  tasks,
  loading,
  onAdd,
  children,
}: {
  status: TaskStatus;
  label: string;
  dot: string;
  tasks: ProjectTask[];
  loading: boolean;
  onAdd?: () => void;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <section className={cn("flex w-[78vw] max-w-xs shrink-0 snap-start flex-col rounded-2xl border border-line bg-tint p-2.5 sm:w-72 lg:w-auto lg:max-w-none", isOver && "border-brand-500/50")}>
      <header className="mb-2 flex items-center justify-between px-1.5 pt-0.5">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <span className={cn("size-2 rounded-full", dot)} aria-hidden /> {label}
          <span className="text-xs font-normal text-subtle tabular-nums">{tasks.length}</span>
        </h3>
        {onAdd && (
          <button type="button" onClick={onAdd} className="rounded-md p-1 text-subtle hover:bg-tint-strong hover:text-foreground" aria-label={`Add a task to ${label}`}>
            <Plus className="size-4" />
          </button>
        )}
      </header>
      <SortableContext id={status} items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className="flex min-h-24 flex-1 flex-col gap-2">
          {children}
          {!tasks.length && <p className="rounded-xl border border-dashed border-line px-3 py-6 text-center text-xs text-subtle">{loading ? "Loading…" : "Nothing here"}</p>}
        </div>
      </SortableContext>
    </section>
  );
}

function SortableCard({ task, disabled, onOpen }: { task: ProjectTask; disabled: boolean; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id, disabled });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      onClick={onOpen}
      className={cn("touch-manipulation", !disabled && "cursor-grab active:cursor-grabbing", isDragging && "opacity-30")}
    >
      <CardBody task={task} />
    </div>
  );
}

function CardBody({ task, lifted }: { task: ProjectTask; lifted?: boolean }) {
  const overdue = task.dueDate && task.status !== "done" && String(task.dueDate) < todayISO();
  const initials = String(task.assigneeName ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  return (
    <div className={cn("rounded-xl border border-line bg-surface p-3 shadow-sm select-none", lifted && "rotate-1 shadow-lg ring-2 ring-brand-500/40")}>
      <p className={cn("text-sm font-medium break-words text-foreground", task.status === "done" && "text-muted line-through")}>{task.title}</p>
      {task.notes && <p className="mt-1 line-clamp-2 text-xs text-muted">{task.notes}</p>}
      {(task.assigneeName || task.dueDate) && (
        <div className="mt-2.5 flex items-center justify-between gap-2 text-xs">
          {task.dueDate ? (
            <span className={cn("inline-flex items-center gap-1", overdue ? "font-medium text-red-600" : "text-subtle")}>
              <CalendarDays className="size-3.5" aria-hidden /> {formatDate(task.dueDate)}
            </span>
          ) : (
            <span />
          )}
          {task.assigneeName && (
            <span className="inline-flex items-center gap-1.5 text-muted" title={String(task.assigneeName)}>
              <span className="grid size-6 place-items-center rounded-full bg-accent-soft text-[10px] font-semibold text-accent">{initials}</span>
              <span className="max-w-24 truncate">{String(task.assigneeName).split(" ")[0]}</span>
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function TaskEditor({
  projectId,
  task,
  status: initialStatus,
  manages,
  canMove,
  nextOrder,
  onClose,
}: {
  projectId: string;
  task: ProjectTask | null;
  status: TaskStatus;
  manages: boolean;
  canMove: boolean;
  nextOrder: number;
  onClose: () => void;
}) {
  const profile = useProfile();
  const employees = useModuleRecords("employees", profile);
  const people = employees.data.filter((e) => e.status !== "exited").sort((a, b) => String(a.fullName).localeCompare(String(b.fullName)));
  const [title, setTitle] = useState(task?.title ?? "");
  const [notes, setNotes] = useState(task?.notes ?? "");
  const [assigneeId, setAssigneeId] = useState(task?.assigneeId ?? "");
  const [dueDate, setDueDate] = useState(task?.dueDate ?? "");
  const [status, setStatus] = useState<TaskStatus>(task?.status ?? initialStatus);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formId = "task-form";

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const person = people.find((p) => p.id === assigneeId);
      const assigneeName = person ? String(person.fullName ?? "") : assigneeId ? (task?.assigneeName ?? null) : null;
      if (!manages) {
        if (task && status !== task.status) await updateTask(projectId, task.id, { status });
      } else if (task) {
        await updateTask(projectId, task.id, { title: title.trim(), notes: notes.trim(), assigneeId: assigneeId || null, assigneeName, dueDate: dueDate || null, status });
      } else {
        await addTask(projectId, { title, notes, assigneeId: assigneeId || null, assigneeName, dueDate: dueDate || null, status }, nextOrder, profile);
      }
      onClose();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!task || !window.confirm("Delete this task?")) return;
    try {
      await deleteTask(projectId, task.id);
      onClose();
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  const readOnly = !manages;
  return (
    <Modal
      open
      onClose={onClose}
      title={task ? (readOnly ? "Task" : "Edit task") : "New task"}
      footer={
        <>
          {task && manages && (
            <Button variant="ghost" className="mr-auto text-red-600" onClick={remove}>
              <Trash2 className="size-4" /> Delete
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>{readOnly && !canMove ? "Close" : "Cancel"}</Button>
          {(manages || canMove) && (
            <Button type="submit" form={formId} disabled={saving}>
              {saving ? "Saving…" : task ? "Save" : "Add task"}
            </Button>
          )}
        </>
      }
    >
      <form
        id={formId}
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-700 sm:col-span-2 dark:text-red-300">{error}</p>}
        <div className="sm:col-span-2">
          <label htmlFor="task-title" className={labelClasses}>Task<span className="text-red-500"> *</span></label>
          <input id="task-title" required autoFocus={!task} disabled={readOnly} className={inputClasses} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Design the home page" />
        </div>
        <div>
          <label htmlFor="task-assignee" className={labelClasses}>Assigned to</label>
          <select id="task-assignee" disabled={readOnly} className={inputClasses} value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
            <option value="">Nobody yet</option>
            {assigneeId && !people.some((p) => p.id === assigneeId) && <option value={assigneeId}>{task?.assigneeName ?? "(unavailable)"}</option>}
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {String(p.fullName ?? "Employee")}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="task-due" className={labelClasses}>Due date</label>
          <input id="task-due" type="date" disabled={readOnly} className={inputClasses} value={dueDate ?? ""} onChange={(e) => setDueDate(e.target.value)} />
        </div>
        <div>
          <label htmlFor="task-status" className={labelClasses}>Status</label>
          <select id="task-status" disabled={!manages && !canMove} className={inputClasses} value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)}>
            {TASK_COLUMNS.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="task-notes" className={labelClasses}>Details</label>
          <textarea id="task-notes" rows={3} disabled={readOnly} className={inputClasses} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </form>
    </Modal>
  );
}
