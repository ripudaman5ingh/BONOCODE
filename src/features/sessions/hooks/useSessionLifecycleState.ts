import { useRef, useState } from "react";
import { type SessionDeleteChoice } from "../ui/DeleteSessionDialog";

export type UseSessionLifecycleStateDeps = {
  liveAgentsEnabled: boolean;
};

export function useSessionLifecycleState(deps: UseSessionLifecycleStateDeps) {
  const {
    liveAgentsEnabled,
  } = deps;

  const [sessionDeleteDialog, setSessionDeleteDialog] = useState<{
    title: string;
    unusedWorktree: string;
    resolve: (choice: SessionDeleteChoice) => void;
  }>();

  const deleteConfirmationPending = useRef(false);

  const removingSessionIds = useRef(new Set<string>());

  const skipForgetSessionIds = useRef(new Set<string>());

  const sessionNavigationIdsRef = useRef<readonly string[]>([]);

  // Tabs are views. Hidden idle sessions drop their child. A visible session
  // keeps its child for a few minutes after a turn so follow-ups stay instant,
  // then parks it and resumes on the next prompt.
  // Dropping a session re-renders the whole app, so it waits until a switch
  // has painted, and a burst of switches pays for it once.
  const detachInputs = useRef({ liveAgentsEnabled });

  detachInputs.current = { liveAgentsEnabled };

  const detachTimer = useRef<number | null>(null);

  return { sessionDeleteDialog, setSessionDeleteDialog, deleteConfirmationPending, removingSessionIds, skipForgetSessionIds, sessionNavigationIdsRef, detachInputs, detachTimer };
}
