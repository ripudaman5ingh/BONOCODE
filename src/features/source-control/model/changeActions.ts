import type { GitChangedFile } from "../../../platform/tauri/fs";

/** Git actions the changes dock offers on its changed files. */
export type ChangeActions = {
  /** The label of the running git mutation; every action waits for it to clear. */
  busy: string | null;
  onAction: (
    file: GitChangedFile,
    action: "stage" | "unstage" | "discard",
  ) => void;
  onAll: (action: "stage" | "unstage" | "discard") => void;
  stagedCount: number;
  unstagedCount: number;
};

export function statusLetter(status: string): string {
  if (status === "untracked") return "U";
  if (status === "added") return "A";
  if (status === "deleted") return "D";
  return "M";
}

export function statusColor(status: string): string {
  if (status === "untracked") return "text-info";
  if (status === "added") return "text-success";
  if (status === "deleted") return "text-danger";
  return "text-warning";
}
