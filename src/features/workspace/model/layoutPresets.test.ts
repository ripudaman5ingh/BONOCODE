// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import {
  BUILT_IN_LAYOUT_PRESETS,
  LAYOUT_PRESETS_KEY,
  applyPreset,
  capturePreset,
  deleteUserPreset,
  loadUserPresets,
  nextPresetName,
  parseUserPresets,
  saveUserPreset,
  terminalPlacement,
  type LayoutState,
} from "./layoutPresets";

const current: LayoutState = {
  projectRailOpen: false,
  sessionSidebarOpen: true,
  changesDock: { side: "left", size: 400, open: true },
  terminalDock: { side: "top", size: 200, open: false },
};

describe("built-in layout presets", () => {
  it("are Default, Focus and Review with the documented placements", () => {
    const [defaults, focus, review] = BUILT_IN_LAYOUT_PRESETS;
    expect(BUILT_IN_LAYOUT_PRESETS.map((preset) => preset.name)).toEqual([
      "Default",
      "Focus",
      "Review",
    ]);
    expect(defaults).toMatchObject({
      projectRailOpen: true,
      sessionSidebarOpen: true,
      changesDock: { side: "right", size: 520, open: true },
      terminalDock: { open: false },
    });
    expect(focus).toMatchObject({
      projectRailOpen: false,
      sessionSidebarOpen: false,
      changesDock: { open: false },
      terminalDock: { open: false },
    });
    expect(review).toMatchObject({
      projectRailOpen: true,
      sessionSidebarOpen: true,
      changesDock: { side: "right", size: 760, open: true },
      terminalDock: { open: false },
    });
  });
});

describe("capture and apply", () => {
  it("round-trips the current layout", () => {
    const preset = capturePreset("  Mine  ", current);
    expect(preset.name).toBe("Mine");
    expect(applyPreset(preset)).toEqual(current);
  });

  it("clamps dock sizes to the window", () => {
    const review = BUILT_IN_LAYOUT_PRESETS[2]!;
    expect(applyPreset(review, { width: 800, height: 600 }).changesDock).toEqual(
      { side: "right", size: 560, open: true },
    );
  });

  it("reads a project without a terminal dock as a closed bottom dock", () => {
    expect(terminalPlacement(undefined)).toEqual({
      side: "bottom",
      size: 220,
      open: false,
    });
  });
});

describe("nextPresetName", () => {
  const names = ["Default", "Focus", "Review", "Mine"];
  it("cycles and wraps", () => {
    expect(nextPresetName(names, "Default")).toBe("Focus");
    expect(nextPresetName(names, "Review")).toBe("Mine");
    expect(nextPresetName(names, "Mine")).toBe("Default");
  });
  it("starts at Default when nothing or an unknown preset was applied", () => {
    expect(nextPresetName(names, null)).toBe("Default");
    expect(nextPresetName(names, "Deleted")).toBe("Default");
  });
});

describe("user presets in localStorage", () => {
  beforeEach(() => localStorage.clear());

  it("drops malformed, built-in-named and repeated entries", () => {
    const good = capturePreset("Mine", current);
    expect(
      parseUserPresets([
        good,
        { ...good, name: "mine" },
        { ...good, name: "default" },
        { ...good, name: "  " },
        { ...good, name: "No side", changesDock: { size: 1, open: true } },
        { ...good, name: "Bad flag", projectRailOpen: "yes" },
        { ...good, name: "NaN", terminalDock: { side: "top", size: Number.NaN, open: true } },
        null,
        "Mine",
      ]),
    ).toEqual([good]);
    expect(parseUserPresets({ name: "Mine" })).toEqual([]);
  });

  it("survives unreadable storage", () => {
    localStorage.setItem(LAYOUT_PRESETS_KEY, "{not json");
    expect(loadUserPresets()).toEqual([]);
  });

  it("saves, replaces by name, refuses built-in names and deletes", () => {
    saveUserPreset(capturePreset("Mine", current));
    const replaced = capturePreset("MINE", { ...current, projectRailOpen: true });
    expect(saveUserPreset(replaced)).toEqual([replaced]);
    expect(saveUserPreset(capturePreset("Review", current))).toEqual([replaced]);
    expect(loadUserPresets()).toEqual([replaced]);
    expect(deleteUserPreset("MINE")).toEqual([]);
    expect(loadUserPresets()).toEqual([]);
  });
});
