import { Minus, Plus, Undo2 } from "../../../shared/ui/icons";
import { formatInteger } from "../../../shared/lib/numbers";
import type { GitChangedFile } from "../../../platform/tauri/fs";
import { useProjectDiffStats } from "../hooks/useProjectDiffStats";
import {
  statusColor,
  statusLetter,
  type ChangeActions,
} from "../model/changeActions";

const ICON_BUTTON =
  "grid size-6 shrink-0 place-items-center rounded text-content/60 hover:bg-content/10 hover:text-content disabled:opacity-40";

/** The always-visible row above the diffs: the count, totals and bulk git actions. */
export function ChangeBulkRow({
  cwd,
  fileCount,
  actions,
}: {
  cwd: string;
  fileCount: number;
  actions: ChangeActions;
}) {
  const stats = useProjectDiffStats(cwd, true);
  const { busy, stagedCount, unstagedCount, onAll } = actions;
  return (
    <div className="flex h-8 shrink-0 items-center gap-1 border-b border-stroke pr-1 pl-3">
      <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-[11.5px] text-content/60">
        <span>
          {fileCount} {fileCount === 1 ? "file" : "files"}
        </span>
        {stats && stats.additions > 0 ? (
          <span className="text-success tabular-nums">
            +{formatInteger(stats.additions)}
          </span>
        ) : null}
        {stats && stats.deletions > 0 ? (
          <span className="text-danger tabular-nums">
            -{formatInteger(stats.deletions)}
          </span>
        ) : null}
      </span>
      {unstagedCount > 0 ? (
        <button
          type="button"
          title="Discard All Changes"
          aria-label="Discard All Changes"
          disabled={busy !== null}
          onClick={() => onAll("discard")}
          className={ICON_BUTTON}
        >
          <Undo2 className="size-3.5" strokeWidth={1.75} />
        </button>
      ) : null}
      {stagedCount > 0 ? (
        <button
          type="button"
          title="Unstage All Changes"
          aria-label="Unstage All Changes"
          disabled={busy !== null}
          onClick={() => onAll("unstage")}
          className={ICON_BUTTON}
        >
          <Minus className="size-3.5" strokeWidth={1.75} />
        </button>
      ) : null}
      {unstagedCount > 0 ? (
        <button
          type="button"
          title="Stage All Changes"
          aria-label="Stage All Changes"
          disabled={busy !== null}
          onClick={() => onAll("stage")}
          className={ICON_BUTTON}
        >
          <Plus className="size-3.5" strokeWidth={1.75} />
        </button>
      ) : null}
    </div>
  );
}

/** A file header's status letter and its per-file git buttons. */
export function ChangeFileActions({
  file,
  actions,
}: {
  file: GitChangedFile;
  actions: ChangeActions;
}) {
  const { busy, onAction } = actions;
  const canStage = file.unstaged || file.status === "untracked";
  return (
    <>
      <span
        title={file.status}
        className={`w-3.5 shrink-0 text-center font-mono text-[11px] font-semibold ${statusColor(file.status)}`}
      >
        {statusLetter(file.status)}
      </span>
      {canStage ? (
        <>
          <button
            type="button"
            title="Discard Changes"
            aria-label="Discard Changes"
            disabled={busy !== null}
            onClick={() => onAction(file, "discard")}
            className={ICON_BUTTON}
          >
            <Undo2 className="size-3.5" strokeWidth={1.75} />
          </button>
          <button
            type="button"
            title="Stage Changes"
            aria-label="Stage Changes"
            disabled={busy !== null}
            onClick={() => onAction(file, "stage")}
            className={ICON_BUTTON}
          >
            <Plus className="size-3.5" strokeWidth={1.75} />
          </button>
        </>
      ) : null}
      {file.staged ? (
        <button
          type="button"
          title="Unstage Changes"
          aria-label="Unstage Changes"
          disabled={busy !== null}
          onClick={() => onAction(file, "unstage")}
          className={ICON_BUTTON}
        >
          <Minus className="size-3.5" strokeWidth={1.75} />
        </button>
      ) : null}
    </>
  );
}
