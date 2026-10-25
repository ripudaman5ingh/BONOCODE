import { invoke } from "@tauri-apps/api/core";

export type GithubPrAction =
  "merge" | "squash" | "rebase" | "draft" | "ready" | "close" | "reopen";

/** Run a state-changing pull request action and return GitHub's fresh PR state. */
export function githubPrAction<
  T extends { state: string; draft: boolean } = { state: string; draft: boolean },
>(cwd: string, repo: string, number: number, action: GithubPrAction): Promise<T> {
  return invoke<T>("git_github_pr_action", { cwd, repo, number, action });
}
