import { useState } from "react";
import { gitDeleteBranch, isBranchNotMerged } from "../../../platform/tauri/fs";

type Props = {
  cwd: string;
  name: string;
  mergeTarget: string;
  onDeleted: () => void;
  onCancel: () => void;
  onError: (message: string) => void;
};

export function DeleteBranchConfirm({
  cwd,
  name,
  mergeTarget,
  onDeleted,
  onCancel,
  onError,
}: Props) {
  const [notMerged, setNotMerged] = useState(false);
  const [busy, setBusy] = useState(false);

  const remove = async (force: boolean) => {
    setBusy(true);
    try {
      await gitDeleteBranch(cwd, name, force);
    } catch (err) {
      if (!force && isBranchNotMerged(err)) {
        setNotMerged(true);
        setBusy(false);
        return;
      }
      onError(err instanceof Error ? err.message : String(err));
      return;
    }
    onDeleted();
  };

  return (
    <div className="min-h-0 flex-1 px-3 py-3 text-[13px] leading-5 text-content">
      <p>
        {notMerged
          ? `${name} has commits that aren't on ${mergeTarget}. That's normal after a squash merge. Delete anyway?`
          : `Delete branch ${name}?`}
      </p>
      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={onCancel}
          className="h-7 rounded-md px-2.5 text-[12px] text-content/70 hover:bg-content/8 disabled:opacity-60"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void remove(notMerged)}
          className="h-7 rounded-md px-2.5 text-[12px] text-danger hover:bg-danger/10 disabled:opacity-60"
        >
          {notMerged ? "Delete anyway" : "Delete"}
        </button>
      </div>
    </div>
  );
}
