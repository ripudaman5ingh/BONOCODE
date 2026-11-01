import { useEffect, useRef, type RefObject } from "react";
import { type WorkspaceTab } from "../model/layout";
import { collectWorkspaceSnapshot, workspaceSnapshotKey } from "../model/workspaceSnapshot";
import { saveWorkspaceSnapshot } from "../../sessions/data/sessionStore";
import { type Session } from "../../sessions/model/session";
import { reconcileProjectReturn, type ProjectReturnMemory } from "../../projects/model/projectReturn";
import { type DockSide, type ProjectTerminalDock } from "../../projects/model/projectTerminal";
import { type WindowTransferPayload } from "../../../app/model/windowTransfer";

const SAVE_DELAY_MS = 250;

export type UseWorkspaceSnapshotSyncDeps = {
  tabs: WorkspaceTab[];
  sessions: Session[];
  activeTabId: string;
  projectCwd: string;
  projectReturnRef: RefObject<ProjectReturnMemory>;
  projectTerminals: ProjectTerminalDock[];
  lastDockSide: DockSide | null;
  windowTransfer: WindowTransferPayload | null;
  workspaceSyncKey: RefObject<string | null>;
};

/**
 * Debounced save of the workspace snapshot. The timer lives in a ref so that a
 * re-run with an unchanged key (sessions change many times a second while an
 * agent streams) leaves the pending save alone instead of cancelling it.
 */
export function useWorkspaceSnapshotSync({
  tabs,
  sessions,
  activeTabId,
  projectCwd,
  projectReturnRef,
  projectTerminals,
  lastDockSide,
  windowTransfer,
  workspaceSyncKey,
}: UseWorkspaceSnapshotSyncDeps) {
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
    windowTransfer,
  ]);

  useEffect(() => {
    return () => {
      if (pendingSave.current !== null) window.clearTimeout(pendingSave.current);
    };
  }, []);
}
