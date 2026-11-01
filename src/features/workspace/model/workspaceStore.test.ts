import { describe, expect, it, vi } from "vitest";
import { newTab, type WorkspaceTab } from "./layout";
import { createWorkspaceStore, selectActiveTab } from "./workspaceStore";

function tab(): WorkspaceTab {
  return newTab(crypto.randomUUID());
}

describe("createWorkspaceStore", () => {
  it("applies a value set and an updater set immediately", () => {
    const a = tab();
    const b = tab();
    const store = createWorkspaceStore({ tabs: [a], activeTabId: a.id });

    store.setTabs([a, b]);
    expect(store.get().tabs).toEqual([a, b]);

    store.setActiveTabId((prev) => (prev === a.id ? b.id : a.id));
    expect(store.get().activeTabId).toBe(b.id);
  });

  it("gives an updater the latest state after an earlier set in the same tick", () => {
    const store = createWorkspaceStore({ tabs: [], activeTabId: "a" });

    store.setActiveTabId("b");
    store.setActiveTabId((prev) => `${prev}!`);

    expect(store.get().activeTabId).toBe("b!");
  });

  it("does not notify when a set leaves the value unchanged", () => {
    const a = tab();
    const store = createWorkspaceStore({ tabs: [a], activeTabId: a.id });
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
    const store = createWorkspaceStore({ tabs: [a], activeTabId: a.id });

    store.tabsRef.current = [a, b];
    expect(store.tabsRef.current).toEqual([a, b]);

    store.setTabs((prev) => prev.slice(1));
    expect(store.tabsRef.current).toEqual([b]);

    store.activeTabIdRef.current = b.id;
    expect(store.activeTabIdRef.current).toBe(b.id);
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
