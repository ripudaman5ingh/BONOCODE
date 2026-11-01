import { describe, expect, it } from "vitest";
import {
  DEFAULT_CHANGES_DOCK,
  dockLayoutStyle,
  moveDockToSide,
  openDocks,
  resolveDockSides,
  type DockPlacement,
} from "./dockLayout";

/** The area grid as rows of cell names, for reading spans. */
function cells(areas: string): string[][] {
  return [...areas.matchAll(/"([^"]*)"/g)].map((match) => match[1].split(" "));
}

const open = (side: DockPlacement["side"], size: number): DockPlacement => ({
  side,
  size,
  open: true,
});

describe("dockLayoutStyle", () => {
  it("is a single main area with no docks", () => {
    expect(dockLayoutStyle([])).toEqual({
      gridTemplateRows: "minmax(0, 1fr)",
      gridTemplateColumns: "minmax(0, 1fr)",
      gridTemplateAreas: '"main"',
    });
  });

  it("places a single dock on each side", () => {
    const at = (side: DockPlacement["side"], size: number) =>
      dockLayoutStyle([{ surface: "terminal", side, size }]);
    expect(at("bottom", 220)).toEqual({
      gridTemplateRows: "minmax(0, 1fr) 220px",
      gridTemplateColumns: "minmax(0, 1fr)",
      gridTemplateAreas: '"main" "bottom"',
    });
    expect(at("top", 200)).toEqual({
      gridTemplateRows: "200px minmax(0, 1fr)",
      gridTemplateColumns: "minmax(0, 1fr)",
      gridTemplateAreas: '"top" "main"',
    });
    expect(at("left", 300)).toEqual({
      gridTemplateRows: "minmax(0, 1fr)",
      gridTemplateColumns: "300px minmax(0, 1fr)",
      gridTemplateAreas: '"left main"',
    });
    expect(at("right", 360)).toEqual({
      gridTemplateRows: "minmax(0, 1fr)",
      gridTemplateColumns: "minmax(0, 1fr) 360px",
      gridTemplateAreas: '"main right"',
    });
  });

  it("terminal bottom + changes right: changes spans the full height, terminal only main's width", () => {
    const style = dockLayoutStyle(
      openDocks({ terminal: open("bottom", 220), changes: open("right", 360) }),
    );
    expect(style.gridTemplateColumns).toBe("minmax(0, 1fr) 360px");
    expect(style.gridTemplateRows).toBe("minmax(0, 1fr) 220px");
    const grid = cells(style.gridTemplateAreas);
    expect(grid).toEqual([
      ["main", "right"],
      ["bottom", "right"],
    ]);
    // The bottom dock sits only in main's column.
    expect(grid.map((row) => row[0])).toEqual(["main", "bottom"]);
    expect(grid.every((row) => row[1] === "right")).toBe(true);
  });

  it("terminal right + changes left: two full-height columns around main", () => {
    const style = dockLayoutStyle(
      openDocks({ terminal: open("right", 300), changes: open("left", 340) }),
    );
    expect(style).toEqual({
      gridTemplateRows: "minmax(0, 1fr)",
      gridTemplateColumns: "340px minmax(0, 1fr) 300px",
      gridTemplateAreas: '"left main right"',
    });
  });

  it("handles all four sides at once", () => {
    const grid = cells(
      dockLayoutStyle([
        { surface: "terminal", side: "top", size: 100 },
        { surface: "changes", side: "left", size: 200 },
        { surface: "terminal", side: "bottom", size: 120 },
        { surface: "changes", side: "right", size: 220 },
      ]).gridTemplateAreas,
    );
    expect(grid).toEqual([
      ["left", "top", "right"],
      ["left", "main", "right"],
      ["left", "bottom", "right"],
    ]);
  });
});

describe("openDocks", () => {
  it("ignores closed and missing docks", () => {
    expect(openDocks({})).toEqual([]);
    expect(
      openDocks({
        terminal: { side: "bottom", size: 220, open: false },
        changes: DEFAULT_CHANGES_DOCK,
      }),
    ).toEqual([]);
    expect(
      dockLayoutStyle(
        openDocks({
          terminal: { side: "bottom", size: 220, open: false },
          changes: open("right", 360),
        }),
      ).gridTemplateAreas,
    ).toBe('"main right"');
  });
});

describe("moveDockToSide", () => {
  it("moves a dock to a free side", () => {
    const changes = open("right", 360);
    const next = moveDockToSide({ changes }, "changes", "left");
    expect(next.changes).toEqual({ side: "left", size: 360, open: true });
  });

  it("swaps an open dock on the target side to the mover's previous side", () => {
    const terminal = open("bottom", 220);
    const changes = open("right", 360);
    const next = moveDockToSide({ terminal, changes }, "changes", "bottom");
    expect(next.changes?.side).toBe("bottom");
    expect(next.terminal?.side).toBe("right");
  });

  it("does not move a closed dock out of the way", () => {
    const terminal: DockPlacement = { side: "bottom", size: 220, open: false };
    const changes = open("right", 360);
    const next = moveDockToSide({ terminal, changes }, "changes", "bottom");
    expect(next.terminal).toBe(terminal);
    expect(next.changes?.side).toBe("bottom");
  });

  it("returns the same placements when the side does not change", () => {
    const placements = { changes: open("right", 360) };
    expect(moveDockToSide(placements, "changes", "right")).toBe(placements);
  });
});

describe("resolveDockSides", () => {
  it("keeps one dock per side: a later dock gives way to the opposite side", () => {
    const resolved = resolveDockSides(
      openDocks({ terminal: open("right", 300), changes: open("right", 360) }),
    );
    expect(resolved.map((dock) => [dock.surface, dock.side])).toEqual([
      ["terminal", "right"],
      ["changes", "left"],
    ]);
    expect(resolved[1].size).toBe(360);
  });
});
