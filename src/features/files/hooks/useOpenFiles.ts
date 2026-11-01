import { type EditorNavigationTarget } from "../../search/model/search";
import { useWorkspaceStore, type WorkspaceStore } from "../../workspace/model/workspaceStore";
import { useCallback, useRef, useState } from "react";

export type OpenFilesDeps = {
  workspace: WorkspaceStore;
  onPinFile: (fileId: string) => void;
};

export function useOpenFiles(deps: OpenFilesDeps) {
  const { workspace, onPinFile } = deps;
  const { setDirtyFiles } = workspace;

  const [editorNavigation, setEditorNavigation] =
    useState<EditorNavigationTarget | null>(null);
  const editorNavigationToken = useRef(0);

  const dirtyFiles = useWorkspaceStore(workspace, (state) => state.dirtyFiles);
  // Not carried across a window transfer the way dirty state is: the editor
  // re-lints whatever it mounts, so the counts rebuild themselves.
  const [fileErrorCounts, setFileErrorCounts] = useState<Map<string, number>>(
    () => new Map(),
  );

  const onFileDirtyChange = useCallback(
    (fileId: string, dirty: boolean) => {
      // An edited preview must not be replaced by the next click.
      if (dirty) onPinFile(fileId);
      setDirtyFiles((prev) => {
        if (prev.has(fileId) === dirty) return prev;
        const next = new Set(prev);
        if (dirty) next.add(fileId);
        else next.delete(fileId);
        return next;
      });
    },
    [onPinFile, setDirtyFiles],
  );

  /** The editor reports 0 as it unmounts, so closed tabs drop out on their own. */
  const onFileErrorCountChange = useCallback(
    (fileId: string, count: number) => {
      setFileErrorCounts((prev) => {
        if ((prev.get(fileId) ?? 0) === count) return prev;
        const next = new Map(prev);
        if (count > 0) next.set(fileId, count);
        else next.delete(fileId);
        return next;
      });
    },
    [],
  );

  return {
    editorNavigation,
    setEditorNavigation,
    editorNavigationToken,
    dirtyFiles,
    fileErrorCounts,
    onFileDirtyChange,
    onFileErrorCountChange,
  };
}
