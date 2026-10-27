import { useRef } from "react";

export function useWorktreeState() {

  const switchingWorktrees = useRef(new Map<string, string>());

  const removingWorktreePaths = useRef(new Set<string>());

  return { switchingWorktrees, removingWorktreePaths };
}
