import { describe, expect, it, vi } from "vitest";
import { newTab, type WorkspaceTab } from "./layout";
import { createWorkspaceStore, selectActiveTab, type WorkspaceState } from "./workspaceStore";
import { DEFAULT_CHANGES_DOCK } from "./dockLayout";

function tab(): WorkspaceTab {
  return newTab(crypto.randomUUID());
}

function state(overrides: Partial<WorkspaceState> = {}): WorkspaceState {
  return {
    tabs: [],
    activeTabId: "",
    projectCwd: "~",
    recents: [],
    projectTerminals: [],
    lastDockSide: null,
    projectTerminalFocused: false,
    dirtyFiles: new Set(),
    changesDock: DEFAULT_CHANGES_DOCK,
    ...overrides,
  };
}

describe("createWorkspaceStore", () => {
  it("applies a value set and an updater set immediately", () => {
    const a = tab();
    const b = tab();
    const store = createWorkspaceStore(state({ tabs: [a], activeTabId: a.id }));

    store.setTabs([a, b]);
    expect(store.get().tabs).toEqual([a, b]);

    store.setActiveTabId((prev) => (prev === a.id ? b.id : a.id));
    expect(store.get().activeTabId).toBe(b.id);
  });

  it("gives an updater the latest state after an earlier set in the same tick", () => {
    const store = createWorkspaceStore(state({ tabs: [], activeTabId: "a" }));

    store.setActiveTabId("b");
    store.setActiveTabId((prev) => `${prev}!`);

    expect(store.get().activeTabId).toBe("b!");
  });

  it("does not notify when a set leaves the value unchanged", () => {
    const a = tab();
    const store = createWorkspaceStore(state({ tabs: [a], activeTabId: a.id }));
    const listener = vi.fn();
    store.subscribe(listener);

    store.setTabs(store.get().tabs);
    store.setActiveTabId(a.id);
    expect(listener).not.toHaveBeenCalled();

    store.setActiveTabId("other");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("keeps the refs fresh right after a set", () => {
    const a = tab();
    const b = tab();
    const store = createWorkspaceStore(state({ tabs: [a], activeTabId: a.id }));

    store.tabsRef.current = [a, b];
    expect(store.tabsRef.current).toEqual([a, b]);

    store.setTabs((prev) => prev.slice(1));
    expect(store.tabsRef.current).toEqual([b]);

    store.activeTabIdRef.current = b.id;
    expect(store.activeTabIdRef.current).toBe(b.id);
  });
});

describe("createWorkspaceStore fields", () => {
  it("applies each field's value and updater sets and keeps its ref fresh", () => {
    const store = createWorkspaceStore(state());

    store.setProjectCwd("/work/alpha");
    expect(store.projectCwdRef.current).toBe("/work/alpha");
    store.projectCwdRef.current = "/work/beta";
    expect(store.get().projectCwd).toBe("/work/beta");

    const recent = { path: "/work/beta", openedAt: 1 };
    store.setRecents((prev) => [recent, ...prev]);
    expect(store.get().recents).toEqual([recent]);

    store.setLastDockSide("right");
    expect(store.lastDockSideRef.current).toBe("right");

    store.setProjectTerminalFocused((prev) => !prev);
    expect(store.projectTerminalFocusedRef.current).toBe(true);

    store.setDirtyFiles((prev) => new Set([...prev, "file-1"]));
    expect([...store.dirtyFilesRef.current]).toEqual(["file-1"]);

    store.projectTerminalsRef.current = [];
    expect(store.get().projectTerminals).toEqual([]);
  });

  it("notifies once per change and skips unchanged values on every field", () => {
    const dirty = new Set<string>();
    const store = createWorkspaceStore(state({ dirtyFiles: dirty }));
    const listener = vi.fn();
    store.subscribe(listener);

    store.setProjectCwd("~");
    store.setLastDockSide(null);
    store.setProjectTerminalFocused(false);
    store.setDirtyFiles((prev) => prev);
    store.setRecents(store.get().recents);
    expect(listener).not.toHaveBeenCalled();

    store.setProjectCwd("/work/alpha");
    store.setDirtyFiles(new Set(["a"]));
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("leaves the other fields untouched when one changes", () => {
    const a = tab();
    const store = createWorkspaceStore(state({ tabs: [a], activeTabId: a.id }));
    const before = store.get();

    store.setProjectCwd("/work/alpha");

    const after = store.get();
    expect(after).not.toBe(before);
    expect(after.tabs).toBe(before.tabs);
    expect(after.dirtyFiles).toBe(before.dirtyFiles);
    expect(after.activeTabId).toBe(a.id);
  });
});

describe("selectActiveTab", () => {
  it("returns the tab whose id is active", () => {
    const a = tab();
    const b = tab();
    expect(selectActiveTab({ tabs: [a, b], activeTabId: b.id })).toBe(b);
  });

  it("falls back to the first tab when the active id is unknown", () => {
    const a = tab();
    const b = tab();
    expect(selectActiveTab({ tabs: [a, b], activeTabId: "missing" })).toBe(a);
  });
});
