import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearGithubWorkItemCache,
  githubPrDiff,
  githubWorkItemComment,
  githubWorkItemDetails,
  githubWorkItemThread,
  peekGithubWorkItemDetails,
  type GithubWorkItem,
} from "./githubTasks";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

beforeEach(() => {
  clearGithubWorkItemCache();
  vi.mocked(invoke).mockReset();
});

function workItem(repo: string, kind: "issue" | "pr"): GithubWorkItem {
  return {
    kind,
    number: 10,
    title: `${repo} item`,
    url: `https://github.com/${repo}/${kind === "pr" ? "pull" : "issues"}/10`,
    state: "open",
    updatedAt: "2026-09-16T08:00:00Z",
    labels: [],
    assignees: [],
    draft: false,
    repo,
  };
}

describe("repository-qualified GitHub item operations", () => {
  it("passes the repository through and isolates same-number caches", async () => {
    vi.mocked(invoke).mockImplementation(async (command, args) => {
      const input = args as Record<string, unknown>;
      if (command === "git_github_work_item_details") {
        return { body: String(input.repo), author: "octocat" } as never;
      }
      if (command === "git_github_work_item_thread") {
        return {
          comments: [],
          commits: [],
          truncated: false,
          reviewDecision: "",
          baseRefName: "main",
          headRefName: "feature",
        } as never;
      }
      if (command === "git_github_pr_diff") {
        return {
          additions: 1,
          deletions: 0,
          files: [],
          patch: "diff",
          truncated: false,
        } as never;
      }
      if (command === "git_github_work_item_comment") {
        return "https://github.com/acme/web/issues/10#issuecomment-1" as never;
      }
      throw new Error(`Unexpected command: ${command}`);
    });

    await githubWorkItemDetails("/tmp/web", "maya/web", "issue", 10);
    await githubWorkItemDetails("/tmp/web", "acme/web", "issue", 10);
    expect(peekGithubWorkItemDetails("maya/web", "issue", 10)?.body).toBe(
      "maya/web",
    );
    expect(peekGithubWorkItemDetails("acme/web", "issue", 10)?.body).toBe(
      "acme/web",
    );

    await githubWorkItemThread("/tmp/web", "acme/web", "pr", 10);
    await githubPrDiff("/tmp/web", "acme/web", 10);
    await githubWorkItemComment(
      "/tmp/web",
      "acme/web",
      "issue",
      10,
      "Looks good",
    );

    expect(invoke).toHaveBeenCalledWith("git_github_work_item_thread", {
      cwd: "/tmp/web",
      repo: "acme/web",
      kind: "pr",
      number: 10,
    });
    expect(invoke).toHaveBeenCalledWith("git_github_pr_diff", {
      cwd: "/tmp/web",
      repo: "acme/web",
      number: 10,
      fullContext: false,
    });
    expect(invoke).toHaveBeenCalledWith("git_github_work_item_comment", {
      cwd: "/tmp/web",
      repo: "acme/web",
      kind: "issue",
      number: 10,
      body: "Looks good",
      inReplyTo: "",
    });
  });
});
