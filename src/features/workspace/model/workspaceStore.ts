import { useSyncExternalStore, type SetStateAction } from "react";
import { type WorkspaceTab } from "./layout";
import { type RecentProject } from "../../projects/model/recents";
import { type DockSide, type ProjectTerminalDock } from "../../projects/model/projectTerminal";

export type WorkspaceState = {
  tabs: WorkspaceTab[];
  activeTabId: string;
  projectCwd: string;
  recents: RecentProject[];
  projectTerminals: ProjectTerminalDock[];
  /** Dock side a brand-new project's terminal starts with, persisted in the workspace snapshot. */
  lastDockSide: DockSide | null;
  projectTerminalFocused: boolean;
  dirtyFiles: Set<string>;
};

/**
 * Workspace state for one window. Closures only, like the live session store,
 * so the setters and refs can be destructured and called from any closure.
 * Setters apply at once: a read right after a set sees the new value, which
 * React state cannot offer until the next render.
 */
export function createWorkspaceStore(initial: WorkspaceState) {
  let state = initial;
  const listeners = new Set<() => void>();

  function get(): WorkspaceState {
    return state;
  }

  function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  /**
   * A setter shaped like React's, plus a ref with the shape of the old
   * render-assigned refs: reads are fresh, writes commit.
   */
  function field<K extends keyof WorkspaceState>(key: K) {
    type Value = WorkspaceState[K];
    function set(update: SetStateAction<Value>) {
      // No field holds a function, so a function here is always an updater.
      const next =
        typeof update === "function"
          ? (update as (prev: Value) => Value)(state[key])
          : update;
      if (next === state[key]) return;
      state = { ...state, [key]: next };
      for (const listener of listeners) listener();
    }
    const ref = {
      get current(): Value {
        return state[key];
      },
      set current(value: Value) {
        set(value);
      },
    };
    return [set, ref] as const;
  }

  const [setTabs, tabsRef] = field("tabs");
  const [setActiveTabId, activeTabIdRef] = field("activeTabId");
  const [setProjectCwd, projectCwdRef] = field("projectCwd");
  const [setRecents] = field("recents");
  const [setProjectTerminals, projectTerminalsRef] = field("projectTerminals");
  const [setLastDockSide, lastDockSideRef] = field("lastDockSide");
  const [setProjectTerminalFocused, projectTerminalFocusedRef] =
    field("projectTerminalFocused");
  const [setDirtyFiles, dirtyFilesRef] = field("dirtyFiles");

  return {
    get,
    subscribe,
    setTabs,
    tabsRef,
    setActiveTabId,
    activeTabIdRef,
    setProjectCwd,
    projectCwdRef,
    setRecents,
    setProjectTerminals,
    projectTerminalsRef,
    setLastDockSide,
    lastDockSideRef,
    setProjectTerminalFocused,
    projectTerminalFocusedRef,
    setDirtyFiles,
    dirtyFilesRef,
  };
}

export type WorkspaceStore = ReturnType<typeof createWorkspaceStore>;

/** The active tab, falling back to the first tab when the id is unknown. */
export function selectActiveTab(
  state: Pick<WorkspaceState, "tabs" | "activeTabId">,
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
