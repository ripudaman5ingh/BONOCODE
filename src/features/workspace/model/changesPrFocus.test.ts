import { expect, it } from "vitest";
import {
  resolveChangesPrFocus,
  syncPrFocusMemory,
} from "./changesPrFocus";

const base = { prOpen: true, hasChanges: false, override: null } as const;

it("leaves everything alone without a PR panel", () => {
  for (const hasChanges of [true, false]) {
    for (const override of [null, "changes", "pr"] as const) {
      expect(
        resolveChangesPrFocus({ prOpen: false, hasChanges, override }),
      ).toEqual({ changesCollapsed: false, prVisible: true });
    }
  }
});

it("collapses Changes and shows the PR when there is nothing to commit", () => {
  expect(resolveChangesPrFocus(base)).toEqual({
    changesCollapsed: true,
    prVisible: true,
  });
});

it("hides the PR panel while there are uncommitted changes", () => {
  expect(resolveChangesPrFocus({ ...base, hasChanges: true })).toEqual({
    changesCollapsed: false,
    prVisible: false,
  });
});

it("lets a manual pick win in both directions", () => {
  expect(resolveChangesPrFocus({ ...base, override: "changes" })).toEqual({
    changesCollapsed: false,
    prVisible: false,
  });
  expect(
    resolveChangesPrFocus({ ...base, hasChanges: true, override: "pr" }),
  ).toEqual({ changesCollapsed: true, prVisible: true });
});

it("never hides the PR behind a Changes dock the user closed", () => {
  expect(
    resolveChangesPrFocus({ ...base, hasChanges: true, changesOpen: false }),
  ).toEqual({ changesCollapsed: false, prVisible: true });
});

it("applies no rule until the diff stats have loaded", () => {
  for (const override of [null, "changes", "pr"] as const) {
    expect(
      resolveChangesPrFocus({ ...base, override, loaded: false }),
    ).toEqual({ changesCollapsed: false, prVisible: true });
  }
});

it("keeps the override until changes flip or the PR changes", () => {
  const memory = { key: "s1:7", hasChanges: true, override: "pr" } as const;
  expect(syncPrFocusMemory(memory, "s1:7", true)).toBe(memory);
  expect(syncPrFocusMemory(memory, "s1:7", false)).toEqual({
    key: "s1:7",
    hasChanges: false,
    override: null,
  });
  expect(syncPrFocusMemory(memory, "s1:8", true)).toEqual({
    key: "s1:8",
    hasChanges: true,
    override: null,
  });
  expect(syncPrFocusMemory(memory, "", true).override).toBeNull();
});
