import { useSyncExternalStore } from "react";
import {
  cancelScheduledFlush,
  scheduleHarnessFlush,
  type ScheduledFlush,
} from "../../../app/model/harnessFlush";
import { applyHarnessEvents } from "../../../integrations/harness/core/apply";
import type { HarnessEvent } from "../../../integrations/harness/core/types";
import { syncDockBadge } from "../../notifications/model/dockBadge";
import type { Session } from "./session";

/**
 * Live session state for one window. Closures only, no class, so every method
 * can be passed around unbound. Creating a store has no side effects.
 */
export function createLiveSessionStore(initial: Session[]) {
  let snapshot = initial;
  const listeners = new Set<() => void>();

  function get(): Session[] {
    return snapshot;
  }

  function set(update: Session[] | ((prev: Session[]) => Session[])) {
    const next = typeof update === "function" ? update(snapshot) : update;
    if (next === snapshot) return;
    snapshot = next;
    for (const listener of listeners) listener();
  }

  function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  /** Same shape as the old `sessionsRef`: reads are fresh, writes commit. */
  const ref = {
    get current() {
      return get();
    },
    set current(value: Session[]) {
      set(value);
    },
  };

  const turnGen = { current: new Map<string, number>() };

  // Tokens arrive many times per frame; apply them once so React/markdown aren't
  // recomputed for every delta.
  let harnessQueued = new Map<string, HarnessEvent[]>();
  let harnessFlush: ScheduledFlush | null = null;

  let isForeground: (sessionId: string) => boolean = () => false;

  function flushHarnessEvents() {
    cancelScheduledFlush(harnessFlush);
    harnessFlush = null;
    const batches = harnessQueued;
    if (batches.size === 0) return;
    harnessQueued = new Map();
    const prev = get();
    const next = prev.map((session) => {
      const events = batches.get(session.id);
      return events ? applyHarnessEvents(session, events) : session;
    });
    if (!next.some((session, index) => session !== prev[index])) return;
    syncDockBadge(next);
    set(next);
  }

  function applyApprovalEvent(sessionId: string, event: HarnessEvent) {
    const queued = harnessQueued.get(sessionId) ?? [];
    harnessQueued.delete(sessionId);
    const events = [...queued, event];
    const prev = get();
    const next = prev.map((session) =>
      session.id === sessionId ? applyHarnessEvents(session, events) : session,
    );
    if (!next.some((session, index) => session !== prev[index])) return;
    syncDockBadge(next);
    set(next);
  }

  function enqueueHarnessEvent(sessionId: string, event: HarnessEvent) {
    if (
      event.type === "approval.requested" ||
      event.type === "approval.resolved" ||
      event.type === "question.asked" ||
      event.type === "question.resolved"
    ) {
      applyApprovalEvent(sessionId, event);
      return;
    }
    const queued = harnessQueued;
    const events = queued.get(sessionId);
    if (events) events.push(event);
    else queued.set(sessionId, [event]);
    const foreground = isForeground(sessionId);
    // A visible stream must not wait for a background-only timer.
    if (foreground && harnessFlush?.kind === "timeout") {
      cancelScheduledFlush(harnessFlush);
      harnessFlush = null;
    }
    if (!harnessFlush) {
      harnessFlush = scheduleHarnessFlush(flushHarnessEvents, foreground);
    }
  }

  function setForegroundProbe(next: (sessionId: string) => boolean) {
    isForeground = next;
  }

  function dispose() {
    cancelScheduledFlush(harnessFlush);
    harnessFlush = null;
  }

  return {
    get,
    set,
    subscribe,
    ref,
    turnGen,
    flushHarnessEvents,
    applyApprovalEvent,
    enqueueHarnessEvent,
    setForegroundProbe,
    dispose,
  };
}

export type LiveSessionStore = ReturnType<typeof createLiveSessionStore>;

export function useLiveSessions(store: LiveSessionStore): Session[] {
  return useSyncExternalStore(store.subscribe, store.get);
}
