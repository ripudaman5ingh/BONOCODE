import { useProjectDiffStats } from "../hooks/useProjectDiffStats";
import { type DockSide } from "../../projects/model/projectTerminal";
import { ALT, MOD } from "../../../platform/tauri/platform";
import { formatInteger } from "../../../shared/lib/numbers";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
} from "../../../shared/ui/icons";

type Props = {
  /** The active chat's git cwd, the same one the open dock would show. */
  gitCwd: string;
  side: DockSide;
  onShow: () => void;
};

/** Points back toward the main area, the opposite of the dock's hide chevron. */
const CHEVRON = {
  top: ChevronDown,
  bottom: ChevronUp,
  left: ChevronRight,
  right: ChevronLeft,
} as const;

/** The edge that faces the main area, as DockFrame draws it. */
const BORDER = {
  top: "border-b",
  bottom: "border-t",
  left: "border-r",
  right: "border-l",
} as const;

/** The rail's counts stay short; the tooltip and label carry the full numbers. */
function compact(n: number): string {
  if (n < 1_000) return formatInteger(n);
  // Floor rather than round, so 9,999 reads 9.9k instead of 10.0k.
  if (n < 10_000) return `${(Math.floor(n / 100) / 10).toFixed(1)}k`;
  return `${Math.floor(n / 1_000)}k`;
}

/** A closed Changes dock's stand-in on its side: click to reopen it. */
export function ChangesDockRail({ gitCwd, side, onShow }: Props) {
  const stats = useProjectDiffStats(gitCwd, true);
  const files = stats?.files ?? 0;
  const additions = stats?.additions ?? 0;
  const deletions = stats?.deletions ?? 0;
  const Chevron = CHEVRON[side];
  const vertical = side === "left" || side === "right";
  const summary =
    files > 0
      ? `: ${files} ${files === 1 ? "file" : "files"}, +${formatInteger(additions)} -${formatInteger(deletions)}`
      : "";
  const label = `Show Changes (${MOD}${ALT}B)${summary}`;

  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onShow}
      className={`flex h-full w-full min-h-0 min-w-0 items-center text-[10px] font-semibold tabular-nums text-content/50 hover:bg-content/8 hover:text-content ${BORDER[side]} border-stroke ${
        vertical ? "flex-col gap-1.5 pt-2.5" : "flex-row gap-2 px-3"
      }`}
    >
      <Chevron className="size-3.5 shrink-0" strokeWidth={1.75} />
      {additions > 0 ? (
        <span className="text-success">+{compact(additions)}</span>
      ) : null}
      {deletions > 0 ? (
        <span className="text-danger">-{compact(deletions)}</span>
      ) : null}
    </button>
  );
}
