import { useRef } from "react";
import { type ProjectReturnMemory } from "../model/projectReturn";
import { type ResumedWorkspace } from "../../../app/model/appLifecycle";
import { useWorkspaceStore, type WorkspaceStore } from "../../workspace/model/workspaceStore";

export type UseProjectStateDeps = {
  workspace: WorkspaceStore;
  resumed: ResumedWorkspace | null;
};

export function useProjectState(deps: UseProjectStateDeps) {
  const { workspace, resumed } = deps;

  const projectCwd = useWorkspaceStore(workspace, (state) => state.projectCwd);
  const recents = useWorkspaceStore(workspace, (state) => state.recents);

  const projectReturnRef = useRef<ProjectReturnMemory>(
    resumed?.projectReturnMemory ?? new Map(),
  );

  return { projectCwd, recents, projectReturnRef };
}
