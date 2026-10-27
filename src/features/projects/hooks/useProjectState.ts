import { useRef, useState } from "react";
import { lastProjectPath, loadRecents, looksLikeProject, rememberProject } from "../model/recents";
import { type ProjectReturnMemory } from "../model/projectReturn";
import { type WindowTransferPayload } from "../../../app/model/windowTransfer";
import { type ResumedWorkspace } from "../../../app/model/appLifecycle";

export type UseProjectStateDeps = {
  windowTransfer: WindowTransferPayload | null;
  resumed: ResumedWorkspace | null;
};

export function useProjectState(deps: UseProjectStateDeps) {
  const {
    windowTransfer,
    resumed,
  } = deps;

  const [projectCwd, setProjectCwd] = useState(
    () =>
      windowTransfer?.projectCwd ??
      resumed?.projectCwd ??
      lastProjectPath() ??
      "~",
  );

  const [recents, setRecents] = useState(() =>
    resumed?.projectCwd && looksLikeProject(resumed.projectCwd)
      ? rememberProject(resumed.projectCwd)
      : loadRecents(),
  );

  const projectCwdRef = useRef(projectCwd);

  projectCwdRef.current = projectCwd;

  const projectReturnRef = useRef<ProjectReturnMemory>(
    resumed?.projectReturnMemory ?? new Map(),
  );

  return { projectCwd, setProjectCwd, recents, setRecents, projectCwdRef, projectReturnRef };
}
