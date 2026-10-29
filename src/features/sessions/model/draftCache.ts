/**
 * Composer drafts, keyed by session id.
 *
 * SessionPane keeps the text you are typing in a React ref so retyping while
 * the pane stays mounted does not re-render on every keystroke. A plain ref
 * only lives as long as that one component instance though: closing a
 * session's pane (or moving it to another split) unmounts SessionPane, and
 * the ref - and whatever you had typed - is gone with no warning the moment
 * it remounts.
 *
 * This module-level map survives that, because it lives outside the React
 * tree for as long as the app process is running: the draft comes back when
 * the pane for that session opens again.
 *
 * Draft text is also kept in localStorage, so it survives an app restart or
 * a reload. MCP tags stay in memory only: they are tied to the live picker,
 * and a restored draft without its tag still reads correctly.
 */
import type { McpTag } from "./mcpPicker";

const DRAFTS_KEY = "bonocode.composerDrafts";
const SAVE_DELAY_MS = 400;
/** Longer texts stay in memory for this run only. */
const MAX_STORED_TEXT = 100_000;
const MAX_STORED_DRAFTS = 50;

type StoredDraft = { text: string; at: number };

const drafts = new Map<string, string>();
const draftTimes = new Map<string, number>();
const mcpTags = new Map<string, McpTag[]>();
let hydrated = false;
let pagehideRegistered = false;
let saveTimer: ReturnType<typeof setTimeout> | undefined;

/** Reads the stored drafts once, on first use. Bad JSON or bad entries are ignored. */
function hydrate(): void {
  if (hydrated) return;
  hydrated = true;
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(DRAFTS_KEY) ?? "null");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      for (const [sessionId, entry] of Object.entries(parsed)) {
        if (!entry || typeof entry !== "object") continue;
        const { text, at } = entry as Partial<StoredDraft>;
        if (typeof text !== "string" || !text) continue;
        if (typeof at !== "number" || !Number.isFinite(at)) continue;
        drafts.set(sessionId, text);
        draftTimes.set(sessionId, at);
      }
    }
  } catch {
    // Bad JSON or no storage (private mode): start with an empty draft list.
  }
  if (!pagehideRegistered && typeof window !== "undefined") {
    pagehideRegistered = true;
    window.addEventListener("pagehide", flushComposerDrafts);
  }
}

/** One debounced write covers every draft, so typing does not hit storage per keystroke. */
function scheduleSave(): void {
  if (saveTimer !== undefined) clearTimeout(saveTimer);
  saveTimer = setTimeout(flushComposerDrafts, SAVE_DELAY_MS);
}

/** Writes the drafts now and cancels the pending write. */
export function flushComposerDrafts(): void {
  if (saveTimer !== undefined) {
    clearTimeout(saveTimer);
    saveTimer = undefined;
  }
  // Nothing can have changed until a read or write has hydrated the map.
  if (!hydrated) return;
  const stored: Record<string, StoredDraft> = {};
  const newest = [...drafts]
    .filter(([, text]) => text.length <= MAX_STORED_TEXT)
    .map(([sessionId, text]) => ({
      sessionId,
      text,
      at: draftTimes.get(sessionId) ?? 0,
    }))
    .sort((a, b) => b.at - a.at)
    .slice(0, MAX_STORED_DRAFTS);
  for (const { sessionId, text, at } of newest) {
    stored[sessionId] = { text, at };
  }
  try {
    localStorage.setItem(DRAFTS_KEY, JSON.stringify(stored));
  } catch {
    // private mode / quota
  }
}

export function getComposerDraft(sessionId: string): string | undefined {
  hydrate();
  return drafts.get(sessionId);
}

export function setComposerDraft(sessionId: string, text: string): void {
  hydrate();
  if (text) {
    drafts.set(sessionId, text);
    draftTimes.set(sessionId, Date.now());
  } else {
    drafts.delete(sessionId);
    draftTimes.delete(sessionId);
    mcpTags.delete(sessionId);
  }
  scheduleSave();
}

export function getComposerMcpTags(sessionId: string): McpTag[] {
  return mcpTags.get(sessionId) ?? [];
}

export function setComposerMcpTags(sessionId: string, tags: McpTag[]): void {
  if (tags.length > 0) {
    mcpTags.set(sessionId, tags);
  } else {
    mcpTags.delete(sessionId);
  }
}

export function clearComposerDraft(sessionId: string): void {
  hydrate();
  drafts.delete(sessionId);
  draftTimes.delete(sessionId);
  mcpTags.delete(sessionId);
  scheduleSave();
}

/**
 * Tests only. Clears the in-memory drafts, the pending write and the hydrated
 * flag so the next read comes from storage. Storage itself is left alone.
 */
export function resetComposerDraftsForTests(): void {
  drafts.clear();
  draftTimes.clear();
  mcpTags.clear();
  if (saveTimer !== undefined) clearTimeout(saveTimer);
  saveTimer = undefined;
  hydrated = false;
}
