// @vitest-environment happy-dom
// Characterization tests: they pin today's stored strings, fallbacks, clamps and
// events so the defineSetting() conversion can be checked for no behavior change.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as settings from "./settings";
import * as appearance from "./appearance";
import { HARNESS_IDLE_PARK_MS } from "../../../integrations/harness/core/registry";

const registry = vi.hoisted(() => ({ setHarnessIdleParkMs: vi.fn() }));
vi.mock("../../../integrations/harness/core/registry", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../../../integrations/harness/core/registry")
  >()),
  setHarnessIdleParkMs: registry.setHarnessIdleParkMs,
}));

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

function listen(name: string) {
  const events: Event[] = [];
  const onEvent = (event: Event) => {
    events.push(event);
  };
  window.addEventListener(name, onEvent);
  return {
    events,
    stop: () => window.removeEventListener(name, onEvent),
  };
}

let store: Storage;

beforeEach(() => {
  store = memoryStorage();
  vi.stubGlobal("localStorage", store);
  registry.setHarnessIdleParkMs.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("numeric appearance settings", () => {
  it("projectRailWidth is rounded and clamped to 180..360", () => {
    appearance.saveProjectRailWidth(250.5);
    expect(store.getItem("bonocode.projectRailWidth")).toBe("251");
    appearance.saveProjectRailWidth(400);
    expect(store.getItem("bonocode.projectRailWidth")).toBe("360");
    store.removeItem("bonocode.projectRailWidth");
    expect(appearance.loadProjectRailWidth()).toBe(200);
    store.setItem("bonocode.projectRailWidth", "179.4");
    expect(appearance.loadProjectRailWidth()).toBe(180);
    store.setItem("bonocode.projectRailWidth", "missing");
    expect(appearance.loadProjectRailWidth()).toBe(200);
  });

  it("agentIdleMs accepts only the listed options and calls the harness", () => {
    settings.saveAgentIdleMs(300_000);
    expect(store.getItem("bonocode.agentIdleMs")).toBe("300000");
    expect(registry.setHarnessIdleParkMs).toHaveBeenLastCalledWith(300_000);
    expect(settings.loadAgentIdleMs()).toBe(300_000);

    store.setItem("bonocode.agentIdleMs", "12345");
    expect(settings.loadAgentIdleMs()).toBe(HARNESS_IDLE_PARK_MS);
    store.removeItem("bonocode.agentIdleMs");
    expect(settings.loadAgentIdleMs()).toBe(HARNESS_IDLE_PARK_MS);
    store.setItem("bonocode.agentIdleMs", "");
    expect(settings.loadAgentIdleMs()).toBe(HARNESS_IDLE_PARK_MS);
  });
});

describe("enum and JSON settings", () => {
  it("sidebarTabOrder: default, partial, duplicate, invalid and fresh arrays", () => {
    expect(appearance.loadSidebarTabOrder()).toEqual(["sessions", "files"]);

    store.setItem("bonocode.sidebarTabOrder", '["files"]');
    expect(appearance.loadSidebarTabOrder()).toEqual(["files", "sessions"]);

    // A duplicate makes the list longer than the two tabs, so the whole order resets.
    store.setItem("bonocode.sidebarTabOrder", '["files","files"]');
    expect(appearance.loadSidebarTabOrder()).toEqual(["sessions", "files"]);

    // The retired "changes" tab is dropped, and the rest keeps its order.
    store.setItem("bonocode.sidebarTabOrder", '["changes","files","sessions"]');
    expect(appearance.loadSidebarTabOrder()).toEqual(["files", "sessions"]);
    store.setItem("bonocode.sidebarTabOrder", '["changes","bogus","files","sessions"]');
    expect(appearance.loadSidebarTabOrder()).toEqual(["files", "sessions"]);

    store.setItem("bonocode.sidebarTabOrder", "{not json");
    expect(appearance.loadSidebarTabOrder()).toEqual(["sessions", "files"]);
    store.setItem("bonocode.sidebarTabOrder", '{"a":1}');
    expect(appearance.loadSidebarTabOrder()).toEqual(["sessions", "files"]);

    const a = appearance.loadSidebarTabOrder();
    const b = appearance.loadSidebarTabOrder();
    expect(a).not.toBe(b);
    a.push("files");
    expect(appearance.loadSidebarTabOrder()).toHaveLength(2);
  });

  it("saveSidebarTabOrder writes JSON", () => {
    appearance.saveSidebarTabOrder(["files", "sessions"]);
    expect(store.getItem("bonocode.sidebarTabOrder")).toBe(
      '["files","sessions"]',
    );
  });

  it("chatBackgroundScope persists empty and all, invalid falls back to all", () => {
    expect(appearance.loadChatBackgroundScope()).toBe("all");
    appearance.saveChatBackgroundScope("empty");
    expect(store.getItem("bonocode.chatBackgroundScope")).toBe("empty");
    expect(appearance.loadChatBackgroundScope()).toBe("empty");
    store.setItem("bonocode.chatBackgroundScope", "none");
    expect(appearance.loadChatBackgroundScope()).toBe("all");
  });

  it("newThreadBackgroundEffect persists raw values, invalid falls back to none", () => {
    expect(appearance.loadNewThreadBackgroundEffect()).toBe("none");
    appearance.saveNewThreadBackgroundEffect("halftone");
    expect(store.getItem("bonocode.newThreadBackgroundEffect")).toBe("halftone");
    expect(appearance.loadNewThreadBackgroundEffect()).toBe("halftone");
    store.setItem("bonocode.newThreadBackgroundEffect", "plasma");
    expect(appearance.loadNewThreadBackgroundEffect()).toBe("none");
  });

  it("settingsSection persists known ids, invalid falls back to general", () => {
    expect(settings.loadSettingsSection()).toBe("general");
    settings.saveSettingsSection("archive");
    expect(store.getItem("bonocode.settingsSection")).toBe("archive");
    expect(settings.loadSettingsSection()).toBe("archive");
    store.setItem("bonocode.settingsSection", "nonsense");
    expect(settings.loadSettingsSection()).toBe("general");
  });

  it("fileTabMode, followUpBehavior and diffViewer persist raw values", () => {
    settings.saveFileTabMode("workspace");
    expect(store.getItem("bonocode.fileTabMode")).toBe("workspace");
    settings.saveFollowUpBehavior("queue");
    expect(store.getItem("bonocode.followUpBehavior")).toBe("queue");
    expect(settings.loadFollowUpBehavior()).toBe("queue");
    settings.saveDiffViewer("unified");
    expect(store.getItem("bonocode.diffViewer")).toBe("unified");
    expect(settings.loadDiffViewer()).toBe("unified");
    store.setItem("bonocode.diffViewer", "side");
    expect(settings.loadDiffViewer()).toBe("editor");
  });
});

describe("chat background", () => {
  it("opacity falls back from empty and session keys to the legacy key", () => {
    expect(appearance.loadChatBackgroundOpacity()).toBe(0.24);
    expect(appearance.loadChatBackgroundEmptyOpacity()).toBe(0.24);

    store.setItem("bonocode.chatBackgroundOpacity", "0.4");
    expect(appearance.loadChatBackgroundEmptyOpacity()).toBe(0.4);
    expect(appearance.loadChatBackgroundSessionOpacity()).toBe(0.4);
    expect(appearance.loadChatBackgroundOpacity()).toBe(0.4);

    store.setItem("bonocode.chatBackgroundEmptyOpacity", "0.3");
    expect(appearance.loadChatBackgroundEmptyOpacity()).toBe(0.3);
    expect(appearance.loadChatBackgroundSessionOpacity()).toBe(0.4);

    store.setItem("bonocode.chatBackgroundSessionOpacity", "junk");
    expect(appearance.loadChatBackgroundSessionOpacity()).toBe(0.4);

    // Looks wrong: "" is a number (0), so it does not fall back to the legacy key.
    store.setItem("bonocode.chatBackgroundEmptyOpacity", "");
    expect(appearance.loadChatBackgroundEmptyOpacity()).toBe(0.05);
  });

  it("saveChatBackgroundOpacity writes all three keys and clamps", () => {
    appearance.saveChatBackgroundOpacity(0.4);
    expect(store.getItem("bonocode.chatBackgroundEmptyOpacity")).toBe("0.4");
    expect(store.getItem("bonocode.chatBackgroundSessionOpacity")).toBe("0.4");
    expect(store.getItem("bonocode.chatBackgroundOpacity")).toBe("0.4");

    appearance.saveChatBackgroundOpacity(0.99);
    expect(store.getItem("bonocode.chatBackgroundOpacity")).toBe("0.65");
    expect(store.getItem("bonocode.chatBackgroundEmptyOpacity")).toBe("0.65");
    appearance.saveChatBackgroundOpacity(0);
    expect(store.getItem("bonocode.chatBackgroundSessionOpacity")).toBe("0.05");
  });

  it("per-surface opacity saves clamp and do not write the legacy key", () => {
    appearance.saveChatBackgroundEmptyOpacity(0.9);
    expect(store.getItem("bonocode.chatBackgroundEmptyOpacity")).toBe("0.65");
    expect(store.getItem("bonocode.chatBackgroundOpacity")).toBeNull();
    appearance.saveChatBackgroundSessionOpacity(0.01);
    expect(store.getItem("bonocode.chatBackgroundSessionOpacity")).toBe("0.05");
    expect(store.getItem("bonocode.chatBackgroundOpacity")).toBeNull();
  });

  it("chatBackgroundPath: empty removes the key, load trims, stored value is as given", () => {
    appearance.saveChatBackgroundPath("  /a/b.png  ");
    expect(store.getItem("bonocode.chatBackgroundPath")).toBe("  /a/b.png  ");
    expect(appearance.loadChatBackgroundPath()).toBe("/a/b.png");

    store.setItem("bonocode.chatBackgroundPath", "   ");
    expect(appearance.loadChatBackgroundPath()).toBeNull();

    appearance.saveChatBackgroundPath("/a/b.png");
    appearance.saveChatBackgroundPath("");
    expect(store.getItem("bonocode.chatBackgroundPath")).toBeNull();

    appearance.saveChatBackgroundPath("/a/c.png");
    appearance.saveChatBackgroundPath(null);
    expect(store.getItem("bonocode.chatBackgroundPath")).toBeNull();
  });

  it("saveChatBackgroundPath dispatches its event with the stored path as detail", () => {
    const listener = listen(appearance.CHAT_BACKGROUND_PATH_CHANGE_EVENT);
    appearance.saveChatBackgroundPath("/a/b.png");
    expect(listener.events).toHaveLength(1);
    // Changed in the defineSetting step: was a plain Event with no detail.
    expect((listener.events[0] as CustomEvent).detail).toBe("/a/b.png");
    listener.stop();
  });

  it("setNewThreadBackgroundEffect saves, then dispatches the path event", () => {
    const listener = listen(appearance.CHAT_BACKGROUND_PATH_CHANGE_EVENT);
    appearance.setNewThreadBackgroundEffect("scanlines");
    expect(store.getItem("bonocode.newThreadBackgroundEffect")).toBe("scanlines");
    expect(listener.events).toHaveLength(1);
    listener.stop();
  });
});

describe("events and subscriptions", () => {
  it.each([
    [
      "diffViewer",
      () => settings.saveDiffViewer("unified"),
      settings.DIFF_VIEWER_CHANGE_EVENT,
      "unified",
    ],
    [
      "collapsedProjectRailMode",
      () => settings.saveCollapsedProjectRailMode("hidden"),
      settings.COLLAPSED_PROJECT_RAIL_MODE_CHANGE_EVENT,
      "hidden",
    ],
    [
      "modelControls",
      () => settings.saveModelControls("beside"),
      settings.MODEL_CONTROLS_CHANGE_EVENT,
      "beside",
    ],
    [
      "transcriptLayout",
      () => appearance.saveTranscriptLayout("full"),
      appearance.TRANSCRIPT_LAYOUT_CHANGE_EVENT,
      "full",
    ],
    [
      "transcriptAnchor",
      () => appearance.saveTranscriptAnchor(false),
      appearance.TRANSCRIPT_ANCHOR_CHANGE_EVENT,
      false,
    ],
    [
      "showExcludedFiles",
      () => appearance.saveShowExcludedFiles(true),
      appearance.SHOW_EXCLUDED_FILES_CHANGE_EVENT,
      true,
    ],
    [
      "composerRunner",
      () => settings.saveComposerRunner(false),
      settings.COMPOSER_RUNNER_CHANGE_EVENT,
      false,
    ],
    [
      "liveAgentsEnabled",
      () => settings.saveLiveAgentsEnabled(false),
      settings.LIVE_AGENTS_ENABLED_CHANGE_EVENT,
      false,
    ],
  ])("%s dispatches its named CustomEvent with the saved detail", (_name, save, eventName, detail) => {
    const listener = listen(eventName);
    save();
    expect(listener.events).toHaveLength(1);
    const event = listener.events[0] as CustomEvent;
    expect(event).toBeInstanceOf(CustomEvent);
    expect(event.detail).toEqual(detail);
    listener.stop();
  });

  it("the named event strings are stable", () => {
    expect(settings.DIFF_VIEWER_CHANGE_EVENT).toBe("bonocode:diff-viewer-change");
    expect(settings.COLLAPSED_PROJECT_RAIL_MODE_CHANGE_EVENT).toBe(
      "bonocode:collapsed-project-rail-mode-change",
    );
    expect(settings.MODEL_CONTROLS_CHANGE_EVENT).toBe(
      "bonocode:model-controls-change",
    );
    expect(appearance.TRANSCRIPT_LAYOUT_CHANGE_EVENT).toBe(
      "bonocode:transcriptlayoutchange",
    );
    expect(appearance.TRANSCRIPT_ANCHOR_CHANGE_EVENT).toBe(
      "bonocode:transcriptanchorchange",
    );
    expect(appearance.SHOW_EXCLUDED_FILES_CHANGE_EVENT).toBe(
      "bonocode:showexcludedfileschange",
    );
    expect(appearance.SCHEME_CHANGE_EVENT).toBe("bonocode:schemechange");
  });

  it("saveAutosave dispatches a CustomEvent and returns the reloaded value", () => {
    const listener = listen("bonocode:autosave-change");
    expect(settings.saveAutosave(true)).toBe(true);
    expect(store.getItem("bonocode.autosave")).toBe("1");
    expect(listener.events).toHaveLength(1);
    expect(listener.events[0]).toBeInstanceOf(CustomEvent);
    // Changed in the defineSetting step: the event now carries the saved boolean (was null).
    expect((listener.events[0] as CustomEvent).detail).toBe(true);
    listener.stop();
  });

  it("saves without a change event dispatch nothing", () => {
    const dispatch = vi.spyOn(window, "dispatchEvent");
    settings.saveFileTabMode("workspace");
    settings.saveFollowUpBehavior("queue");
    settings.saveSettingsSection("archive");
    settings.saveCloseToTray(false);
    appearance.saveSidebarTabOrder(["files", "sessions"]);
    appearance.saveNewThreadBackgroundEffect("dither");
    appearance.saveChatBackgroundScope("empty");
    settings.saveAgentIdleMs(60_000);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("subscribeCollapsedProjectRailMode, subscribeModelControls, subscribeLiveAgentsEnabled and subscribeDiffViewer fire until unsubscribed", () => {
    const cases: [
      (listener: () => void) => () => void,
      () => void,
    ][] = [
      [settings.subscribeCollapsedProjectRailMode, () => settings.saveCollapsedProjectRailMode("compact")],
      [settings.subscribeModelControls, () => settings.saveModelControls("menu")],
      [settings.subscribeLiveAgentsEnabled, () => settings.saveLiveAgentsEnabled(true)],
      [settings.subscribeDiffViewer, () => settings.saveDiffViewer("editor")],
    ];
    for (const [subscribe, save] of cases) {
      const onChange = vi.fn();
      const unsubscribe = subscribe(onChange);
      save();
      expect(onChange).toHaveBeenCalledTimes(1);
      unsubscribe();
      save();
      expect(onChange).toHaveBeenCalledTimes(1);
    }
  });

  it("subscribeChatBackgroundPath and subscribeShowExcludedFiles fire until unsubscribed", () => {
    const pathChanged = vi.fn();
    const unsubscribePath = appearance.subscribeChatBackgroundPath(pathChanged);
    appearance.saveChatBackgroundPath("/a.png");
    expect(pathChanged).toHaveBeenCalledTimes(1);
    unsubscribePath();
    appearance.saveChatBackgroundPath("/b.png");
    expect(pathChanged).toHaveBeenCalledTimes(1);

    const excluded = vi.fn();
    const unsubscribeExcluded = appearance.subscribeShowExcludedFiles(excluded);
    appearance.saveShowExcludedFiles(false);
    expect(excluded).toHaveBeenCalledTimes(1);
    unsubscribeExcluded();
    appearance.saveShowExcludedFiles(true);
    expect(excluded).toHaveBeenCalledTimes(1);
  });

  it("subscribeAutosave listens to its event and to storage events for its key only", () => {
    const onChange = vi.fn();
    const unsubscribe = settings.subscribeAutosave(onChange);

    settings.saveAutosave(false);
    expect(onChange).toHaveBeenCalledTimes(1);

    const storageEvent = (key: string) =>
      Object.assign(new Event("storage"), { key });
    window.dispatchEvent(storageEvent("bonocode.autosave"));
    expect(onChange).toHaveBeenCalledTimes(2);
    window.dispatchEvent(storageEvent("bonocode.somethingElse"));
    expect(onChange).toHaveBeenCalledTimes(2);

    unsubscribe();
    window.dispatchEvent(storageEvent("bonocode.autosave"));
    settings.saveAutosave(true);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("subscribeKeybindings listens to its event and storage for its key only", () => {
    const onChange = vi.fn();
    const unsubscribe = settings.subscribeKeybindings(onChange);
    settings.saveKeybindingOverride("App: Search", { disabled: true });
    expect(onChange).toHaveBeenCalledTimes(1);

    const storageEvent = (key: string) =>
      Object.assign(new Event("storage"), { key });
    window.dispatchEvent(storageEvent("bonocode.keybindingOverrides"));
    expect(onChange).toHaveBeenCalledTimes(2);
    window.dispatchEvent(storageEvent("bonocode.other"));
    expect(onChange).toHaveBeenCalledTimes(2);

    unsubscribe();
    window.dispatchEvent(storageEvent("bonocode.keybindingOverrides"));
    expect(onChange).toHaveBeenCalledTimes(2);
  });
});
