import { useSyncExternalStore, type SetStateAction } from "react";
import { type WorkspaceTab } from "./layout";

export type WorkspaceState = {
  tabs: WorkspaceTab[];
  activeTabId: string;
};

/**
 * Tabs and the active tab id for one window. Closures only, like the live
 * session store, so the setters and refs can be destructured and called from
 * any closure. Setters apply at once: a read right after a set sees the new
 * value, which React state cannot offer until the next render.
 */
export function createWorkspaceStore(initial: WorkspaceState) {
  let state = initial;
  const listeners = new Set<() => void>();

  function get(): WorkspaceState {
    return state;
  }

  function commit(next: WorkspaceState) {
    state = next;
    for (const listener of listeners) listener();
  }

  function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  function setTabs(update: SetStateAction<WorkspaceTab[]>) {
    const next = typeof update === "function" ? update(state.tabs) : update;
    if (next === state.tabs) return;
    commit({ ...state, tabs: next });
  }

  function setActiveTabId(update: SetStateAction<string>) {
    const next =
      typeof update === "function" ? update(state.activeTabId) : update;
    if (next === state.activeTabId) return;
    commit({ ...state, activeTabId: next });
  }

  /** Same shape as the old render-assigned refs: reads are fresh, writes commit. */
  const tabsRef = {
    get current() {
      return state.tabs;
    },
    set current(value: WorkspaceTab[]) {
      setTabs(value);
    },
  };

  const activeTabIdRef = {
    get current() {
      return state.activeTabId;
    },
    set current(value: string) {
      setActiveTabId(value);
    },
  };

  return {
    get,
    subscribe,
    setTabs,
    setActiveTabId,
    tabsRef,
    activeTabIdRef,
  };
}

export type WorkspaceStore = ReturnType<typeof createWorkspaceStore>;

/** The active tab, falling back to the first tab when the id is unknown. */
export function selectActiveTab(
  state: WorkspaceState,
): WorkspaceTab | undefined {
  return state.tabs.find((t) => t.id === state.activeTabId) ?? state.tabs[0];
}

/**
 * Reads one slice of the store during render. Selectors must return existing
 * references (never a fresh array or object), or every render would loop.
 */
export function useWorkspaceStore<T>(
  store: WorkspaceStore,
  selector: (state: WorkspaceState) => T,
): T {
  return useSyncExternalStore(store.subscribe, () => selector(store.get()));
}
