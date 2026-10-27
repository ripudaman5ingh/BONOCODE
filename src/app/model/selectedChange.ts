import type { GitFileDiffKind } from "../../platform/tauri/fs";
import { displayPath } from "../../shared/lib/paths";
import { focusedFileTab, isCommitTab, isFilesystemTab, type WorkspaceTab } from "../../features/workspace/model/layout";

export function selectedChangePath(
  tab: WorkspaceTab,
  gitCwd?: string,
): string | undefined {
  const file = focusedFileTab(tab);
  if (!file || !isFilesystemTab(file) || !file.review) return undefined;
  return displayPath(file.path, gitCwd || file.cwd);
}

export function selectedChangeKind(tab: WorkspaceTab): GitFileDiffKind | undefined {
  const file = focusedFileTab(tab);
  return file?.review ? file.changeKind : undefined;
}

export function selectedCommitSha(tab: WorkspaceTab): string | undefined {
  const focused = focusedFileTab(tab);
  if (focused && isCommitTab(focused)) return focused.commit.sha;
  for (const pane of tab.editorPanes) {
    const file = pane.files.find((entry) => entry.id === pane.activeFileId);
    if (file && isCommitTab(file)) return file.commit.sha;
  }
}
