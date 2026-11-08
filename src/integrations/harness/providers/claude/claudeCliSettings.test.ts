import { beforeEach, describe, expect, it } from "vitest";
import { saveProjectNotesFolder } from "../../../../features/projects/model/projectNotesFolder";
import {
  claudeCliSettings,
  claudeLaunchKey,
  claudeNotesFolder,
} from "./claudeCliSettings";
import type { HarnessSessionInput } from "../../core/types";

function mockBrowserStorage() {
  const data = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    value: {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => data.set(key, value),
    },
    configurable: true,
  });
  Object.defineProperty(globalThis, "window", {
    value: { dispatchEvent: () => true },
    configurable: true,
  });
}

function input(
  overrides: Partial<HarnessSessionInput> = {},
): HarnessSessionInput {
  return {
    sessionId: "s1",
    cwd: "/work/alpha",
    model: "claude:claude-sonnet-5",
    runtimeMode: "supervised",
    onEvent: () => undefined,
    ...overrides,
  };
}

describe("claudeCliSettings", () => {
  beforeEach(mockBrowserStorage);

  it("adds the linked notes folder as an additional directory", () => {
    saveProjectNotesFolder("/work/alpha", "/vault/Notes");
    expect(claudeCliSettings(input())?.permissions).toEqual({
      additionalDirectories: ["/vault/Notes"],
    });
  });

  it("has no permissions key without a linked folder", () => {
    const settings = claudeCliSettings(
      input({ modelSettings: { fast: "true" } }),
    );
    expect(settings).toEqual({ fastMode: true });
    expect(settings).not.toHaveProperty("permissions");
  });

  it("is undefined when nothing is set", () => {
    expect(claudeCliSettings(input())).toBeUndefined();
  });

  it("keeps thinking, fast and ultracode alongside the folder", () => {
    saveProjectNotesFolder("/work/alpha", "/vault/Notes");
    expect(
      claudeCliSettings(
        input({
          modelSettings: {
            thinking: "true",
            fast: "true",
            effort: "ultracode",
          },
        }),
      ),
    ).toEqual({
      alwaysThinkingEnabled: true,
      fastMode: true,
      ultracode: true,
      permissions: { additionalDirectories: ["/vault/Notes"] },
    });
  });

  it("looks the folder up by project path, not the worktree path", () => {
    saveProjectNotesFolder("/work/alpha", "/vault/Notes");
    const worktree = input({
      cwd: "/work/alpha-worktrees/feature",
      projectCwd: "/work/alpha",
    });
    expect(claudeNotesFolder(worktree)).toBe("/vault/Notes");
    expect(claudeNotesFolder(input({ cwd: "/work/alpha-worktrees/feature" })))
      .toBeNull();
  });
});

describe("claudeLaunchKey", () => {
  beforeEach(mockBrowserStorage);

  it("changes when a notes folder is linked or unlinked", () => {
    const before = claudeLaunchKey(input(), "sonnet");
    saveProjectNotesFolder("/work/alpha", "/vault/Notes");
    const linked = claudeLaunchKey(input(), "sonnet");
    expect(linked).not.toBe(before);
    saveProjectNotesFolder("/work/alpha", null);
    expect(claudeLaunchKey(input(), "sonnet")).toBe(before);
  });
});
