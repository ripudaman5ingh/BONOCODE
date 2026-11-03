// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentType } from "react";
import { type ResumedWorkspace } from "../features/sessions/model/inFlight";
import { newSession } from "../features/sessions/model/session";
import { newTab, leafIds, type WorkspaceTab } from "../features/workspace/model/layout";
import { type WorkspaceSnapshot } from "../features/workspace/model/workspaceSnapshot";
import { LAYOUT_PRESETS_KEY } from "../features/workspace/model/layoutPresets";
import {
  loadProjectRailOpen,
  loadSessionSidebarOpen,
} from "../features/settings/model/appearance";

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
      // Explicitly closed, so these flows start from the dock layout they were
      // written for rather than a fresh window's open changes dock.
      changesDock: { side: "right", size: 360, open: false },
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

  it("new_tab then split_right in one act: the split lands on the new tab", async () => {
    await act(async () => {
      fireNow("new_tab");
      fireNow("split_right");
    });
    const snap = await lastSnapshot();
    expect(labels(snap)).toEqual(["A", "B", "C", "new", "D"]);
    expect(leafCount(snap, snap.activeTabId)).toBe(2);
    expect(leafCount(snap, fx.C)).toBe(1);
  });

  it("new_tab then close_tab in one act: the new tab closes and the workspace returns to its start state", async () => {
    await act(async () => {
      fireNow("new_tab");
      fireNow("close_tab");
    });
    const snap = await lastSnapshot();
    expect(labels(snap)).toEqual(["A", "B", "C", "D"]);
    expect(snap.activeTabId).toBe(fx.C);
  });

  it("open_project to beta then next_tab in one act: next_tab cycles within beta's tabs", async () => {
    // Give beta a second tab, then leave for alpha so the next open of beta
    // restores that new tab.
    tauri.open.mockResolvedValue([BETA]);
    await fire("open_project");
    await fire("new_tab");
    const betaTab = (await lastSnapshot()).activeTabId;
    expect(betaTab).not.toBe(fx.D);
    tauri.open.mockResolvedValue([ALPHA]);
    await fire("open_project");
    expect((await lastSnapshot()).activeTabId).toBe(fx.C);

    tauri.open.mockResolvedValue([BETA]);
    await act(async () => {
      fireNow("open_project");
      // The folder picker resolves asynchronously, and React 19 flushes the
      // store's sync updates on a microtask even inside act, so one render
      // lands before next_tab. This pins the end state of the sequence.
      await sleep(0);
      fireNow("next_tab");
    });
    const snap = await lastSnapshot();
    expect(snap.projectCwd).toBe(BETA);
    expect(snap.activeTabId).toBe(fx.D);
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

  it("toggle_changes opens the changes dock on the right; a second toggle closes it", async () => {
    expect((await lastSnapshot()).changesDock).toEqual({
      side: "right",
      size: 360,
      open: false,
    });

    await fire("toggle_changes");
    expect((await lastSnapshot()).changesDock).toEqual({
      side: "right",
      size: 360,
      open: true,
    });

    await fire("toggle_changes");
    expect((await lastSnapshot()).changesDock?.open).toBe(false);
  });

  it("with the changes dock closed, its rail on the side reopens it and saves it open", async () => {
    expect((await lastSnapshot()).changesDock?.open).toBe(false);

    const rail = container.querySelector<HTMLButtonElement>(
      'button[aria-label^="Show Changes"]',
    );
    expect(rail).not.toBeNull();
    await act(async () => {
      rail!.click();
    });
    expect((await lastSnapshot()).changesDock?.open).toBe(true);
  });

  it("toggle_terminal + toggle_changes: both docks are open and both are saved", async () => {
    await fire("toggle_terminal");
    await fire("toggle_changes");
    const snap = await lastSnapshot();
    const terminal = snap.projectTerminals.find((dock) => dock.projectPath === ALPHA);
    expect(terminal?.open).toBe(true);
    expect(terminal?.side).toBe("bottom");
    expect(snap.changesDock).toEqual({ side: "right", size: 360, open: true });
  });

  it("open_project to beta keeps the window's changes dock; the terminal dock stays with its project", async () => {
    await fire("toggle_terminal");
    await fire("toggle_changes");

    tauri.open.mockResolvedValue([BETA]);
    await fire("open_project");
    const beta = await lastSnapshot();
    expect(beta.projectCwd).toBe(BETA);
    expect(beta.changesDock).toEqual({ side: "right", size: 360, open: true });
    expect(beta.projectTerminals.map((dock) => dock.projectPath)).toEqual([ALPHA]);
    expect(beta.projectTerminals[0]?.open).toBe(true);
  });

  it("boot without a resumed workspace saves the changes dock open on the right", async () => {
    await act(async () => root.unmount());
    tauri.invoke.mockClear();
    root = createRoot(container);
    await act(async () => {
      root.render(createElement(App, {}));
    });
    expect((await lastSnapshot()).changesDock).toEqual({
      side: "right",
      size: 520,
      open: true,
    });
  });

  // Docks clamp to 70% of the window, which happy-dom makes 1024 px wide.
  const reviewSize = () => Math.min(760, Math.floor(window.innerWidth * 0.7));
  const DEFAULT_DOCK = { side: "right", size: 520, open: true };

  it("reset_layout after toggling docks and sidebars restores the Default layout", async () => {
    await fire("toggle_terminal");
    await fire("toggle_changes");
    await fire("toggle_sidebar");
    const toggled = await lastSnapshot();
    expect(toggled.changesDock?.open).toBe(true);
    expect(loadProjectRailOpen()).toBe(false);

    await fire("reset_layout");
    const snap = await lastSnapshot();
    expect(snap.changesDock).toEqual(DEFAULT_DOCK);
    const terminal = snap.projectTerminals.find((dock) => dock.projectPath === ALPHA);
    expect(terminal).toMatchObject({ side: "bottom", size: 220, open: false });
    expect(loadProjectRailOpen()).toBe(true);
    expect(loadSessionSidebarOpen()).toBe(true);
  });

  it("next_layout cycles Default → Focus → Review → Default", async () => {
    const docks: unknown[] = [];
    const rails: boolean[] = [];
    for (let step = 0; step < 4; step++) {
      await fire("next_layout");
      docks.push((await lastSnapshot()).changesDock);
      rails.push(loadProjectRailOpen() && loadSessionSidebarOpen());
    }
    expect(docks).toEqual([
      DEFAULT_DOCK,
      { side: "right", size: 520, open: false },
      { side: "right", size: reviewSize(), open: true },
      DEFAULT_DOCK,
    ]);
    expect(rails).toEqual([true, false, true, true]);
  });

  it("a saved user preset joins the next_layout cycle after Review", async () => {
    localStorage.setItem(
      LAYOUT_PRESETS_KEY,
      JSON.stringify([
        {
          name: "Mine",
          projectRailOpen: true,
          sessionSidebarOpen: false,
          changesDock: { side: "left", size: 300, open: true },
          terminalDock: { side: "bottom", size: 220, open: false },
        },
      ]),
    );
    for (let step = 0; step < 4; step++) await fire("next_layout");
    expect((await lastSnapshot()).changesDock).toEqual({
      side: "left",
      size: 300,
      open: true,
    });
    expect(loadSessionSidebarOpen()).toBe(false);

    await fire("next_layout");
    expect((await lastSnapshot()).changesDock).toEqual(DEFAULT_DOCK);
  });
});
