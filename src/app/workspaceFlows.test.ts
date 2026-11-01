// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentType } from "react";
import { type ResumedWorkspace } from "../features/sessions/model/inFlight";
import { newSession } from "../features/sessions/model/session";
import { newTab, leafIds, type WorkspaceTab } from "../features/workspace/model/layout";
import { type WorkspaceSnapshot } from "../features/workspace/model/workspaceSnapshot";

type ListenEvent = { event: string; id: number; payload: unknown };
type ListenHandler = (event: ListenEvent) => void;

const tauri = vi.hoisted(() => ({
  listeners: new Map<string, (event: { event: string; id: number; payload: unknown }) => void>(),
  // Every command returns null unless it needs a real value to render.
  invoke: vi.fn(async (cmd: string, _args?: unknown): Promise<unknown> => {
    // The Composer builds its file-mention index from this list and iterates it.
    if (cmd === "list_project_files") return [];
    return null;
  }),
  open: vi.fn(async (_options?: unknown): Promise<string | string[] | null> => null),
}));

// Only the commands and dialogs this flow touches are mocked. Everything else
// in the app runs for real.
vi.mock("@tauri-apps/api/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tauri-apps/api/core")>()),
  invoke: tauri.invoke,
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: async (name: string, handler: ListenHandler) => {
    tauri.listeners.set(name, handler);
    return () => undefined;
  },
  emit: async () => undefined,
}));

// Window, webview and webview-window handles. Any method is an async no-op
// that resolves to an unlisten function.
function asyncNoopHandle() {
  return new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "label") return "main";
        if (prop === "then") return undefined;
        return async () => () => undefined;
      },
    },
  );
}

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => asyncNoopHandle(),
}));

vi.mock("@tauri-apps/api/webview", () => ({
  getCurrentWebview: () => asyncNoopHandle(),
}));

vi.mock("@tauri-apps/api/webviewWindow", () => ({
  getCurrentWebviewWindow: () => asyncNoopHandle(),
}));

vi.mock("@tauri-apps/api/app", () => ({
  getVersion: async () => "0.6.1",
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  ask: async () => true,
  message: async () => undefined,
  open: tauri.open,
  save: async () => null,
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: async () => undefined,
  revealItemInDir: async () => undefined,
}));

vi.mock("@tauri-apps/plugin-process", () => ({
  relaunch: async () => undefined,
}));

vi.mock("@tauri-apps/plugin-updater", () => ({
  check: async () => null,
}));

const ALPHA = "/work/alpha";
const BETA = "/work/beta";

type Fixture = {
  resumed: ResumedWorkspace;
  A: string;
  B: string;
  C: string;
  D: string;
};

// Tabs belong to a project by their session's cwd (see `filterTabsForProject`),
// so each tab's session carries its project's path.
function buildFixture(): Fixture {
  const sessionA = newSession("claude", ALPHA);
  const sessionB = newSession("claude", ALPHA);
  const sessionC = newSession("claude", ALPHA);
  const sessionD = newSession("claude", BETA);
  const tabA = newTab(sessionA.id);
  const tabB = newTab(sessionB.id);
  const tabC = newTab(sessionC.id);
  const tabD = newTab(sessionD.id);
  const tabs: WorkspaceTab[] = [tabA, tabB, tabC, tabD];
  return {
    resumed: {
      sessions: [sessionA, sessionB, sessionC, sessionD],
      tabs,
      activeTabId: tabC.id,
      projectCwd: ALPHA,
    },
    A: tabA.id,
    B: tabB.id,
    C: tabC.id,
    D: tabD.id,
  };
}

let App: ComponentType<{ resumed?: ResumedWorkspace | null }>;
let container: HTMLDivElement;
let root: Root;
let fx: Fixture;
const lastFiredAt = new Map<string, number>();

beforeAll(async () => {
  App = (await import("./App")).default;
}, 30_000);

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  tauri.invoke.mockClear();
  tauri.open.mockReset();
  tauri.open.mockResolvedValue(null);
  tauri.listeners.clear();
  lastFiredAt.clear();
  fx = buildFixture();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root.render(createElement(App, { resumed: fx.resumed }));
  });
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Fire a menu event synchronously, inside act, with no wait. */
function fireNow(name: string) {
  const handler = tauri.listeners.get(name);
  if (!handler) throw new Error(`no listener registered for ${name}`);
  handler({ event: name, id: 0, payload: undefined });
}

/** Fire a menu event. Waits out the 80 ms debounce for a repeat of the same name. */
async function fire(name: string, payload?: unknown) {
  const last = lastFiredAt.get(name);
  if (last !== undefined) {
    const wait = 90 - (performance.now() - last);
    if (wait > 0) await sleep(wait);
  }
  lastFiredAt.set(name, performance.now());
  const handler = tauri.listeners.get(name);
  if (!handler) throw new Error(`no listener registered for ${name}`);
  // Close flows await confirm dialogs and kill calls after the handler returns,
  // so let one macrotask run inside act before the state is read.
  await act(async () => {
    handler({ event: name, id: 0, payload });
    await sleep(0);
  });
}

// Longer than the 250 ms save debounce, plus the ~200 ms a close flow takes to
// make its second state change (the session kill round trip).
const SETTLE_MS = 1_000;

/** Let the save debounce expire, then return every saved snapshot. */
async function savedSnapshots(): Promise<WorkspaceSnapshot[]> {
  await act(async () => {
    await sleep(SETTLE_MS);
  });
  return tauri.invoke.mock.calls
    .filter(([cmd]) => cmd === "workspace_set_snapshot")
    .map(([, args]) => (args as { snapshot: WorkspaceSnapshot }).snapshot);
}

async function lastSnapshot(): Promise<WorkspaceSnapshot> {
  const all = await savedSnapshots();
  const last = all.at(-1);
  if (!last)
    throw new Error(
      `no workspace_set_snapshot call; commands seen: ${tauri.invoke.mock.calls.map(([cmd]) => cmd).join(", ")}`,
    );
  return last;
}

function tabIds(snapshot: WorkspaceSnapshot): string[] {
  return snapshot.tabs.map((tab) => tab.id);
}

/** Maps the fixture's tab ids to A/B/C/D; a tab the test created shows as "new". */
function labels(snapshot: WorkspaceSnapshot): string[] {
  const names: Record<string, string> = {
    [fx.A]: "A",
    [fx.B]: "B",
    [fx.C]: "C",
    [fx.D]: "D",
  };
  return snapshot.tabs.map((tab) => names[tab.id] ?? "new");
}

function leafCount(snapshot: WorkspaceSnapshot, tabId: string): number {
  const tab = snapshot.tabs.find((entry) => entry.id === tabId);
  if (!tab) throw new Error(`tab ${tabId} is not in the snapshot`);
  return leafIds(tab.layout).length;
}

describe("workspace flows through the App's menu events", () => {
  it("boot: the first saved snapshot has the fixture's tabs, active tab and project", async () => {
    const [first] = await savedSnapshots();
    expect(first).toBeDefined();
    expect(labels(first!)).toEqual(["A", "B", "C", "D"]);
    expect(first!.activeTabId).toBe(fx.C);
    expect(first!.projectCwd).toBe(ALPHA);
  });

  it("new_tab adds one tab and reports where it goes and whether it is active", async () => {
    await fire("new_tab");
    const snap = await lastSnapshot();
    expect(snap.tabs).toHaveLength(5);
    expect(labels(snap)).toEqual(["A", "B", "C", "new", "D"]);
    expect(snap.activeTabId).toBe(tabIds(snap)[3]);
  });

  it("close_tab on the active tab, then on the last tab of a project", async () => {
    await fire("close_tab");
    const afterFirst = await lastSnapshot();
    expect(labels(afterFirst)).toEqual(["A", "B", "D"]);
    expect(afterFirst.activeTabId).toBe(fx.B);

    await fire("close_tab");
    const afterSecond = await lastSnapshot();
    expect(labels(afterSecond)).toEqual(["A", "D"]);
    expect(afterSecond.activeTabId).toBe(fx.A);
  });

  it("next_tab and prev_tab wrap around inside the current project", async () => {
    await fire("next_tab");
    expect((await lastSnapshot()).activeTabId).toBe(fx.A);

    await fire("next_tab");
    expect((await lastSnapshot()).activeTabId).toBe(fx.B);

    await fire("prev_tab");
    expect((await lastSnapshot()).activeTabId).toBe(fx.A);

    await fire("prev_tab");
    expect((await lastSnapshot()).activeTabId).toBe(fx.C);
  });

  it("back_tab and forward_tab walk the visit history", async () => {
    await fire("next_tab");
    await fire("next_tab");
    expect((await lastSnapshot()).activeTabId).toBe(fx.B);

    await fire("back_tab");
    expect((await lastSnapshot()).activeTabId).toBe(fx.A);

    await fire("forward_tab");
    expect((await lastSnapshot()).activeTabId).toBe(fx.B);
  });

  it("split_right and split_down add a leaf; close_tab then closes the focused pane", async () => {
    await fire("split_right");
    const split = await lastSnapshot();
    expect(leafCount(split, fx.C)).toBe(2);
    expect(labels(split)).toEqual(["A", "B", "C", "D"]);

    await fire("split_down");
    expect(leafCount(await lastSnapshot(), fx.C)).toBe(3);

    await fire("close_tab");
    const afterClose = await lastSnapshot();
    expect(labels(afterClose)).toEqual(["A", "B", "C", "D"]);
    expect(leafCount(afterClose, fx.C)).toBe(2);
  });

  it("close_other_tabs and close_all_tabs", async () => {
    await fire("close_other_tabs");
    const others = await lastSnapshot();
    expect(labels(others)).toEqual(["C"]);
    expect(others.activeTabId).toBe(fx.C);

    await fire("close_all_tabs");
    const all = await lastSnapshot();
    // The workspace always keeps one tab: the active one is reset, and its
    // leaf stays the same session id.
    expect(labels(all)).toEqual(["C"]);
    expect(leafIds(all.tabs[0]!.layout)).toEqual([fx.resumed.sessions[2]!.id]);
  });

  it("new_terminal_tab then toggle_terminal twice updates the project dock", async () => {
    await fire("new_terminal_tab");
    const withTerminal = await lastSnapshot();
    expect(withTerminal.projectTerminals.length).toBeGreaterThan(0);
    const openAfterCreate = withTerminal.projectTerminals.find((dock) => dock.projectPath === ALPHA)?.open;

    await fire("toggle_terminal");
    const toggledOnce = await lastSnapshot();
    const openAfterFirstToggle = toggledOnce.projectTerminals.find((dock) => dock.projectPath === ALPHA)?.open;

    await fire("toggle_terminal");
    const toggledTwice = await lastSnapshot();
    const openAfterSecondToggle = toggledTwice.projectTerminals.find((dock) => dock.projectPath === ALPHA)?.open;

    // Recorded as observed; see the summary for what looks wrong here.
    expect({ openAfterCreate, openAfterFirstToggle, openAfterSecondToggle }).toEqual({
      openAfterCreate: true,
      openAfterFirstToggle: false,
      openAfterSecondToggle: true,
    });
  });

  it("open_project to beta activates its tab; open_project back to alpha restores alpha's last active tab", async () => {
    tauri.open.mockResolvedValue([BETA]);
    await fire("open_project");
    const beta = await lastSnapshot();
    expect(beta.projectCwd).toBe(BETA);
    expect(beta.activeTabId).toBe(fx.D);

    tauri.open.mockResolvedValue([ALPHA]);
    await fire("open_project");
    const alpha = await lastSnapshot();
    expect(alpha.projectCwd).toBe(ALPHA);
    expect(alpha.activeTabId).toBe(fx.C);
  });

  it("new_tab then split_right in one act: the stale read splits the old active tab, not the new one", async () => {
    await act(async () => {
      fireNow("new_tab");
      fireNow("split_right");
    });
    const snap = await lastSnapshot();
    // FLIP in the workspace-store refactor: today handlers read refs from the
    // last render, so the second command acts on the old tab. With the store,
    // it must act on the new tab.
    expect(labels(snap)).toEqual(["A", "B", "C", "new", "D"]);
    expect(leafCount(snap, fx.C)).toBe(2);
  });

  it("new_tab then close_tab in one act: the stale read closes the old active tab and drops the new one", async () => {
    await act(async () => {
      fireNow("new_tab");
      fireNow("close_tab");
    });
    const snap = await lastSnapshot();
    // FLIP in the workspace-store refactor: today handlers read refs from the
    // last render, so the second command acts on the old tab. With the store,
    // it must act on the new tab.
    expect(labels(snap)).toEqual(["A", "B", "D"]);
  });

  it("a new tab is saved even when a later render lands inside the 250 ms window", async () => {
    await fire("new_tab");
    await act(async () => {
      await sleep(50);
    });
    // Re-opening the current project re-runs the effects without changing the key.
    tauri.open.mockResolvedValue([ALPHA]);
    await fire("open_project");
    const snap = await lastSnapshot();
    expect(snap.tabs).toHaveLength(5);
  });
});
