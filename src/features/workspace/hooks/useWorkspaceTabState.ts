import { useRef, useState } from "react";
import { type WorkspaceTab } from "../model/layout";
import { emptyTabVisitHistory } from "../model/tabVisitHistory";
import { createWorkspaceStore, useWorkspaceStore } from "../model/workspaceStore";
import { type WindowTransferPayload } from "../../../app/model/windowTransfer";
import { type ResumedWorkspace } from "../../../app/model/appLifecycle";
import { type Session } from "../../sessions/model/session";

export type UseWorkspaceTabStateDeps = {
  windowTransfer: WindowTransferPayload | null;
  resumed: ResumedWorkspace | null;
  seed: { session: Session; tab: WorkspaceTab };
};

export function useWorkspaceTabState(deps: UseWorkspaceTabStateDeps) {
  const {
    windowTransfer,
    resumed,
    seed,
  } = deps;

  const [workspace] = useState(() =>
    createWorkspaceStore({
      tabs: windowTransfer?.tabs ?? resumed?.tabs ?? [seed.tab],
      activeTabId:
        windowTransfer?.activeTabId ?? resumed?.activeTabId ?? seed.tab.id,
    }),
  );

  const tabs = useWorkspaceStore(workspace, (state) => state.tabs);
  const activeTabId = useWorkspaceStore(workspace, (state) => state.activeTabId);
  const { setTabs, setActiveTabId, tabsRef, activeTabIdRef } = workspace;

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

  return { workspace, tabs, setTabs, activeTabId, setActiveTabId, composerFocused, setComposerFocused, composerFocusToken, setComposerFocusToken, tabProjectsRef, tabsRef, activeTabIdRef, tabVisitRef, tabVisitFromHistoryRef, tabVisitNav, setTabVisitNav, workspaceSyncKey };
}
