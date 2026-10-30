import type { HarnessId } from "../../../features/sessions/model/session";
import { isHarnessAvailable } from "./availability";
import type { PrContent } from "../../../features/source-control/model/gitText";
import {
  generateHarnessCommitMessage,
  generateHarnessPrContent,
  textCapableHarnesses,
  warmupHarnessText,
} from "./registry";

/** Pick the harness used for titles, commit messages, and PR text. */
export function pickTextHarness(preferred?: HarnessId): HarnessId {
  const capable = textCapableHarnesses();
  if (
    preferred &&
    capable.includes(preferred) &&
    isHarnessAvailable(preferred)
  ) {
    return preferred;
  }
  const fallback = capable.find((id) => isHarnessAvailable(id));
  return fallback ?? preferred ?? "claude";
}

export function warmupText(cwd: string, preferred?: HarnessId): Promise<void> {
  return warmupHarnessText(pickTextHarness(preferred), cwd);
}

export function generateCommitMessage(
  cwd: string,
  preferred?: HarnessId,
  signal?: AbortSignal,
): Promise<string> {
  return generateHarnessCommitMessage(pickTextHarness(preferred), cwd, signal);
}

export function generatePrContent(
  cwd: string,
  preferred?: HarnessId,
): Promise<(PrContent & { base: string; head: string }) | null> {
  return generateHarnessPrContent(pickTextHarness(preferred), cwd);
}
