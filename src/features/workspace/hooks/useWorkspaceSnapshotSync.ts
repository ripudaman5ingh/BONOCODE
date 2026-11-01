import { useEffect, useRef, type RefObject } from "react";
import { useWorkspaceStore, type WorkspaceStore } from "../model/workspaceStore";
import { collectWorkspaceSnapshot, workspaceSnapshotKey } from "../model/workspaceSnapshot";
import { saveWorkspaceSnapshot } from "../../sessions/data/sessionStore";
import { type Session } from "../../sessions/model/session";
import { reconcileProjectReturn, type ProjectReturnMemory } from "../../projects/model/projectReturn";
import { type WindowTransferPayload } from "../../../app/model/windowTransfer";

const SAVE_DELAY_MS = 250;

export type UseWorkspaceSnapshotSyncDeps = {
  workspace: WorkspaceStore;
  sessions: Session[];
  projectReturnRef: RefObject<ProjectReturnMemory>;
  windowTransfer: WindowTransferPayload | null;
  workspaceSyncKey: RefObject<string | null>;
};

/**
 * Debounced save of the workspace snapshot. The timer lives in a ref so that a
 * re-run with an unchanged key (sessions change many times a second while an
 * agent streams) leaves the pending save alone instead of cancelling it.
 */
export function useWorkspaceSnapshotSync({
  workspace,
  sessions,
  projectReturnRef,
  windowTransfer,
  workspaceSyncKey,
}: UseWorkspaceSnapshotSyncDeps) {
  const tabs = useWorkspaceStore(workspace, (state) => state.tabs);
  const activeTabId = useWorkspaceStore(workspace, (state) => state.activeTabId);
  const projectCwd = useWorkspaceStore(workspace, (state) => state.projectCwd);
  const projectTerminals = useWorkspaceStore(workspace, (state) => state.projectTerminals);
  const lastDockSide = useWorkspaceStore(workspace, (state) => state.lastDockSide);
  const changesDock = useWorkspaceStore(workspace, (state) => state.changesDock);
  const pendingSave = useRef<number | null>(null);

  useEffect(() => {
    if (windowTransfer) return;
    const snapshot = collectWorkspaceSnapshot(
      tabs,
      sessions,
      activeTabId,
      projectCwd,
      reconcileProjectReturn({
        memory: projectReturnRef.current,
        tabs,
        sessions,
        activeTabId,
      }),
      projectTerminals,
      lastDockSide ?? undefined,
      changesDock,
    );
    const key = workspaceSnapshotKey(snapshot);
    if (workspaceSyncKey.current === key) return;
    workspaceSyncKey.current = key;
    if (pendingSave.current !== null) window.clearTimeout(pendingSave.current);
    pendingSave.current = window.setTimeout(() => {
      pendingSave.current = null;
      void saveWorkspaceSnapshot(snapshot).catch(() => undefined);
    }, SAVE_DELAY_MS);
  }, [
    tabs,
    sessions,
    activeTabId,
    projectCwd,
    projectTerminals,
    lastDockSide,
    changesDock,
    windowTransfer,
  ]);

  useEffect(() => {
    return () => {
      if (pendingSave.current !== null) window.clearTimeout(pendingSave.current);
    };
  }, []);
}
