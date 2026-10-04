"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, GripVertical } from "lucide-react";
import type { UseReportColumns } from "@/lib/reportColumns/useReportColumns";

// Phase 1.6 Wave B0 - the shared "Tùy chỉnh cột" panel. Show/hide, drag (Pointer Events: mouse, pen and touch), keyboard
// and up/down buttons as the accessible fallback, reset, saving / error state. No Apply button: every change saves.
// Presentation only - it never touches a query, filter, sort, calculation or export.

interface Props {
  /** Result of useReportColumns(reportKey, ctx) for the table this control belongs to. */
  columns: UseReportColumns;
  testId: string;
}

const PANEL_WIDTH = 288;

export default function ColumnManager({ columns: c, testId }: Props) {
  const [open, setOpen] = useState(false);
  const [announce, setAnnounce] = useState("");
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const rowRefs = useRef(new Map<string, HTMLLIElement>());
  const dragRef = useRef<{ key: string; index: number } | null>(null);
  const panelId = useId();

  const close = useCallback((returnFocus: boolean) => {
    if (dragRef.current) c.cancelDrag();
    dragRef.current = null;
    setDragKey(null);
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }, [c]);

  // Fixed positioning clamped to the viewport so the panel always fits (also at 390px wide).
  const place = useCallback(() => {
    const t = triggerRef.current;
    if (!t) return;
    const r = t.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = Math.min(PANEL_WIDTH, vw - 16);
    const left = Math.max(8, Math.min(r.right - width, vw - width - 8));
    const below = vh - r.bottom - 12;
    const above = r.top - 12;
    const flip = below < 220 && above > below;
    const maxHeight = Math.max(160, Math.min(440, flip ? above : below));
    setPos({ left, width, maxHeight, top: flip ? Math.max(8, r.top - 4 - maxHeight) : r.bottom + 4 });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open, place]);

  // Outside click (pointerdown, so touch works) and Escape (window capture: does not also close an enclosing Radix dialog).
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      close(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      e.preventDefault();
      if (dragRef.current) {
        c.cancelDrag();
        dragRef.current = null;
        setDragKey(null);
        return; // first Escape only cancels the drag
      }
      close(true);
    }
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open, close, c]);

  useEffect(() => {
    if (open) panelRef.current?.querySelector<HTMLElement>("[data-first-focus]")?.focus();
  }, [open]);

  function indexAtPointer(clientY: number, draggedKey: string): number {
    let idx = 0;
    for (const row of c.managerRows) {
      if (row.meta.key === draggedKey) continue;
      const el = rowRefs.current.get(row.meta.key);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (clientY > r.top + r.height / 2) idx += 1;
    }
    return idx;
  }

  function onHandlePointerDown(e: React.PointerEvent, key: string, index: number) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // pointer already gone (synthetic event / lost touch): the move/up handlers below still drive the drag
    }
    dragRef.current = { key, index };
    setDragKey(key);
  }

  function onHandlePointerMove(e: React.PointerEvent, key: string) {
    const d = dragRef.current;
    if (!d || d.key !== key) return;
    const list = listRef.current;
    if (list) {
      const r = list.getBoundingClientRect();
      if (e.clientY < r.top + 24) list.scrollTop -= 12;
      else if (e.clientY > r.bottom - 24) list.scrollTop += 12;
    }
    const idx = indexAtPointer(e.clientY, key);
    if (idx !== d.index) {
      d.index = idx;
      c.dragTo(key, idx);
    }
  }

  function endDrag(e: React.PointerEvent, key: string, commit: boolean) {
    const d = dragRef.current;
    if (!d || d.key !== key) return;
    try {
      if (e.currentTarget.hasPointerCapture?.(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // nothing to release
    }
    dragRef.current = null;
    setDragKey(null);
    if (commit) {
      c.commitDrag();
      const label = c.managerRows.find((r) => r.meta.key === key)?.meta.label ?? "";
      setAnnounce(`Đã chuyển cột ${label}`);
    } else c.cancelDrag();
  }

  function move(key: string, delta: -1 | 1) {
    const rows = c.managerRows;
    const from = rows.findIndex((r) => r.meta.key === key);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= rows.length) return;
    c.moveBy(key, delta);
    setAnnounce(`Đã chuyển ${rows[from].meta.label} lên vị trí ${to + 1} trên ${rows.length}`);
    requestAnimationFrame(() => rowRefs.current.get(key)?.querySelector<HTMLElement>("[data-handle]")?.focus());
  }

  const shown = c.managerRows.filter((r) => r.visible).length;
  const status = c.saving ? "Đang lưu…" : c.error === "save" ? "Lưu không thành công" : c.saved ? "Đã lưu" : "";

  return (
    <div className="relative inline-block">
      <button
        ref={triggerRef}
        type="button"
        data-testid={testId}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => (open ? close(true) : setOpen(true))}
        className="inline-flex items-center gap-2 rounded-lg border border-input bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span aria-hidden="true">⚙</span> Tùy chỉnh cột
      </button>

      {open && pos && (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-label="Tùy chỉnh cột"
          data-testid={`${testId}-panel`}
          style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.width, maxHeight: pos.maxHeight }}
          className="z-50 flex flex-col rounded-lg border border-input bg-card shadow-lg"
        >
          <div className="flex items-center justify-between px-3 py-2 border-b border-input text-sm">
            <span className="font-medium text-foreground" data-testid={`${testId}-count`}>
              {shown}/{c.managerRows.length} cột hiển thị
            </span>
            <button
              type="button"
              data-first-focus
              data-testid={`${testId}-close`}
              onClick={() => close(true)}
              className="rounded px-2 py-1 text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Đóng
            </button>
          </div>

          <ul ref={listRef} className="overflow-auto p-1 flex-1" data-testid={`${testId}-list`}>
            {c.managerRows.map((row, i) => {
              const key = row.meta.key;
              return (
                <li
                  key={key}
                  ref={(el) => {
                    if (el) rowRefs.current.set(key, el);
                    else rowRefs.current.delete(key);
                  }}
                  data-testid={`${testId}-row-${key}`}
                  data-column-key={key}
                  className={`flex items-center gap-1 rounded-md px-1 py-1 text-sm ${dragKey === key ? "bg-primary/10 ring-1 ring-primary" : "hover:bg-muted"}`}
                >
                  <button
                    type="button"
                    data-handle
                    data-testid={`${testId}-handle-${key}`}
                    aria-label={`Kéo để đổi vị trí cột ${row.meta.label}. Dùng phím mũi tên lên xuống để di chuyển.`}
                    style={{ touchAction: "none" }}
                    onPointerDown={(e) => onHandlePointerDown(e, key, i)}
                    onPointerMove={(e) => onHandlePointerMove(e, key)}
                    onPointerUp={(e) => endDrag(e, key, true)}
                    onPointerCancel={(e) => endDrag(e, key, false)}
                    onKeyDown={(e) => {
                      if (e.key === "ArrowUp") {
                        e.preventDefault();
                        move(key, -1);
                      } else if (e.key === "ArrowDown") {
                        e.preventDefault();
                        move(key, 1);
                      }
                    }}
                    className="cursor-grab touch-none rounded p-1.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
                  >
                    <GripVertical className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <label className="flex flex-1 min-w-0 items-center gap-2 py-1">
                    <input
                      type="checkbox"
                      data-testid={`${testId}-check-${key}`}
                      checked={row.visible}
                      disabled={row.mandatory}
                      onChange={() => c.toggle(key)}
                      className="accent-primary"
                    />
                    <span className="truncate text-foreground">{row.meta.label}</span>
                    {row.mandatory && <span className="shrink-0 text-xs text-muted-foreground">(bắt buộc)</span>}
                  </label>
                  <button
                    type="button"
                    data-testid={`${testId}-up-${key}`}
                    aria-label={`Chuyển cột ${row.meta.label} lên`}
                    disabled={i === 0}
                    onClick={() => move(key, -1)}
                    className="rounded p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <ChevronUp className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    data-testid={`${testId}-down-${key}`}
                    aria-label={`Chuyển cột ${row.meta.label} xuống`}
                    disabled={i === c.managerRows.length - 1}
                    onClick={() => move(key, 1)}
                    className="rounded p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <ChevronDown className="h-4 w-4" aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="flex items-center justify-between gap-2 px-3 py-2 border-t border-input text-sm">
            <button
              type="button"
              data-testid={`${testId}-reset`}
              disabled={c.isDefault}
              onClick={() => {
                c.reset();
                setAnnounce("Đã đặt lại cột về mặc định");
              }}
              className="rounded px-2 py-1 text-foreground hover:bg-muted disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Đặt lại mặc định
            </button>
            <span role="status" data-testid={`${testId}-status`} className={c.error === "save" ? "text-destructive" : "text-muted-foreground"}>
              {status}
              {c.error === "save" && (
                <button type="button" data-testid={`${testId}-retry`} onClick={c.retry} className="ml-2 underline">
                  Thử lại
                </button>
              )}
            </span>
          </div>
          <div aria-live="polite" className="sr-only" data-testid={`${testId}-live`}>
            {announce}
          </div>
        </div>
      )}
    </div>
  );
}
