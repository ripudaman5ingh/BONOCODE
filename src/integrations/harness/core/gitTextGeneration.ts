import {
  gitRangeContext,
  gitStagedContext,
} from "../../../platform/tauri/fs";
import {
  buildBranchNamePrompt,
  buildCommitMessagePrompt,
  buildPrContentPrompt,
  formatCommitMessage,
  parseBranchName,
  parseCommitMessage,
  parsePrContent,
  type PrContent,
} from "../../../features/source-control/model/gitText";
import type { TextPromptInput } from "./registry";

export type TextRunner = (input: TextPromptInput) => Promise<string>;

const GIT_TEXT_TIMEOUT_MS = 90_000;

export async function generateCommitMessageWith(
  run: TextRunner,
  cwd: string,
  signal?: AbortSignal,
): Promise<string> {
  signal?.throwIfAborted();
  const context = await gitStagedContext(cwd);
  signal?.throwIfAborted();
  const output = await run({
    cwd,
    prompt: buildCommitMessagePrompt({
      branch: context.branch,
      stagedSummary: context.summary,
      stagedPatch: context.patch,
    }),
    timeoutMs: GIT_TEXT_TIMEOUT_MS,
    signal,
  });
  const parsed = parseCommitMessage(output);
  if (parsed) return formatCommitMessage(parsed);
  const snippet = output.trim().replace(/\s+/g, " ").slice(0, 240);
  throw new Error(
    snippet
      ? `Could not generate a commit message. Model replied: ${snippet}`
      : "Could not generate a commit message. The agent returned no text.",
  );
}

export async function generatePrContentWith(
  run: TextRunner,
  cwd: string,
): Promise<(PrContent & { base: string; head: string }) | null> {
  const range = await gitRangeContext(cwd);
  let parsed: PrContent | null = null;
  try {
    const output = await run({
      cwd,
      prompt: buildPrContentPrompt({
        baseBranch: range.base,
        headBranch: range.head,
        commitSummary: range.commitSummary,
        diffSummary: range.diffSummary,
        diffPatch: range.diffPatch,
      }),
      timeoutMs: GIT_TEXT_TIMEOUT_MS,
    });
    parsed = parsePrContent(output);
  } catch (error) {
    console.debug("[bonocode] pr content", error);
  }
  const title =
    parsed?.title ||
    range.commitSummary.split(/\r?\n/)[0]?.trim() ||
    `Update ${range.head}`;
  return {
    title,
    body: parsed?.body || range.commitSummary.trim(),
    base: range.base,
    head: range.head,
  };
}

export async function generateBranchNameWith(
  run: TextRunner,
  cwd: string,
  message: string,
): Promise<string | null> {
  try {
    const output = await run({
      cwd,
      prompt: buildBranchNamePrompt(message),
      timeoutMs: GIT_TEXT_TIMEOUT_MS,
    });
    return parseBranchName(output);
  } catch (error) {
    console.debug("[bonocode] branch name", error);
    return null;
  }
}
