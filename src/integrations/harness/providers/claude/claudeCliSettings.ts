import { loadProjectNotesFolder } from "../../../../features/projects/model/projectNotesFolder";
import { loadClaudeHooks } from "../../../../features/settings/model/settings";
import {
  claudeSettingsKey,
  isClaudeUltracodeEffort,
  type ClaudeCliSettings,
} from "./claudeProtocol";
import type { HarnessSessionInput } from "../../core/types";

/**
 * The notes folder linked to the session's project. Worktree sessions run in
 * another directory, so the project path wins over the execution path.
 */
export function claudeNotesFolder(
  input: Pick<HarnessSessionInput, "cwd" | "projectCwd">,
): string | null {
  return loadProjectNotesFolder(input.projectCwd ?? input.cwd);
}

/** Process-restart key: a launch setting that changes must respawn Claude. */
export function claudeLaunchKey(
  input: HarnessSessionInput,
  model: string,
): string {
  const notes = claudeNotesFolder(input);
  return `${input.providerAccountId ?? "default"}:${claudeSettingsKey({
    model,
    effort: input.modelSettings?.effort,
    fast: input.modelSettings?.fast,
    thinking: input.modelSettings?.thinking,
    context: input.modelSettings?.context,
    runtimeMode: input.runtimeMode,
    hooks: loadClaudeHooks(),
  })}${notes ? `|notes:${notes}` : ""}`;
}

/** The `--settings` payload for an interactive session, or undefined when empty. */
export function claudeCliSettings(
  input: HarnessSessionInput,
): ClaudeCliSettings | undefined {
  const settings: ClaudeCliSettings = {};
  if (input.modelSettings?.thinking === "true") {
    settings.alwaysThinkingEnabled = true;
  }
  if (input.modelSettings?.fast === "true") settings.fastMode = true;
  if (isClaudeUltracodeEffort(input.modelSettings?.effort)) {
    settings.ultracode = true;
  }
  if (!loadClaudeHooks()) settings.disableAllHooks = true;
  const notes = claudeNotesFolder(input);
  if (notes) settings.permissions = { additionalDirectories: [notes] };
  return Object.keys(settings).length > 0 ? settings : undefined;
}
