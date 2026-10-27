import { useRef, useState } from "react";
import { type WorkspaceTab } from "../model/layout";
import { emptyTabVisitHistory } from "../model/tabVisitHistory";
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

  const [tabs, setTabs] = useState<WorkspaceTab[]>(
    () => windowTransfer?.tabs ?? resumed?.tabs ?? [seed.tab],
  );

  const [activeTabId, setActiveTabId] = useState(
    () => windowTransfer?.activeTabId ?? resumed?.activeTabId ?? seed.tab.id,
  );

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

  const tabsRef = useRef(tabs);

  tabsRef.current = tabs;

  const activeTabIdRef = useRef(activeTabId);

  activeTabIdRef.current = activeTabId;

  const tabVisitRef = useRef(emptyTabVisitHistory(activeTabId));

  const tabVisitFromHistoryRef = useRef(false);

  const [tabVisitNav, setTabVisitNav] = useState({
    canBack: false,
    canForward: false,
  });

  const workspaceSyncKey = useRef<string | null>(null);

  return { tabs, setTabs, activeTabId, setActiveTabId, composerFocused, setComposerFocused, composerFocusToken, setComposerFocusToken, tabProjectsRef, tabsRef, activeTabIdRef, tabVisitRef, tabVisitFromHistoryRef, tabVisitNav, setTabVisitNav, workspaceSyncKey };
}
