import { useCallback, useState } from "react";
import { useProjectDiffStats } from "../../source-control/hooks/useProjectDiffStats";
import {
  resolveChangesPrFocus,
  syncPrFocusMemory,
  type PrFocusMemory,
  type PrFocusOverride,
} from "../model/changesPrFocus";

type ActivePanel = {
  sessionId: string;
  item: { kind: "issue" | "pr"; number: number };
};

/**
 * Display-only: picks between the Changes dock and the active session's PR
 * panel. It never writes the dock's saved open state.
 */
export function useChangesPrFocus({
  panel,
  gitCwd,
  changesOpen,
}: {
  panel: ActivePanel | null;
  gitCwd: string;
  changesOpen: boolean;
}) {
  const pr = panel?.item.kind === "pr" ? panel : null;
  const stats = useProjectDiffStats(gitCwd, pr !== null);
  const hasChanges = (stats?.files ?? 0) > 0;
  const key = pr ? `${pr.sessionId}:${pr.item.number}` : "";
  const [stored, setStored] = useState<PrFocusMemory>({
    key,
    hasChanges,
    override: null,
  });
  const memory = syncPrFocusMemory(stored, key, hasChanges);
  if (memory !== stored) setStored(memory);

  const pick = useCallback(
    (override: PrFocusOverride) =>
      setStored((prev) => ({ ...prev, override })),
    [],
  );
  const showChanges = useCallback(() => pick("changes"), [pick]);
  const showPr = useCallback(() => pick("pr"), [pick]);

  return {
    ...resolveChangesPrFocus({
      prOpen: pr !== null,
      hasChanges,
      override: memory.override,
      changesOpen,
      loaded: stats !== null,
    }),
    prChip: pr ? { number: pr.item.number, onShow: showPr } : undefined,
    showChanges,
  };
}
