import { type EditorNavigationTarget } from "../../search/model/search";
import { type WindowTransferPayload } from "../../../app/model/windowTransfer";
import { useCallback, useRef, useState } from "react";

export type OpenFilesDeps = {
  windowTransfer: WindowTransferPayload | null;
  onPinFile: (fileId: string) => void;
};

export function useOpenFiles(deps: OpenFilesDeps) {
  const { windowTransfer, onPinFile } = deps;

  const [editorNavigation, setEditorNavigation] =
    useState<EditorNavigationTarget | null>(null);
  const editorNavigationToken = useRef(0);

  const [dirtyFiles, setDirtyFiles] = useState<Set<string>>(
    () => new Set(windowTransfer?.dirtyFileIds ?? []),
  );
  // Not carried across a window transfer the way dirty state is: the editor
  // re-lints whatever it mounts, so the counts rebuild themselves.
  const [fileErrorCounts, setFileErrorCounts] = useState<Map<string, number>>(
    () => new Map(),
  );

  const dirtyFilesRef = useRef(dirtyFiles);
  dirtyFilesRef.current = dirtyFiles;

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
    [onPinFile],
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
    setDirtyFiles,
    fileErrorCounts,
    dirtyFilesRef,
    onFileDirtyChange,
    onFileErrorCountChange,
  };
}
