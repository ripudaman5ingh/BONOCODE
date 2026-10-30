import { invoke } from "@tauri-apps/api/core";
import { normalizeProjectPath } from "../../projects/model/recents";
import { recordInboxSelfActivity } from "./inboxSelfActivity";
import {
  githubPrAction as runGithubPrAction,
  type GithubPrAction,
} from "../../source-control/model/githubPr";

export type GithubTaskKind = "issue" | "pr";
export type InboxKind = GithubTaskKind;

export type GithubLabel = {
  name: string;
  color: string;
};

export type GithubAssignee = {
  login: string;
  avatarUrl?: string;
};

export type GithubWorkItem = {
  kind: GithubTaskKind;
  number: number;
  title: string;
  url: string;
  state: string;
  /** GitHub issue closure reason, such as `completed` or `not_planned`. */
  stateReason?: string;
  createdAt?: string;
  updatedAt: string;
  labels: GithubLabel[];
  assignees: GithubAssignee[];
  draft: boolean;
  repo: string;
};

export type InboxProvider = "github";

export type InboxItem = Omit<GithubWorkItem, "kind"> & {
  kind: InboxKind;
  projectPath: string;
  provider: InboxProvider;
};

export type GithubWorkItemDetails = {
  body: string;
  author: string;
  authorAvatarUrl?: string;
  baseRefName?: string;
  headRefName?: string;
  reviewDecision?: string;
};

export type GithubWorkItemComment = {
  id: string;
  kind: string;
  author: string;
  authorAvatarUrl?: string;
  body: string;
  createdAt: string;
  url: string;
  state: string;
  path: string;
  line: number | null;
  resolved: boolean;
  threadId: string;
  replies: GithubWorkItemComment[];
};

export type GithubWorkItemCommit = {
  oid: string;
  messageHeadline: string;
  author: string;
  committedDate: string;
  url: string;
};

export type GithubWorkItemThread = {
  comments: GithubWorkItemComment[];
  commits: GithubWorkItemCommit[];
  truncated: boolean;
  reviewDecision: string;
  baseRefName: string;
  headRefName: string;
};

export type GithubPrFile = {
  path: string;
  additions: number;
  deletions: number;
};

export type GithubPrDiff = {
  additions: number;
  deletions: number;
  files: GithubPrFile[];
  patch: string;
  truncated: boolean;
};

export type GithubStatus = {
  connected: boolean;
  installed: boolean;
  authenticated: boolean;
};

const repoByPath = new Map<string, string>();
const workItemByKey = new Map<string, GithubWorkItem>();
const workItemInflight = new Map<string, Promise<GithubWorkItem>>();
const detailsByKey = new Map<string, GithubWorkItemDetails>();
const threadByKey = new Map<string, GithubWorkItemThread>();
const threadInflight = new Map<string, Promise<GithubWorkItemThread>>();
const prDiffByKey = new Map<string, GithubPrDiff>();
const prDiffInflight = new Map<string, Promise<GithubPrDiff>>();

/** Forget cached repositories, items, threads and diffs. Tests call this between cases. */
export function clearGithubWorkItemCache() {
  repoByPath.clear();
  workItemByKey.clear();
  workItemInflight.clear();
  detailsByKey.clear();
  threadByKey.clear();
  threadInflight.clear();
  prDiffByKey.clear();
  prDiffInflight.clear();
}

export function githubStatus(): Promise<GithubStatus> {
  return invoke<GithubStatus>("git_github_status");
}

export async function githubRepo(cwd: string): Promise<string> {
  const key = normalizeProjectPath(cwd);
  const cached = repoByPath.get(key);
  if (cached !== undefined) return cached;
  const repo = await invoke<string>("git_github_repo", { cwd });
  repoByPath.set(key, repo);
  return repo;
}

function workItemLookupKey(
  repo: string,
  kind: GithubTaskKind,
  number: number,
): string {
  return `${repo.trim().toLowerCase()}:${kind}:${number}`;
}

export function peekGithubWorkItem(
  repo: string,
  kind: GithubTaskKind,
  number: number,
): GithubWorkItem | null {
  return workItemByKey.get(workItemLookupKey(repo, kind, number)) ?? null;
}

/** Fetch one exact item, reusing the cached copy unless forced. */
export function githubWorkItem(
  cwd: string,
  repo: string,
  kind: GithubTaskKind,
  number: number,
  options?: { force?: boolean },
): Promise<GithubWorkItem> {
  const key = workItemLookupKey(repo, kind, number);
  const cached = workItemByKey.get(key);
  if (cached && !options?.force) return Promise.resolve(cached);
  const pending = workItemInflight.get(key);
  if (pending) return pending;
  const promise = invoke<GithubWorkItem>("git_github_work_item", {
    cwd,
    repo,
    kind,
    number,
  })
    .then((item) => {
      workItemByKey.set(key, item);
      return item;
    })
    .finally(() => {
      if (workItemInflight.get(key) === promise) workItemInflight.delete(key);
    });
  workItemInflight.set(key, promise);
  return promise;
}

export function githubAvatarUrl(login: string, size = 64): string {
  const name = login.trim();
  if (!name) return "";
  return `https://avatars.githubusercontent.com/${encodeURIComponent(name)}?s=${size}`;
}

export function inboxPersonAvatarUrl(
  provider: InboxProvider,
  login: string,
  avatarUrl?: string,
): string {
  const explicit = avatarUrl?.trim() ?? "";
  if (explicit) return explicit;
  if (provider === "github") return githubAvatarUrl(login);
  return "";
}

export function formatRelativeTime(
  iso: string,
  now = Date.now(),
  locale?: string,
): string {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return "";
  const delta = Math.round((then - now) / 1000);
  const abs = Math.abs(delta);
  const divisions: [number, Intl.RelativeTimeFormatUnit][] = [
    [60, "second"],
    [60, "minute"],
    [24, "hour"],
    [7, "day"],
    [4.34524, "week"],
    [12, "month"],
    [Number.POSITIVE_INFINITY, "year"],
  ];
  let value = delta;
  let unit: Intl.RelativeTimeFormatUnit = "second";
  let amount = abs;
  for (const [step, next] of divisions) {
    unit = next;
    if (amount < step) break;
    value = Math.round(value / step);
    amount = Math.abs(value);
  }
  try {
    return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(
      value,
      unit,
    );
  } catch {
    return "";
  }
}

export function detailsCacheKey(
  repo: string,
  kind: GithubTaskKind,
  number: number,
): string {
  return workItemLookupKey(repo, kind, number);
}

export function peekGithubWorkItemDetails(
  repo: string,
  kind: GithubTaskKind,
  number: number,
): GithubWorkItemDetails | null {
  return detailsByKey.get(detailsCacheKey(repo, kind, number)) ?? null;
}

export async function githubWorkItemDetails(
  cwd: string,
  repo: string,
  kind: GithubTaskKind,
  number: number,
): Promise<GithubWorkItemDetails> {
  const details = await invoke<GithubWorkItemDetails>(
    "git_github_work_item_details",
    { cwd, repo, kind, number },
  );
  detailsByKey.set(detailsCacheKey(repo, kind, number), details);
  return details;
}

export function peekGithubWorkItemThread(
  repo: string,
  kind: GithubTaskKind,
  number: number,
): GithubWorkItemThread | null {
  return threadByKey.get(detailsCacheKey(repo, kind, number)) ?? null;
}

export async function githubWorkItemThread(
  cwd: string,
  repo: string,
  kind: GithubTaskKind,
  number: number,
  options?: { force?: boolean },
): Promise<GithubWorkItemThread> {
  const key = detailsCacheKey(repo, kind, number);
  if (options?.force) {
    threadByKey.delete(key);
    threadInflight.delete(key);
  }
  const pending = threadInflight.get(key);
  if (pending) return pending;
  const promise = invoke<GithubWorkItemThread>("git_github_work_item_thread", {
    cwd,
    repo,
    kind,
    number,
  })
    .then((thread) => {
      threadByKey.set(key, thread);
      return thread;
    })
    .finally(() => {
      if (threadInflight.get(key) === promise) threadInflight.delete(key);
    });
  threadInflight.set(key, promise);
  return promise;
}

export async function githubWorkItemComment(
  cwd: string,
  repo: string,
  kind: GithubTaskKind,
  number: number,
  body: string,
  options?: { inReplyTo?: string },
): Promise<string> {
  const url = await invoke<string>("git_github_work_item_comment", {
    cwd,
    repo,
    kind,
    number,
    body: body.trim(),
    inReplyTo: options?.inReplyTo?.trim() ?? "",
  });
  const key = detailsCacheKey(repo, kind, number);
  threadByKey.delete(key);
  threadInflight.delete(key);
  recordInboxSelfActivity({ provider: "github", kind, number, repo });
  return url;
}

export function githubResolveReviewThread(
  cwd: string,
  threadId: string,
  resolved: boolean,
): Promise<void> {
  return invoke<void>("git_github_review_thread_resolve", {
    cwd,
    threadId,
    resolved,
  });
}

/** Run a state-changing pull request action and return GitHub's fresh PR state. */
export async function githubPrAction(
  cwd: string,
  repo: string,
  number: number,
  action: GithubPrAction,
): Promise<GithubWorkItem> {
  const item = await runGithubPrAction<GithubWorkItem>(cwd, repo, number, action);
  const key = workItemLookupKey(repo, "pr", number);
  workItemByKey.set(key, item);
  recordInboxSelfActivity({ provider: "github", kind: "pr", repo, number });
  return item;
}

export function githubReviewDecisionLabel(decision: string): string {
  switch (decision.trim().toUpperCase()) {
    case "APPROVED":
      return "Approved";
    case "CHANGES_REQUESTED":
      return "Changes requested";
    case "REVIEW_REQUIRED":
      return "Review required";
    default:
      return "";
  }
}

export function githubReviewStateLabel(state: string): string {
  switch (state.trim().toUpperCase()) {
    case "APPROVED":
      return "Approved";
    case "CHANGES_REQUESTED":
      return "Requested changes";
    case "DISMISSED":
      return "Dismissed";
    case "COMMENTED":
      return "Commented";
    default:
      return "";
  }
}

export function prDiffCacheKey(
  repo: string,
  number: number,
  fullContext = false,
): string {
  return `${repo.trim().toLowerCase()}:pr:${number}${fullContext ? ":full" : ""}`;
}

export function peekGithubPrDiff(
  repo: string,
  number: number,
  fullContext = false,
): GithubPrDiff | null {
  return prDiffByKey.get(prDiffCacheKey(repo, number, fullContext)) ?? null;
}

export async function githubPrDiff(
  cwd: string,
  repo: string,
  number: number,
  options?: { fullContext?: boolean },
): Promise<GithubPrDiff> {
  const fullContext = options?.fullContext === true;
  const key = prDiffCacheKey(repo, number, fullContext);
  const pending = prDiffInflight.get(key);
  if (pending) return pending;
  const promise = invoke<GithubPrDiff>("git_github_pr_diff", {
    cwd,
    repo,
    number,
    fullContext,
  })
    .then((diff) => {
      prDiffByKey.set(key, diff);
      return diff;
    })
    .finally(() => {
      if (prDiffInflight.get(key) === promise) prDiffInflight.delete(key);
    });
  prDiffInflight.set(key, promise);
  return promise;
}

export function inboxIdentityKey(item: {
  provider?: InboxProvider;
  kind: InboxKind;
  number: number;
  repo: string;
  url: string;
}): string {
  const repo = item.repo.trim().toLowerCase();
  if (repo) return `${repo}:${item.kind}:${item.number}`;
  const url = item.url.trim().toLowerCase();
  if (url) return url;
  return `${item.kind}:${item.number}`;
}

export function inboxItemKey(item: InboxItem): string {
  return `${item.provider}:${inboxIdentityKey(item)}`;
}

export function inboxItemStatus(item: {
  kind: InboxKind;
  state: string;
  draft: boolean;
}): string {
  if (item.draft) return "Draft";
  if (item.state === "merged") return "Merged";
  if (item.state === "closed") return "Closed";
  return "Open";
}

export function inboxItemRef(item: { number: number }): string {
  return `#${item.number}`;
}
