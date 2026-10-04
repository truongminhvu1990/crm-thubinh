// Phase 1.6 Wave B0 - client-side preference store (framework free, unit-tested with an injected fetch).
//
// One entry per report key. A store instance belongs to one signed-in user (the provider clears it when the auth user
// changes), so preferences are never shared across users. Changing a column preference only talks to
// /api/report-preferences - it never triggers a business-data request.
//
// Save model: the visible toggle and reset save immediately; keyboard moves are debounced; a drag updates locally while
// the pointer moves and saves once on drop (commitPreview). At most one request is in flight; changes made meanwhile
// are coalesced into one follow-up request. The server response is authoritative. A failed save rolls the UI back to
// the last server-confirmed state and exposes error = "save" with retry().

export interface Stored {
  visible: string[] | null;
  order: string[] | null;
}

export interface Entry {
  confirmed: Stored;
  working: Stored;
  loaded: boolean;
  loading: boolean;
  saving: boolean;
  saved: boolean;
  error: null | "load" | "save";
}

export const NO_PREFERENCE: Stored = { visible: null, order: null };
export const EMPTY_ENTRY: Entry = {
  confirmed: NO_PREFERENCE,
  working: NO_PREFERENCE,
  loaded: false,
  loading: false,
  saving: false,
  saved: false,
  error: null,
};

export const DRAG_DEBOUNCE_MS = 400;

type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

interface Internal {
  pending: Stored | null;
  inflight: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  previewBase: Stored | null;
  lastFailed: Stored | null;
}

const isEmpty = (s: Stored) => s.visible === null && s.order === null;

export class PreferenceStore {
  private entries = new Map<string, Entry>();
  private internals = new Map<string, Internal>();
  private listeners = new Set<() => void>();

  constructor(private readonly fetchFn: FetchFn = (input, init) => fetch(input, init)) {}

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  get(key: string): Entry {
    return this.entries.get(key) ?? EMPTY_ENTRY;
  }

  clear() {
    for (const i of this.internals.values()) if (i.timer) clearTimeout(i.timer);
    this.entries.clear();
    this.internals.clear();
    this.notify();
  }

  private notify() {
    for (const l of this.listeners) l();
  }

  private patch(key: string, p: Partial<Entry>) {
    this.entries.set(key, { ...this.get(key), ...p });
    this.notify();
  }

  private internal(key: string): Internal {
    let i = this.internals.get(key);
    if (!i) {
      i = { pending: null, inflight: false, timer: null, previewBase: null, lastFailed: null };
      this.internals.set(key, i);
    }
    return i;
  }

  /** One GET per key per store; concurrent callers share it. */
  async load(key: string): Promise<void> {
    const e = this.get(key);
    if (e.loaded || e.loading) return;
    this.patch(key, { loading: true });
    try {
      const res = await this.fetchFn(`/api/report-preferences?reportKey=${encodeURIComponent(key)}`);
      if (!res.ok) throw new Error(`load ${res.status}`);
      const data = (await res.json()) as { preference: { visibleColumns: string[]; columnOrder: string[] | null } | null };
      const stored: Stored = data.preference ? { visible: data.preference.visibleColumns, order: data.preference.columnOrder ?? null } : NO_PREFERENCE;
      // an edit made while loading wins over the loaded value
      const keepWorking = this.internal(key).pending !== null;
      this.patch(key, { confirmed: stored, working: keepWorking ? this.get(key).working : stored, loaded: true, loading: false });
    } catch {
      // never blocks the report: registry defaults stay in effect
      this.patch(key, { loaded: true, loading: false, error: "load" });
    }
  }

  /** Apply a change. "now" saves immediately, "debounce" after DRAG_DEBOUNCE_MS, "preview" only updates locally (drag in progress). */
  set(key: string, next: Stored, mode: "now" | "debounce" | "preview") {
    const i = this.internal(key);
    if (mode === "preview" && !i.previewBase) i.previewBase = this.get(key).working;
    if (mode !== "preview") i.previewBase = null;
    i.pending = next;
    this.patch(key, { working: next, saved: false, error: this.get(key).error === "load" ? "load" : null });
    if (mode === "now") void this.flush(key);
    else if (mode === "debounce") {
      if (i.timer) clearTimeout(i.timer);
      i.timer = setTimeout(() => void this.flush(key), DRAG_DEBOUNCE_MS);
    }
  }

  /** Drop pressed Escape: restore the order from before the drag started. */
  cancelPreview(key: string) {
    const i = this.internal(key);
    if (!i.previewBase) return;
    const base = i.previewBase;
    i.previewBase = null;
    i.pending = null;
    this.patch(key, { working: base });
  }

  /** Drop: persist the previewed state once. */
  commitPreview(key: string) {
    const i = this.internal(key);
    i.previewBase = null;
    if (i.pending) void this.flush(key);
  }

  retry(key: string) {
    const i = this.internal(key);
    if (i.lastFailed) this.set(key, i.lastFailed, "now");
  }

  async flush(key: string): Promise<void> {
    const i = this.internal(key);
    if (i.timer) {
      clearTimeout(i.timer);
      i.timer = null;
    }
    if (i.inflight || !i.pending) return; // an in-flight save re-checks `pending` when it finishes
    i.inflight = true;
    const body = i.pending;
    i.pending = null;
    this.patch(key, { saving: true });
    try {
      let res: Response;
      if (isEmpty(body)) {
        res = await this.fetchFn(`/api/report-preferences?reportKey=${encodeURIComponent(key)}`, { method: "DELETE" });
      } else {
        res = await this.fetchFn("/api/report-preferences", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reportKey: key, visibleColumns: body.visible ?? [], columnOrder: body.order }),
        });
      }
      if (!res.ok) throw new Error(`save ${res.status}`);
      const data = (await res.json()) as { preference: { visibleColumns: string[]; columnOrder: string[] | null } | null };
      const confirmed: Stored = data.preference ? { visible: data.preference.visibleColumns, order: data.preference.columnOrder ?? null } : NO_PREFERENCE;
      i.lastFailed = null;
      // server is authoritative, unless the user already changed something newer
      this.patch(key, { confirmed, working: i.pending ? this.get(key).working : confirmed, saved: true });
    } catch {
      i.lastFailed = body;
      i.pending = null;
      this.patch(key, { working: this.get(key).confirmed, error: "save", saved: false });
    } finally {
      i.inflight = false;
      this.patch(key, { saving: false });
      if (i.pending && !i.timer && !i.previewBase) void this.flush(key);
    }
  }
}
