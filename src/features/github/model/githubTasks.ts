import { invoke } from "@tauri-apps/api/core";
import { clearKnownInboxItems } from "./inboxSeen";
import {
  collectRailProjects,
  normalizeProjectPath,
  sameProjectPath,
  type RecentProject,
} from "../../projects/model/recents";
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

export type GithubWorkItemQuery = {
  kind: GithubTaskKind;
  assignedToMe: boolean;
  state: "open" | "all";
  search: string;
};

export type InboxQuery = Omit<GithubWorkItemQuery, "kind">;

export type InboxProviderErrors = Partial<Record<InboxProvider, string>>;

export type GithubStatus = {
  connected: boolean;
  installed: boolean;
  authenticated: boolean;
};

export type GithubStarStatus = "starred" | "notStarred" | "unavailable";

export type InboxListResult = {
  items: InboxItem[];
  errors: InboxProviderErrors;
};

const INBOX_CACHE_FRESH_MS = 30_000;

/** Closed history competes for the same slots, so an unfiltered fetch needs the wider page. */
const INBOX_ALL_LIMIT = 100;

type InboxListCache = InboxListResult & {
  key: string;
  fetchedAt: number;
};

let inboxListCache: InboxListCache | null = null;
let inboxCacheGeneration = 0;
const inboxListInflight = new Map<string, Promise<InboxListResult>>();
const repoByPath = new Map<string, string>();
const repositoriesByPath = new Map<string, string[]>();
const workItemByKey = new Map<string, GithubWorkItem>();
const workItemInflight = new Map<string, Promise<GithubWorkItem>>();
const detailsByKey = new Map<string, GithubWorkItemDetails>();
const threadByKey = new Map<string, GithubWorkItemThread>();
const threadInflight = new Map<string, Promise<GithubWorkItemThread>>();
const prDiffByKey = new Map<string, GithubPrDiff>();
const prDiffInflight = new Map<string, Promise<GithubPrDiff>>();

export function clearInboxCache() {
  inboxCacheGeneration += 1;
  clearKnownInboxItems();
  inboxListCache = null;
  inboxListInflight.clear();
  repoByPath.clear();
  repositoriesByPath.clear();
  workItemByKey.clear();
  workItemInflight.clear();
  detailsByKey.clear();
  threadByKey.clear();
  threadInflight.clear();
  prDiffByKey.clear();
  prDiffInflight.clear();
}

export function inboxListCacheKey(
  projects: readonly { path: string }[],
  query: InboxQuery,
): string {
  const paths = uniqueInboxProjects(projects)
    .map((project) => normalizeProjectPath(project.path))
    .sort()
    .join("|");
  return `${query.assignedToMe ? 1 : 0}:${query.state}:${paths}`;
}

export function peekInboxList(
  projects: readonly { path: string }[],
  query: InboxQuery,
): InboxListResult | null {
  const key = inboxListCacheKey(projects, query);
  if (inboxListCache?.key !== key) return null;
  return { items: inboxListCache.items, errors: inboxListCache.errors };
}

export function peekInboxItems(
  projects: readonly { path: string }[],
  query: InboxQuery,
): InboxItem[] | null {
  return peekInboxList(projects, query)?.items ?? null;
}

export function inboxListIsFresh(
  projects: readonly { path: string }[],
  query: InboxQuery,
  now = Date.now(),
): boolean {
  const key = inboxListCacheKey(projects, query);
  return (
    inboxListCache?.key === key &&
    now - inboxListCache.fetchedAt < INBOX_CACHE_FRESH_MS
  );
}

export function githubStatus(): Promise<GithubStatus> {
  return invoke<GithubStatus>("git_github_status");
}

/** Whether the active GitHub CLI account has starred MonoCode. */
export function githubMonocodeStarStatus(): Promise<GithubStarStatus> {
  return invoke<GithubStarStatus>("github_monocode_star_status");
}

/** Star MonoCode for the active GitHub CLI account. */
export function starMonocodeOnGithub(): Promise<void> {
  return invoke<void>("github_star_monocode");
}

export async function githubRepo(cwd: string): Promise<string> {
  const key = normalizeProjectPath(cwd);
  const cached = repoByPath.get(key);
  if (cached !== undefined) return cached;
  const repositories = repositoriesByPath.get(key);
  if (repositories?.[0]) return repositories[0];
  const repo = await invoke<string>("git_github_repo", { cwd });
  repoByPath.set(key, repo);
  return repo;
}

export async function githubRepositories(cwd: string): Promise<string[]> {
  const key = normalizeProjectPath(cwd);
  const cached = repositoriesByPath.get(key);
  if (cached) return cached;
  const repositories = await invoke<string[]>("git_github_repositories", {
    cwd,
  });
  if (repositories.length === 0) {
    throw new Error("GitHub did not return a repository");
  }
  repositoriesByPath.set(key, repositories);
  repoByPath.set(key, repositories[0]!);
  return repositories;
}

export function listGithubWorkItems(
  cwd: string,
  repo: string,
  query: GithubWorkItemQuery,
): Promise<GithubWorkItem[]> {
  return invoke<GithubWorkItem[]>("git_github_work_items", {
    cwd,
    repo,
    kind: query.kind,
    assignedToMe: query.assignedToMe,
    state: query.state,
    search: query.search.trim(),
    limit: query.state === "all" ? INBOX_ALL_LIMIT : undefined,
  });
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

/** Fetch one exact item after targeted Inbox navigation misses its list cache. */
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

export function formatGithubQuery(query: GithubWorkItemQuery): string {
  const parts: string[] = [];
  if (query.assignedToMe) parts.push("assignee:@me");
  parts.push(query.kind === "pr" ? "is:pr" : "is:issue");
  if (query.state === "open") parts.push("is:open");
  const text = query.search.trim();
  if (text) parts.push(text);
  return parts.join(" ");
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
  if (inboxListCache) {
    inboxListCache = {
      ...inboxListCache,
      items: inboxListCache.items.map((cached) =>
        cached.provider === "github" &&
        cached.kind === "pr" &&
        cached.repo.toLowerCase() === repo.trim().toLowerCase() &&
        cached.number === number
          ? { ...cached, ...item }
          : cached,
      ),
    };
  }
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

export async function listInboxItems(
  projects: readonly { path: string }[],
  query: InboxQuery,
  options?: { force?: boolean },
): Promise<InboxListResult> {
  const key = inboxListCacheKey(projects, query);
  if (!options?.force && inboxListIsFresh(projects, query)) {
    return peekInboxList(projects, query) ?? { items: [], errors: {} };
  }
  const pending = inboxListInflight.get(key);
  if (pending) return pending;
  const generation = inboxCacheGeneration;
  const promise = fetchInboxItems(projects, query)
    .then((result) => {
      if (generation === inboxCacheGeneration) {
        inboxListCache = { key, ...result, fetchedAt: Date.now() };
      }
      return result;
    })
    .finally(() => {
      if (inboxListInflight.get(key) === promise) inboxListInflight.delete(key);
    });
  inboxListInflight.set(key, promise);
  return promise;
}

async function fetchInboxItems(
  projects: readonly { path: string }[],
  query: InboxQuery,
): Promise<InboxListResult> {
  const unique = uniqueInboxProjects(projects);
  const preferredPaths = unique.map((project) => project.path);
  const discovery = await Promise.allSettled(
    unique.map((project) => githubRepositories(project.path)),
  );
  const resolved = discovery.flatMap((result, index) =>
    result.status === "fulfilled"
      ? result.value.map((repo) => ({ path: unique[index]!.path, repo }))
      : [],
  );
  const grouped = groupProjectsByRepo(resolved);
  const githubJobs = grouped.flatMap((project) =>
    (["issue", "pr"] as const).map(async (kind) => {
      const items = await listGithubWorkItems(project.path, project.repo, {
        ...query,
        kind,
      });
      return items.map((item) => ({
        ...item,
        projectPath: project.path,
        provider: "github" as const,
        repo: item.repo || project.repo,
      }));
    }),
  );
  const discoveryFailures = discovery.filter(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );
  const github = collectInboxResults(
    [...(await Promise.allSettled(githubJobs)), ...discoveryFailures],
    preferredPaths,
  );
  const errors: InboxProviderErrors = {};
  if (github.error && unique.length > 0) errors.github = github.error;

  return {
    items: dedupeInboxItems(github.items, preferredPaths),
    errors,
  };
}

export function inboxProjectsForRail(
  recents: RecentProject[],
  cwd: string,
): RecentProject[] {
  const map = collectRailProjects(recents, cwd);
  const current = cwd ? map.get(normalizeProjectPath(cwd)) : undefined;
  const rest = [...map.values()].filter(
    (project) => !current || !sameProjectPath(project.path, current.path),
  );
  return current ? [current, ...rest] : rest;
}

export function uniqueInboxProjects(
  projects: readonly { path: string }[],
): { path: string }[] {
  const seen = new Set<string>();
  const unique: { path: string }[] = [];
  for (const project of projects) {
    const path = normalizeProjectPath(project.path);
    if (!path || seen.has(path)) continue;
    seen.add(path);
    unique.push({ path });
  }
  return unique;
}

export function groupProjectsByRepo(
  resolved: readonly { path: string; repo: string }[],
): { path: string; repo: string }[] {
  const seen = new Set<string>();
  const grouped: { path: string; repo: string }[] = [];
  for (const project of resolved) {
    const repo = project.repo.trim().toLowerCase();
    const key = repo || `path:${normalizeProjectPath(project.path)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    grouped.push({
      path: project.path,
      repo: project.repo.trim(),
    });
  }
  return grouped;
}

export function collectInboxResults(
  settled: PromiseSettledResult<InboxItem[]>[],
  preferredPaths: readonly string[] = [],
): { items: InboxItem[]; error?: string } {
  const batches: InboxItem[][] = [];
  const errors: unknown[] = [];
  for (const result of settled) {
    if (result.status === "fulfilled") batches.push(result.value);
    else errors.push(result.reason);
  }
  if (batches.length === 0 && errors.length > 0) {
    return { items: [], error: inboxErrorMessage(errors[0]) };
  }
  return { items: dedupeInboxItems(batches.flat(), preferredPaths) };
}

function inboxErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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

export function dedupeInboxItems(
  items: readonly InboxItem[],
  preferredPaths: readonly string[] = [],
): InboxItem[] {
  const rank = new Map(
    preferredPaths.map((path, index) => [normalizeProjectPath(path), index]),
  );
  const best = new Map<string, InboxItem>();
  for (const item of items) {
    // Keyed with the provider prefix so identical repo/kind/number triples
    // from different providers never collapse into one card.
    const key = inboxItemKey(item);
    const current = best.get(key);
    if (!current || preferInboxItem(item, current, rank)) best.set(key, item);
  }
  return sortInboxItems([...best.values()]);
}

function preferInboxItem(
  next: InboxItem,
  current: InboxItem,
  rank: Map<string, number>,
): boolean {
  const nextRank =
    rank.get(normalizeProjectPath(next.projectPath)) ??
    Number.POSITIVE_INFINITY;
  const currentRank =
    rank.get(normalizeProjectPath(current.projectPath)) ??
    Number.POSITIVE_INFINITY;
  if (nextRank !== currentRank) return nextRank < currentRank;
  return next.projectPath.localeCompare(current.projectPath) < 0;
}

export function sortInboxItems(items: InboxItem[]): InboxItem[] {
  return [...items].sort((a, b) => {
    const updated =
      (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0);
    if (updated !== 0) return updated;
    if (a.projectPath !== b.projectPath) {
      return a.projectPath.localeCompare(b.projectPath);
    }
    if (a.kind !== b.kind) return a.kind.localeCompare(b.kind);
    return b.number - a.number;
  });
}

export function inboxItemKey(item: InboxItem): string {
  return `${item.provider}:${inboxIdentityKey(item)}`;
}

export function githubWorkItemKey(item: GithubWorkItem): string {
  return `${item.repo}:${item.kind}:${item.number}`;
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

export function matchesInboxQuery(item: InboxItem, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const kind = item.kind === "pr" ? "pull request pr" : "issue";
  const haystack = [
    item.title,
    item.repo,
    item.projectPath,
    kind,
    `#${item.number}`,
    String(item.number),
    ...item.labels.map((label) => label.name),
    ...item.assignees.map((person) => person.login),
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(needle);
}

export function filterInboxItems(
  items: readonly InboxItem[],
  query: string,
): InboxItem[] {
  return items.filter((item) => matchesInboxQuery(item, query));
}

export function inboxItemRef(item: { number: number }): string {
  return `#${item.number}`;
}

export function inboxStartDraft(item: InboxItem): string {
  const kind = item.kind === "pr" ? "pull request" : "issue";
  const title = item.title.trim() || `GitHub ${kind} #${item.number}`;
  const lines = [`Work on this GitHub ${kind}:`, "", `#${item.number} ${title}`];
  const url = item.url.trim();
  if (url) lines.push(url);
  return `${lines.join("\n")}\n`;
}

/** Compact chip shown above the composer when starting from Inbox. */
export type InboxComposerCard = {
  provider: InboxProvider;
  kind: InboxKind;
  identifier: string;
  title: string;
  url: string;
  source: string;
  labels: GithubLabel[];
  prompt: string;
};

export function inboxComposerCard(item: InboxItem): InboxComposerCard {
  return {
    provider: item.provider,
    kind: item.kind,
    identifier: inboxItemRef(item),
    title: item.title.trim() || inboxItemRef(item),
    url: item.url.trim(),
    source: item.repo,
    labels: item.labels.slice(0, 2),
    prompt: inboxStartDraft(item).trimEnd(),
  };
}

export function composeInboxMessage(
  card: InboxComposerCard | undefined,
  text: string,
): string {
  const prompt = card?.prompt.trim() ?? "";
  const note = text.trim();
  if (!prompt) return note;
  if (!note) return prompt;
  return `${prompt}\n\n${note}`;
}
