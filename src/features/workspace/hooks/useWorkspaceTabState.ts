import { useRef, useState } from "react";
import { emptyTabVisitHistory } from "../model/tabVisitHistory";
import { useWorkspaceStore, type WorkspaceStore } from "../model/workspaceStore";
import { type WindowTransferPayload } from "../../../app/model/windowTransfer";
import { type ResumedWorkspace } from "../../../app/model/appLifecycle";

export type UseWorkspaceTabStateDeps = {
  workspace: WorkspaceStore;
  windowTransfer: WindowTransferPayload | null;
  resumed: ResumedWorkspace | null;
};

export function useWorkspaceTabState(deps: UseWorkspaceTabStateDeps) {
  const {
    workspace,
    windowTransfer,
    resumed,
  } = deps;

  const tabs = useWorkspaceStore(workspace, (state) => state.tabs);
  const activeTabId = useWorkspaceStore(workspace, (state) => state.activeTabId);

  const [composerFocused, setComposerFocused] = useState(() => {
    if (windowTransfer) return true;
    if (!resumed) return false;
    const tab =
      resumed.tabs.find((entry) => entry.id === resumed.activeTabId) ??
      resumed.tabs[0];
    return (
      !!tab && resumed.sessions.some((session) => session.id === tab.focusedId)
    );
  });

  const [composerFocusToken, setComposerFocusToken] = useState(0);

  /** Tab id -> project name, kept in sync with the rendered title tabs. */
  const tabProjectsRef = useRef(new Map<string, string>());

  const tabVisitRef = useRef(emptyTabVisitHistory(activeTabId));

  const tabVisitFromHistoryRef = useRef(false);

  const [tabVisitNav, setTabVisitNav] = useState({
    canBack: false,
    canForward: false,
  });

  const workspaceSyncKey = useRef<string | null>(null);

  return { tabs, activeTabId, composerFocused, setComposerFocused, composerFocusToken, setComposerFocusToken, tabProjectsRef, tabVisitRef, tabVisitFromHistoryRef, tabVisitNav, setTabVisitNav, workspaceSyncKey };
}
