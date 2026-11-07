/** A manual pick between the Changes dock and the PR panel; null = automatic. */
export type PrFocusOverride = "changes" | "pr" | null;

export type PrFocusMemory = {
  /** Identifies the open PR panel; a different key drops the override. */
  key: string;
  hasChanges: boolean;
  override: PrFocusOverride;
};

export type PrFocus = { changesCollapsed: boolean; prVisible: boolean };

/**
 * Decides which of the Changes dock and an open PR panel gets the right side.
 * Without a PR panel nothing is collapsed or hidden. A Changes dock the user
 * closed stays closed, so the PR panel is never hidden behind a bare rail.
 * Until the diff stats have loaded the rule is not applied at all: guessing
 * "no changes" would collapse Changes only to reopen it a moment later.
 */
export function resolveChangesPrFocus({
  prOpen,
  hasChanges,
  override,
  changesOpen = true,
  loaded = true,
}: {
  prOpen: boolean;
  hasChanges: boolean;
  override: PrFocusOverride;
  changesOpen?: boolean;
  loaded?: boolean;
}): PrFocus {
  if (!prOpen || !changesOpen || !loaded) return { changesCollapsed: false, prVisible: true };
  const showPr = (override ?? (hasChanges ? "changes" : "pr")) === "pr";
  return { changesCollapsed: showPr, prVisible: showPr };
}

/** The manual choice only lasts until the changes state flips or the PR changes. */
export function syncPrFocusMemory(
  memory: PrFocusMemory,
  key: string,
  hasChanges: boolean,
): PrFocusMemory {
  return memory.key === key && memory.hasChanges === hasChanges
    ? memory
    : { key, hasChanges, override: null };
}
