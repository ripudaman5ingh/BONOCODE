import {
  DOCK_SIZE_DEFAULT,
  clampDockSize,
  type DockSide,
} from "../../projects/model/projectTerminal";

export type DockSurface = "terminal" | "changes";

export type DockPlacement = { side: DockSide; size: number; open: boolean };

/** A dock as the layout sees it: open, or a collapsed rail standing in for a closed one. */
export type DockEntry = {
  surface: DockSurface;
  side: DockSide;
  size: number;
  collapsed?: boolean;
};

/** Thickness of a collapsed dock's rail, across its side. */
export const DOCK_RAIL_SIZE = 32;

export type DockPlacements = Partial<Record<DockSurface, DockPlacement>>;

export type DockGridStyle = {
  gridTemplateRows: string;
  gridTemplateColumns: string;
  gridTemplateAreas: string;
};

/** Earlier surfaces keep their side when two open docks ask for the same one. */
export const DOCK_SURFACES: readonly DockSurface[] = ["terminal", "changes"];

const SIDES: readonly DockSide[] = ["bottom", "right", "left", "top"];

const OPPOSITE: Record<DockSide, DockSide> = {
  top: "bottom",
  bottom: "top",
  left: "right",
  right: "left",
};

export const DEFAULT_CHANGES_DOCK: DockPlacement = {
  side: "right",
  size: DOCK_SIZE_DEFAULT.right,
  open: false,
};

/** A fresh window's changes dock: open on the right, wide enough to edit in. */
export const INITIAL_CHANGES_DOCK: DockPlacement = {
  side: "right",
  size: 520,
  open: true,
};

/** INITIAL_CHANGES_DOCK, with its size clamped to the window like any dock. */
export function initialChangesDock(viewport?: {
  width: number;
  height: number;
}): DockPlacement {
  const { side, size } = INITIAL_CHANGES_DOCK;
  return { ...INITIAL_CHANGES_DOCK, size: clampDockSize(side, size, viewport) };
}

/** The open docks, in priority order. */
export function openDocks(placements: DockPlacements): DockEntry[] {
  const entries: DockEntry[] = [];
  for (const surface of DOCK_SURFACES) {
    const placement = placements[surface];
    if (!placement?.open) continue;
    entries.push({ surface, side: placement.side, size: placement.size });
  }
  return entries;
}

/**
 * The docks to draw: open docks as openDocks gives them, plus a collapsed rail
 * for each closed surface that `rails` asks to keep on screen. A rail keeps
 * its side, so the surface can be reopened from the edge it was on.
 */
export function layoutDocks(
  placements: DockPlacements,
  rails: { changes: boolean },
): DockEntry[] {
  const entries: DockEntry[] = [];
  for (const surface of DOCK_SURFACES) {
    const placement = placements[surface];
    if (!placement) continue;
    if (placement.open) {
      entries.push({ surface, side: placement.side, size: placement.size });
    } else if (surface === "changes" && rails.changes) {
      entries.push({
        surface,
        side: placement.side,
        size: DOCK_RAIL_SIZE,
        collapsed: true,
      });
    }
  }
  return entries;
}

/**
 * At most one dock per side. Two docks can still be saved on one side, since
 * the terminal follows the project and the changes dock does not, so a later
 * dock gives way to the opposite side, or else the first free one.
 */
export function resolveDockSides(docks: readonly DockEntry[]): DockEntry[] {
  const taken = new Set<DockSide>();
  return docks.map((dock) => {
    const side =
      [dock.side, OPPOSITE[dock.side], ...SIDES].find((s) => !taken.has(s)) ??
      dock.side;
    taken.add(side);
    // Only the side changes, so a drag starts from the size that is drawn.
    return side === dock.side ? dock : { ...dock, side };
  });
}

/**
 * One grid with VS Code's panel geometry: left and right docks are full-height
 * columns, while top and bottom docks are rows inside the middle column, so
 * they span only the main area's width. A single grid, rather than two nested
 * ones, lets a dock change side without changing parent, which would remount
 * it and kill a terminal's shell.
 */
export function dockLayoutStyle(docks: readonly DockEntry[]): DockGridStyle {
  const at = (side: DockSide) => docks.find((dock) => dock.side === side);
  const px = (dock: DockEntry) => `${Math.max(1, Math.round(dock.size))}px`;
  const fill = "minmax(0, 1fr)";
  const top = at("top");
  const bottom = at("bottom");
  const left = at("left");
  const right = at("right");
  const columns = [left && px(left), fill, right && px(right)];
  const rows = [top && px(top), fill, bottom && px(bottom)];
  const centers = [top && "top", "main", bottom && "bottom"];
  const areas = centers
    .filter((center): center is string => !!center)
    .map((center) => {
      const cells = [left && "left", center, right && "right"];
      return `"${cells.filter(Boolean).join(" ")}"`;
    });
  return {
    gridTemplateRows: rows.filter(Boolean).join(" "),
    gridTemplateColumns: columns.filter(Boolean).join(" "),
    gridTemplateAreas: areas.join(" "),
  };
}

export function applyDockLayoutStyle(
  el: HTMLElement,
  docks: readonly DockEntry[],
): void {
  const style = dockLayoutStyle(docks);
  el.style.gridTemplateRows = style.gridTemplateRows;
  el.style.gridTemplateColumns = style.gridTemplateColumns;
  el.style.gridTemplateAreas = style.gridTemplateAreas;
}

function withSide(
  placement: DockPlacement,
  side: DockSide,
  viewport?: { width: number; height: number },
): DockPlacement {
  return { ...placement, side, size: clampDockSize(side, placement.size, viewport) };
}

/**
 * Moves one dock to `side`. An open dock already there swaps to the mover's
 * previous side. Unchanged placements keep their identity.
 */
export function moveDockToSide(
  placements: DockPlacements,
  surface: DockSurface,
  side: DockSide,
  viewport?: { width: number; height: number },
): DockPlacements {
  const mover = placements[surface];
  if (!mover || mover.side === side) return placements;
  const next: DockPlacements = {
    ...placements,
    [surface]: withSide(mover, side, viewport),
  };
  for (const other of DOCK_SURFACES) {
    const placement = placements[other];
    if (other === surface || !placement?.open || placement.side !== side) continue;
    next[other] = withSide(placement, mover.side, viewport);
  }
  return next;
}
