import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearComposerDraft,
  flushComposerDrafts,
  getComposerDraft,
  getComposerMcpTags,
  resetComposerDraftsForTests,
  setComposerDraft,
  setComposerMcpTags,
} from "./draftCache";
import { newMcpTag } from "./mcpPicker";

const DRAFTS_KEY = "bonocode.composerDrafts";

function mockLocalStorage() {
  const data = new Map<string, string>();
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
    clear: () => {
      data.clear();
    },
    key: (index: number) => [...data.keys()][index] ?? null,
    get length() {
      return data.size;
    },
  };
  Object.defineProperty(globalThis, "localStorage", {
    value: storage,
    configurable: true,
  });
}

function storedDrafts(): Record<string, unknown> {
  return JSON.parse(localStorage.getItem(DRAFTS_KEY) ?? "{}");
}

beforeEach(() => {
  mockLocalStorage();
  resetComposerDraftsForTests();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("draftCache", () => {
  it("returns undefined for a session that never had a draft", () => {
    expect(getComposerDraft("never-seen")).toBeUndefined();
  });

  it("gives back the last text set for a session, across separate reads", () => {
    // This is the actual bug: SessionPane used to keep the composer's text
    // in a component-local ref, so closing a session's pane (unmounting
    // SessionPane) and reopening it - a fresh component instance calling
    // getComposerDraft again - lost whatever was typed. A module-level
    // cache has to answer the same text back on a later, independent read.
    setComposerDraft("s1", "half-typed message");

    expect(getComposerDraft("s1")).toBe("half-typed message");
  });

  it("keeps drafts for different sessions apart", () => {
    setComposerDraft("s2", "draft for session two");
    setComposerDraft("s3", "draft for session three");

    expect(getComposerDraft("s2")).toBe("draft for session two");
    expect(getComposerDraft("s3")).toBe("draft for session three");
  });

  it("treats setting an empty string as clearing the draft", () => {
    setComposerDraft("s4", "something");
    setComposerDraft("s4", "");

    expect(getComposerDraft("s4")).toBeUndefined();
  });

  it("clearComposerDraft removes a stored draft", () => {
    setComposerDraft("s5", "will be cleared");
    clearComposerDraft("s5");

    expect(getComposerDraft("s5")).toBeUndefined();
  });

  it("keeps MCP tag metadata with its session draft", () => {
    const tag = newMcpTag(
      {
        provider: "codex",
        name: "docs",
        scope: "user",
        configPath: "/config.toml",
        transport: "stdio",
      },
      [],
    );
    setComposerDraft("mcp-one", `Ask ${tag.token}`);
    setComposerMcpTags("mcp-one", [tag]);
    setComposerDraft("mcp-two", "Another draft");
    expect(getComposerMcpTags("mcp-one")).toEqual([tag]);
    expect(getComposerMcpTags("mcp-two")).toEqual([]);
    setComposerDraft("mcp-one", "");
    expect(getComposerMcpTags("mcp-one")).toEqual([]);
  });
});

describe("draftCache storage", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("writes a draft 400 ms after it changes, and reads it back after a reset", () => {
    setComposerDraft("s1", "saved text");
    expect(localStorage.getItem(DRAFTS_KEY)).toBeNull();

    vi.advanceTimersByTime(400);
    expect(storedDrafts()).toEqual({
      s1: { text: "saved text", at: expect.any(Number) },
    });

    resetComposerDraftsForTests();
    expect(getComposerDraft("s1")).toBe("saved text");
  });

  it("removes a cleared draft from storage", () => {
    setComposerDraft("s2", "gone soon");
    flushComposerDrafts();
    clearComposerDraft("s2");
    flushComposerDrafts();

    expect(storedDrafts()).toEqual({});
  });

  it("keeps the newest 50 drafts in storage", () => {
    for (let index = 0; index < 51; index++) {
      vi.setSystemTime(1_000 + index);
      setComposerDraft(`s${index}`, `draft ${index}`);
    }
    flushComposerDrafts();

    const stored = storedDrafts();
    expect(Object.keys(stored)).toHaveLength(50);
    expect(stored).not.toHaveProperty("s0");
    expect(stored).toHaveProperty("s50");
  });

  it("keeps a text over 100,000 characters in memory only", () => {
    setComposerDraft("long", "x".repeat(100_001));
    setComposerDraft("short", "ok");
    flushComposerDrafts();

    const stored = storedDrafts();
    expect(stored).not.toHaveProperty("long");
    expect(stored).toHaveProperty("short");
    expect(getComposerDraft("long")).toHaveLength(100_001);
  });

  it("ignores bad JSON in storage and drafts still work", () => {
    localStorage.setItem(DRAFTS_KEY, "{not json");

    expect(getComposerDraft("s1")).toBeUndefined();
    setComposerDraft("s1", "fresh");
    expect(getComposerDraft("s1")).toBe("fresh");
  });

  it("ignores bad entries in storage and keeps the good ones", () => {
    localStorage.setItem(
      DRAFTS_KEY,
      JSON.stringify({
        good: { text: "kept", at: 1 },
        numericText: { text: 5, at: 1 },
        noTime: { text: "no time" },
        nothing: null,
      }),
    );

    expect(getComposerDraft("good")).toBe("kept");
    expect(getComposerDraft("numericText")).toBeUndefined();
    expect(getComposerDraft("noTime")).toBeUndefined();
    expect(getComposerDraft("nothing")).toBeUndefined();
  });

  it("flushComposerDrafts writes right away", () => {
    setComposerDraft("s1", "now");
    flushComposerDrafts();

    expect(storedDrafts()).toEqual({
      s1: { text: "now", at: expect.any(Number) },
    });
  });
});
