import { useGithubPrChecks } from "../../source-control/hooks/useGithubPrChecks";
import { summarizePrChecks } from "../../source-control/model/githubPrChecks";
import type { CiRepairRequest } from "../../source-control/model/ciRepair";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  Check,
  CheckCheck,
  CheckCircle,
  CircleDot,
  CircleX,
  Copy,
  ExternalLink,
  GitCompare,
  GitMerge,
  GitPullRequest,
  GitPullRequestClosed,
  GitPullRequestDraft,
  Inbox,
  MessageSquare,
  ListFilter,
  LoaderCircle,
  MessageMultiple,
  PanelLeft,
  Plus,
  RefreshCw,
  Search,
  type IconComponent,
} from "../../../shared/ui/icons";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import {
  InboxFiltersMenu,
  INBOX_FILTER_MENU_WIDTH,
} from "./InboxFiltersMenu";
import { InboxConnectMenu } from "./InboxConnectMenu";
import { InboxProviderMark } from "./InboxProviderMark";
import { ProjectLogoIcon } from "../../projects/ui/ProjectLogoIcon";
import { ProjectMascot } from "../../projects/ui/ProjectMascot";
import { IconButton, OverlayNav } from "../../../app/shell/TitleBar";
import { WindowControls } from "../../../app/shell/WindowControls";
import { useDragResize } from "../../../shared/hooks/useDragResize";
import { useLockOverscroll } from "../../../shared/hooks/useLockOverscroll";
import { useTabGroupLogos } from "../../projects/hooks/useTabGroupLogos";
import {
  githubStatus,
  githubPrDiff,
  githubReviewDecisionLabel,
  githubWorkItem,
  githubWorkItemComment,
  githubWorkItemDetails,
  githubWorkItemThread,
  inboxItemKey,
  inboxItemRef,
  inboxItemStatus,
  inboxListIsFresh,
  inboxProjectsForRail,
  listInboxItems,
  peekGithubPrDiff,
  peekGithubWorkItem,
  peekGithubWorkItemDetails,
  peekGithubWorkItemThread,
  peekInboxList,
  formatRelativeTime,
  inboxPersonAvatarUrl,
  type GithubLabel,
  type GithubPrDiff,
  type GithubWorkItemDetails,
  type GithubWorkItemThread,
  type InboxItem,
  type InboxProviderErrors,
  type InboxQuery,
} from "../model/githubTasks";
import {
  applyInboxFilters,
  connectableInboxSources,
  hasActiveInboxFilters,
  loadInboxConnections,
  inboxFetchState,
  loadInboxFilters,
  pruneInboxFilters,
  saveInboxFilters,
  saveInboxConnections,
  visibleInboxSources,
  INBOX_SOURCE_LABELS,
  type ConnectableInboxSource,
  type InboxFilters,
  type InboxSource,
} from "../model/inboxFilters";
import { copyText } from "../../../platform/tauri/clipboard";
import { projectKey, projectName } from "../../../shared/lib/paths";
import { IS_MAC } from "../../../platform/tauri/platform";
import { playCue } from "../../settings/model/sounds";
import { sameProjectPath, type RecentProject } from "../../projects/model/recents";
import { sessionDisplayTitle, type LinkedWorkItem } from "../../sessions/model/session";
import type { SessionSummary } from "../../sessions/data/sessionStore";
import {
  inboxItemMatchesLinkedWorkItem,
  linkedWorkItemInboxKey,
  relatedSessionsForInboxItem,
} from "../../sessions/model/sessionWorkItem";
import {
  isInboxEntryUnseen,
  markInboxItemSeen,
  markInboxItemsSeen,
  rememberInboxItems,
  useInboxSeenTick,
} from "../model/inboxSeen";
import { LIST_PAGE_SIZE, listWindowSize } from "../../../shared/lib/listWindow";
import {
  loadTabGroupColors,
  loadTabGroupCustomColors,
  loadTabGroupMascots,
  resolveTabGroupColor,
  resolveTabGroupLogo,
  resolveTabGroupMascot,
} from "../../workspace/model/tabGroups";
import { AgentMarkdown } from "../../sessions/ui/AgentMarkdown";
import {
  InboxComments,
  InboxCommentForm,
  type InboxReplyTarget,
} from "./InboxComments";
import { InboxPrDiff } from "./InboxPrDiff";
import { GithubPrActions } from "../../source-control/ui/GithubPrActions";
import { PrChecks, PrChecksTab } from "../../source-control/ui/PrChecks";
import {
  InboxDiscussionPanel,
  type InboxSessionPortal,
} from "./InboxDiscussionPanel";
import { inboxAskKey } from "../model/inboxAsk";

const MIN_WIDTH = 240;
const MAX_WIDTH = 420;

// One height for the whole detail action row; `border` is inside it, so the
// outline variant lines up with the filled and ghost ones.
const ACTION = "inline-flex items-center gap-1.5 rounded-md px-3 text-[12px]";
const ACTION_FILLED = `${ACTION} h-6.5 bg-content text-background-base hover:bg-content/80`;
const ACTION_OUTLINE = `${ACTION} h-7 border border-content/15 text-content/80 hover:bg-content/5`;
const ACTION_PANEL_HEADER = `${ACTION} h-6.5 text-content/70 hover:bg-content/10 hover:text-content`;
const ACTION_GHOST = `${ACTION} h-7 text-content/70 hover:bg-content/10 hover:text-content`;
const DEFAULT_WIDTH = 280;
const LINKED_PANEL_MIN_WIDTH = 360;
const LINKED_PANEL_DEFAULT_WIDTH = 520;

let rememberedWidth = DEFAULT_WIDTH;
let rememberedLinkedPanelWidth = LINKED_PANEL_DEFAULT_WIDTH;

type InboxProjectOption = {
  path: string;
  name: string;
  logoPath: string | null;
  mascotName: string | null;
  mascotColor: string;
};

function inboxProjectOptions(
  projects: RecentProject[],
  logos: ReturnType<typeof useTabGroupLogos>,
): InboxProjectOption[] {
  const mascots = loadTabGroupMascots();
  const colors = loadTabGroupColors();
  const custom = loadTabGroupCustomColors();
  return [...projects]
    .map((project) => {
      const name = projectName(project.path);
      const key = projectKey(project.path);
      return {
        path: project.path,
        name,
        logoPath: resolveTabGroupLogo(key, logos),
        mascotName: resolveTabGroupMascot(key, mascots),
        mascotColor: resolveTabGroupColor(key, colors, custom, name),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function peekInboxForRail(recents: RecentProject[], cwd: string) {
  const projects = inboxProjectsForRail(recents, cwd);
  const filters = pruneInboxFilters(
    loadInboxFilters(),
    projects.map((project) => project.path),
  );
  return peekInboxList(projects, {
    assignedToMe: filters.assignedToMe,
    state: inboxFetchState(filters),
    search: "",
  });
}

function InboxSourceTab({
  source,
  selected,
  onSelect,
}: {
  source: InboxSource;
  selected: boolean;
  onSelect: (source: InboxSource) => void;
}) {
  const label = INBOX_SOURCE_LABELS[source];
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={() => onSelect(source)}
      className={`flex h-6 min-w-0 flex-1 items-center justify-center rounded-md px-2 text-[12px] leading-none ${
        selected
          ? "bg-selection text-content"
          : "text-content/50 hover:bg-content/5 hover:text-content"
      }`}
    >
      <span className="flex items-center gap-1.5">
        <InboxProviderMark
          provider={source}
          className="block size-3.5 shrink-0"
        />
        <span className="leading-none">{label}</span>
      </span>
    </button>
  );
}

function InboxDetailTab({
  label,
  selected,
  onSelect,
}: {
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onSelect}
      className={`relative flex h-9 items-center text-[12px] leading-none ${
        selected ? "text-content" : "text-content/50 hover:text-content"
      }`}
    >
      {label}
      {selected ? (
        <span className="absolute inset-x-0 bottom-0 h-0.5 bg-content" />
      ) : null}
    </button>
  );
}

type CiRepairProps = {
  repairSessions?: readonly SessionSummary[];
  onRepairChecks?: (
    item: InboxItem,
    request: CiRepairRequest,
    sessionId?: string,
  ) => Promise<void>;
};

type Props = {
  onAsk: (item: InboxItem) => Promise<string>;
  onAskRestart: (item: InboxItem) => Promise<string>;
  onAskMount: (portal: InboxSessionPortal | null) => void;
  cwd: string;
  recents: RecentProject[];
  besideRail?: boolean;
  compactRail?: boolean;
  onClose?: () => void;
  onToggleSidebar?: () => void;
  onStart?: (item: InboxItem) => void | Promise<void>;
  repairSessions?: CiRepairProps["repairSessions"];
  onRepairChecks?: CiRepairProps["onRepairChecks"];
  sessions?: readonly SessionSummary[];
  onOpenSession?: (sessionId: string) => void | Promise<void>;
  /** Session-card destination to reveal after the Inbox list loads. */
  target?: LinkedWorkItem | null;
  /** Opens Settings on the card where the given source is connected. */
  onOpenIntegrations: (source: ConnectableInboxSource) => void;
};

export function InboxView({
  onAsk,
  onAskRestart,
  onAskMount,
  cwd,
  recents,
  besideRail = false,
  compactRail = false,
  onClose,
  onToggleSidebar,
  onStart,
  repairSessions,
  onRepairChecks,
  sessions = [],
  onOpenSession,
  target = null,
  onOpenIntegrations,
}: Props) {
  const [discussionOpen, setDiscussionOpen] = useState(false);
  const listLock = useLockOverscroll<HTMLDivElement>();
  const listScrollRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef<HTMLLIElement>(null);
  const [listLimit, setListLimit] = useState(LIST_PAGE_SIZE);
  const setListScrollRef = useCallback(
    (element: HTMLDivElement | null) => {
      listLock(element);
      listScrollRef.current = element;
    },
    [listLock],
  );
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const logos = useTabGroupLogos();
  const [groupMascots] = useState(loadTabGroupMascots);
  const [groupColors] = useState(loadTabGroupColors);
  const [groupCustomColors] = useState(loadTabGroupCustomColors);

  const [searchInput, setSearchInput] = useState("");
  const [items, setItems] = useState<InboxItem[]>(
    () => peekInboxForRail(recents, cwd)?.items ?? [],
  );
  const [loading, setLoading] = useState(
    () => peekInboxForRail(recents, cwd) == null,
  );
  const [revalidating, setRevalidating] = useState(false);
  const [readStatusError, setReadStatusError] = useState<string | null>(null);
  const [providerErrors, setProviderErrors] = useState<InboxProviderErrors>(
    () => peekInboxForRail(recents, cwd)?.errors ?? {},
  );
  const [refresh, setRefresh] = useState(0);
  const targetSelectionKey = target ? linkedWorkItemInboxKey(target) : null;
  const [selectedKey, setSelectedKey] = useState<string | null>(
    targetSelectionKey,
  );
  const [targetItem, setTargetItem] = useState<InboxItem | null>(null);
  const [filters, setFilters] = useState(loadInboxFilters);
  const [connections, setConnections] = useState(loadInboxConnections);
  const [source, setSource] = useState<InboxSource>("github");
  const [connectMenuOpen, setConnectMenuOpen] = useState(false);
  const connectButtonRef = useRef<HTMLButtonElement | null>(null);
  const [filterMenu, setFilterMenu] = useState<{ x: number; y: number } | null>(
    null,
  );
  const prevRefresh = useRef(refresh);

  const projects = useMemo(
    () => inboxProjectsForRail(recents, cwd),
    [cwd, recents],
  );
  const projectOptions = useMemo(
    () => inboxProjectOptions(projects, logos),
    [logos, projects],
  );
  const activeFilters = useMemo(
    () =>
      pruneInboxFilters(
        filters,
        projects.map((project) => project.path),
      ),
    [filters, projects],
  );
  const filtersActive = hasActiveInboxFilters(activeFilters);
  const fetchState = inboxFetchState(activeFilters);
  const fetchQuery = useMemo<InboxQuery>(
    () => ({
      assignedToMe: activeFilters.assignedToMe,
      state: fetchState,
      search: "",
    }),
    [activeFilters.assignedToMe, fetchState],
  );

  const resize = useDragResize({
    min: MIN_WIDTH,
    max: () => Math.min(MAX_WIDTH, Math.round(window.innerWidth * 0.5)),
    defaultWidth: DEFAULT_WIDTH,
    initial: rememberedWidth,
    onCommit: (width) => {
      rememberedWidth = width;
    },
  });

  useEffect(() => {
    if (!target) return;
    setSource("github");
    setSearchInput("");
  }, [target]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      if (filterMenu) {
        setFilterMenu(null);
        return;
      }
      if (connectMenuOpen) {
        setConnectMenuOpen(false);
        return;
      }
      onCloseRef.current?.();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [connectMenuOpen, filterMenu]);

  // The mount read does the real work: opening Settings unmounts this view, so
  // a token set there lands on the way back in.
  useEffect(() => {
    let cancelled = false;
    void githubStatus().then(
      (status) => {
        if (!cancelled) setConnections({ github: status.connected });
      },
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    saveInboxConnections(connections);
  }, [connections]);

  const visibleSources = visibleInboxSources(connections);
  const connectableSources = connectableInboxSources(connections);
  const sourceAvailable = visibleSources.includes(source);
  const noSourcesConnected = visibleSources.length === 0;

  useEffect(() => {
    const force = refresh !== prevRefresh.current;
    prevRefresh.current = refresh;
    const cached = peekInboxList(projects, fetchQuery);
    if (cached) {
      setItems(cached.items);
      setProviderErrors(cached.errors);
      setLoading(false);
    }
    if (!force && cached && inboxListIsFresh(projects, fetchQuery)) {
      return;
    }

    let cancelled = false;
    if (cached) setRevalidating(true);
    else {
      setLoading(true);
      setProviderErrors({});
    }
    void listInboxItems(projects, fetchQuery, { force })
      .then((next) => {
        if (cancelled) return;
        setItems(next.items);
        setProviderErrors(next.errors);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (cached) return;
        setItems([]);
        const message = err instanceof Error ? err.message : String(err);
        setProviderErrors({ github: message });
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
        setRevalidating(false);
      });

    return () => {
      cancelled = true;
    };
  }, [fetchQuery, projects, refresh]);

  useEffect(() => {
    if (
      !target ||
      items.some((item) => inboxItemMatchesLinkedWorkItem(item, target))
    ) {
      return;
    }
    let cancelled = false;
    void githubWorkItem(cwd, target.repo, target.kind, target.number)
      .then((item) => {
        if (cancelled) return;
        setTargetItem({
          ...item,
          projectPath: cwd,
          provider: "github",
        });
      })
      .catch(() => {
        // The normal Inbox remains usable when an exact lookup is unavailable.
      });
    return () => {
      cancelled = true;
    };
  }, [cwd, items, target, targetSelectionKey]);

  const visibleItems = useMemo(() => {
    if (!sourceAvailable) return [];
    const visible = applyInboxFilters(
      items,
      activeFilters,
      searchInput,
      Date.now(),
      source,
    );
    if (!target || source !== "github") return visible;
    const targeted =
      items.find((item) => inboxItemMatchesLinkedWorkItem(item, target)) ??
      (targetItem && inboxItemMatchesLinkedWorkItem(targetItem, target)
        ? targetItem
        : null);
    if (!targeted || visible.includes(targeted)) return visible;
    return [targeted, ...visible];
  }, [
    activeFilters,
    items,
    searchInput,
    source,
    sourceAvailable,
    target,
    targetItem,
  ]);

  const inboxSeenTick = useInboxSeenTick();
  useEffect(() => {
    rememberInboxItems(items.map((item) => ({
      key: inboxItemKey(item),
      updatedAt: item.updatedAt,
      projectPath: item.projectPath,
    })));
  }, [items]);
  const sourceEntries = useMemo(
    () =>
      sourceAvailable
        ? items
            .filter((item) => item.provider === source)
            .map((item) => ({
              key: inboxItemKey(item),
              updatedAt: item.updatedAt,
            }))
        : [],
    [items, source, sourceAvailable],
  );
  const sourceHasUnseen = useMemo(
    () => sourceEntries.some(isInboxEntryUnseen),
    [inboxSeenTick, sourceEntries],
  );

  const searchNarrowed = searchInput.trim().length > 0;
  const narrowedByUser = searchNarrowed || filtersActive;
  const sourceError = providerErrors[source] ?? null;

  const selectedByKey = visibleItems.find(
    (item) => inboxItemKey(item) === selectedKey,
  );
  const waitingForTarget =
    !!targetSelectionKey && selectedKey === targetSelectionKey;
  const selected =
    selectedByKey ?? (waitingForTarget ? null : visibleItems[0]) ?? null;
  const updateInboxItem = useCallback((next: InboxItem) => {
    const key = inboxItemKey(next);
    setItems((current) =>
      current.map((entry) => (inboxItemKey(entry) === key ? next : entry)),
    );
    setTargetItem((current) =>
      current && inboxItemKey(current) === key ? next : current,
    );
  }, []);
  const shownItemCount = listWindowSize(visibleItems.length, listLimit);
  const shownItems = visibleItems.slice(0, shownItemCount);
  const hasMoreItems = shownItemCount < visibleItems.length;

  useEffect(() => {
    setListLimit(LIST_PAGE_SIZE);
    const scroller = listScrollRef.current;
    if (scroller) scroller.scrollTop = 0;
  }, [activeFilters, searchInput, source]);

  useEffect(() => {
    if (!hasMoreItems) return;
    const sentinel = loadMoreRef.current;
    const root = listScrollRef.current;
    if (!sentinel || !root) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setListLimit((current) => current + LIST_PAGE_SIZE);
      },
      { root, rootMargin: "240px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMoreItems, shownItemCount]);

  useEffect(() => {
    if (!selected) {
      if (!targetSelectionKey) setSelectedKey(null);
      return;
    }
    const key = inboxItemKey(selected);
    // Keep waiting while the exact cache-miss lookup loads. Otherwise the
    // current list's first row replaces the requested key.
    if (
      targetSelectionKey &&
      selectedKey === targetSelectionKey &&
      key !== targetSelectionKey
    ) {
      return;
    }
    if (key !== selectedKey) setSelectedKey(key);
  }, [selected, selectedKey, targetSelectionKey]);

  const onFiltersChange = (next: InboxFilters) => {
    const pruned = pruneInboxFilters(
      next,
      projects.map((project) => project.path),
    );
    setFilters(pruned);
    saveInboxFilters(pruned);
  };

  const onSourceChange = (next: InboxSource) => {
    setSource(next);
  };

  const onFilterButtonClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
    if (filterMenu) {
      setFilterMenu(null);
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    setFilterMenu({
      x: rect.right - INBOX_FILTER_MENU_WIDTH,
      y: rect.bottom + 2,
    });
  };

  const list = (
    <div
      ref={resize.setPaneRef}
      className="relative flex h-full min-h-0 shrink-0 flex-col border-r border-stroke"
    >
      <div className="flex h-9 shrink-0 items-center gap-px border-b border-stroke px-2">
        {visibleSources.length > 0 ? (
          <div
            role="tablist"
            aria-label="Inbox source"
            className="flex min-w-0 basis-0 items-center gap-px"
            style={{ flexGrow: visibleSources.length }}
          >
            {visibleSources.map((option) => (
              <InboxSourceTab
                key={option}
                source={option}
                selected={source === option}
                onSelect={onSourceChange}
              />
            ))}
          </div>
        ) : null}
        {connectableSources.length > 0 ? (
          <button
            ref={connectButtonRef}
            type="button"
            aria-label="Connect an inbox source"
            aria-haspopup="menu"
            aria-expanded={connectMenuOpen}
            title="Connect an inbox source"
            onClick={() => setConnectMenuOpen((open) => !open)}
            className={`flex h-6 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-md px-2 text-[12px] leading-none ${
              connectMenuOpen
                ? "bg-selection text-content"
                : "text-content/40 hover:bg-content/5 hover:text-content"
            }`}
          >
            <Plus className="size-3.5 shrink-0" strokeWidth={1.75} />
            <span className="min-w-0 truncate">Add connection</span>
          </button>
        ) : null}
      </div>
      {noSourcesConnected ? null : (
        <div className="flex h-9 shrink-0 items-center gap-1 border-b border-stroke px-2">
          <div className="relative flex h-7 min-w-0 flex-1 items-center">
            <Search className="pointer-events-none absolute left-2 size-3 shrink-0 opacity-50" />
            <input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Filter inbox"
              aria-label="Filter inbox"
              spellCheck={false}
              autoComplete="off"
              className="h-7 w-full rounded-md bg-transparent pl-7 pr-2 text-[12px] text-content outline-none placeholder:text-content/40"
            />
          </div>
          <button
            type="button"
            title="Filter inbox"
            aria-label="Filter inbox"
            aria-expanded={!!filterMenu}
            aria-haspopup="menu"
            onClick={onFilterButtonClick}
            className={`grid size-6 shrink-0 place-items-center rounded-md text-content/45 hover:bg-content/10 hover:text-content ${
              filterMenu || filtersActive ? "bg-selection text-content" : ""
            }`}
          >
            <ListFilter className="size-3" strokeWidth={1.75} />
          </button>
          <button
            type="button"
            title="Mark all as read"
            aria-label="Mark all as read"
            disabled={!sourceHasUnseen}
            onClick={() => setReadStatusError(
              markInboxItemsSeen(sourceEntries)
                ? null
                : "Could not save read status. Please try again.",
            )}
            className="grid size-6 shrink-0 place-items-center rounded-md text-content/45 hover:bg-content/10 hover:text-content disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-content/45"
          >
            <CheckCheck className="size-3.5" strokeWidth={1.75} />
          </button>
          <button
            type="button"
            aria-label="Refresh"
            onClick={() => setRefresh((value) => value + 1)}
            className="grid size-6 shrink-0 place-items-center rounded-md text-content/45 hover:bg-content/10 hover:text-content"
          >
            {loading || revalidating ? (
              <LoaderCircle
                className="size-3.5 animate-spin"
                strokeWidth={1.75}
              />
            ) : (
              <RefreshCw className="size-3.5" strokeWidth={1.75} />
            )}
          </button>
        </div>
      )}
      {readStatusError ? (
        <p role="alert" className="px-3 py-2 text-xs text-red-400">
          {readStatusError}
        </p>
      ) : null}
      <div
        ref={setListScrollRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-none"
      >
        {noSourcesConnected ? (
          <p className="px-3 py-3 text-[12px] text-content/50">
            Add a connection to start using the Inbox.
          </p>
        ) : sourceError && visibleItems.length === 0 ? (
          <p className="px-3 py-2 text-[12px] text-content/50">{sourceError}</p>
        ) : loading && items.length === 0 ? (
          <div className="flex justify-center py-10 text-content/40">
            <LoaderCircle className="size-4 animate-spin" strokeWidth={1.75} />
          </div>
        ) : visibleItems.length === 0 ? (
          <p className="px-3 py-2 text-[12px] text-content/50">
            {narrowedByUser
              ? searchNarrowed
                ? "No matching issues or pull requests"
                : "No issues or pull requests match these filters"
              : projects.length === 0
                ? "Open a project to fill the inbox"
                : "No matching issues or pull requests"}
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5 p-1.5">
            {shownItems.map((item) => {
              const key = inboxItemKey(item);
              const projectId = projectKey(item.projectPath);
              const relatedSessions = relatedSessionsForInboxItem(
                item,
                sessions,
              );
              return (
                <li key={key}>
                  <InboxCard
                    item={item}
                    active={selected != null && key === inboxItemKey(selected)}
                    logoPath={resolveTabGroupLogo(projectId, logos)}
                    mascotName={resolveTabGroupMascot(projectId, groupMascots)}
                    mascotColor={resolveTabGroupColor(
                      projectId,
                      groupColors,
                      groupCustomColors,
                      projectName(item.projectPath),
                    )}
                    relatedSessionCount={relatedSessions.length}
                    onSelect={() => {
                      markInboxItemSeen({
                        key,
                        updatedAt: item.updatedAt,
                      });
                      setSelectedKey(key);
                    }}
                  />
                </li>
              );
            })}
            {hasMoreItems ? (
              <li ref={loadMoreRef} aria-hidden className="h-px list-none" />
            ) : null}
          </ul>
        )}
      </div>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize inbox list"
        className={`absolute inset-y-0 -right-px z-10 w-1.5 cursor-col-resize touch-none ${
          resize.dragging ? "bg-content/15" : "hover:bg-content/10"
        }`}
        onPointerDown={resize.onPointerDown}
        onDoubleClick={resize.onDoubleClick}
      />
    </div>
  );

  const filtersPortal = filterMenu ? (
    <InboxFiltersMenu
      x={filterMenu.x}
      y={filterMenu.y}
      projects={projectOptions}
      filters={activeFilters}
      onChange={onFiltersChange}
      onClose={() => setFilterMenu(null)}
    />
  ) : null;

  const connectPortal =
    connectMenuOpen && connectableSources.length > 0 ? (
      <InboxConnectMenu
        anchor={connectButtonRef}
        sources={connectableSources}
        onConnect={onOpenIntegrations}
        onClose={() => setConnectMenuOpen(false)}
      />
    ) : null;

  return (
    <div
      role="region"
      aria-label="Inbox"
      data-app-inbox
      className="flex min-h-0 min-w-0 flex-1 flex-col text-content"
    >
      <div
        className="flex h-10 shrink-0 select-none items-center border-b border-stroke"
        data-tauri-drag-region="deep"
      >
        {IS_MAC && compactRail ? <div className="w-4 shrink-0" /> : null}
        {IS_MAC && !besideRail ? <div className="w-[78px] shrink-0" /> : null}
        {besideRail ? null : (
          <OverlayNav onBack={onClose} onToggleSidebar={onToggleSidebar} />
        )}
        <div className="flex min-w-0 flex-1 items-center gap-2 px-3 text-[13px]">
          <Inbox
            className="size-3.5 shrink-0 text-content/45"
            strokeWidth={1.75}
          />
          <span className="min-w-0 truncate text-content">Inbox</span>
        </div>
        {IS_MAC ? null : <WindowControls />}
      </div>

      <div className="flex min-h-0 min-w-0 flex-1">
        {list}
        <div className="relative flex min-h-0 min-w-0 flex-1">
          <div className="min-h-0 min-w-0 flex-1">
            <InboxDetailBody
              item={selected}
              cwd={cwd}
              revision={refresh}
              relatedSessions={
                selected ? relatedSessionsForInboxItem(selected, sessions) : []
              }
              onDiscuss={() => setDiscussionOpen(true)}
              onStart={onStart}
              repairSessions={repairSessions}
              onRepairChecks={onRepairChecks}
              onOpenSession={onOpenSession}
              onItemChange={updateInboxItem}
            />
          </div>
          {discussionOpen && selected ? (
            <InboxDiscussionPanel
              onOpen={onAsk}
              onRestart={onAskRestart}
              onMount={onAskMount}
              key={inboxAskKey(selected)}
              item={selected}
              onClose={() => setDiscussionOpen(false)}
            />
          ) : null}
        </div>
      </div>
      {filtersPortal}
      {connectPortal}
    </div>
  );
}

export function LinkedWorkItemPanel({
  repairSessions,
  onRepairChecks,
  onOpenSession,
  target,
  cwd,
  visible = true,
  onClose,
}: {
  repairSessions?: CiRepairProps["repairSessions"];
  onRepairChecks?: CiRepairProps["onRepairChecks"];
  onOpenSession?: (sessionId: string) => void | Promise<void>;
  target: LinkedWorkItem;
  cwd: string;
  visible?: boolean;
  onClose: () => void;
}) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const cachedItem = peekGithubWorkItem(
    target.repo,
    target.kind,
    target.number,
  );
  const [item, setItem] = useState<InboxItem | null>(() =>
    cachedItem ? { ...cachedItem, projectPath: cwd, provider: "github" } : null,
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(cachedItem == null);
  const resize = useDragResize({
    min: LINKED_PANEL_MIN_WIDTH,
    max: () =>
      Math.max(
        LINKED_PANEL_MIN_WIDTH,
        Math.round(
          (typeof window === "undefined"
            ? LINKED_PANEL_DEFAULT_WIDTH / 0.65
            : window.innerWidth) * 0.65,
        ),
      ),
    defaultWidth: LINKED_PANEL_DEFAULT_WIDTH,
    initial: rememberedLinkedPanelWidth,
    direction: "left",
    onCommit: (width) => {
      rememberedLinkedPanelWidth = width;
    },
  });

  useEffect(() => {
    let cancelled = false;
    const cached = peekGithubWorkItem(target.repo, target.kind, target.number);
    setItem(
      cached ? { ...cached, projectPath: cwd, provider: "github" } : null,
    );
    setError(null);
    setLoading(cached == null);
    void githubWorkItem(cwd, target.repo, target.kind, target.number)
      .then((next) => {
        if (cancelled) return;
        setItem({ ...next, projectPath: cwd, provider: "github" });
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [cwd, target.kind, target.number, target.repo]);

  useEffect(() => {
    if (!visible) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onCloseRef.current();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [visible]);

  const kindLabel = target.kind === "pr" ? "Pull request" : "Issue";
  return (
    <aside
      ref={resize.setPaneRef}
      aria-label={`Linked ${kindLabel.toLowerCase()} #${target.number}`}
      aria-busy={loading}
      aria-hidden={!visible}
      inert={!visible || undefined}
      data-linked-work-item-panel
      className={`@container/linked relative min-h-0 max-w-full shrink-0 flex-col border-l border-stroke text-content max-[950px]:absolute max-[950px]:inset-y-0 max-[950px]:right-0 max-[950px]:z-30 max-[950px]:shadow-2xl ${
        visible ? "flex" : "hidden"
      }`}
    >
      <div
        role="separator"
        aria-label={`Resize linked ${kindLabel.toLowerCase()} panel`}
        aria-orientation="vertical"
        onPointerDown={resize.onPointerDown}
        onDoubleClick={resize.onDoubleClick}
        className={`absolute inset-y-0 -left-1 z-20 w-2 cursor-col-resize touch-none ${
          resize.dragging ? "bg-content/15" : "hover:bg-content/10"
        }`}
      />
      <div className="absolute top-[5px] right-2 z-30">
        <IconButton
          label={`Close ${kindLabel.toLowerCase()} panel`}
          onClick={onClose}
        >
          <PanelLeft className="size-3.5" strokeWidth={1.75} />
        </IconButton>
      </div>
      <div className="min-h-0 min-w-0 flex-1">
        {item ? (
          <InboxDetail
            key={inboxItemKey(item)}
            item={item}
            cwd={cwd}
            revision={0}
            relatedSessions={[]}
            mode="panel"
            visible={visible}
            repairSessions={repairSessions}
            onRepairChecks={onRepairChecks}
            onOpenSession={onOpenSession}
            onItemChange={setItem}
          />
        ) : error ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
            <CircleX className="size-5 text-rose-400/90" strokeWidth={1.75} />
            <p role="alert" className="max-w-sm text-[12px] text-content/55">
              {error}
            </p>
            <button
              type="button"
              onClick={() => void openUrl(target.url)}
              className={ACTION_OUTLINE}
            >
              <ExternalLink className="size-3.5" strokeWidth={1.75} />
              Open on GitHub
            </button>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-content/40">
            <LoaderCircle className="size-4 animate-spin" strokeWidth={1.75} />
          </div>
        )}
      </div>
    </aside>
  );
}

function InboxDetailBody({
  item,
  cwd,
  revision = 0,
  relatedSessions,
  onDiscuss,
  onStart,
  repairSessions,
  onRepairChecks,
  onOpenSession,
  onItemChange,
}: {
  item: InboxItem | null;
  cwd: string;
  revision?: number;
  relatedSessions: readonly SessionSummary[];
  onDiscuss?: () => void;
  onStart?: (item: InboxItem) => void | Promise<void>;
  repairSessions?: CiRepairProps["repairSessions"];
  onRepairChecks?: CiRepairProps["onRepairChecks"];
  onOpenSession?: (sessionId: string) => void | Promise<void>;
  onItemChange?: (item: InboxItem) => void;
}) {
  if (!item) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 text-center">
        <Inbox className="mb-3 size-6 text-content/30" strokeWidth={1.75} />
        <p className="text-[13px] text-content/45">Select an inbox item</p>
      </div>
    );
  }
  return (
    <InboxDetail
      key={inboxItemKey(item)}
      item={item}
      cwd={cwd}
      revision={revision}
      relatedSessions={relatedSessions}
      onDiscuss={onDiscuss}
      onStart={onStart}
      repairSessions={repairSessions}
      onRepairChecks={onRepairChecks}
      onOpenSession={onOpenSession}
      onItemChange={onItemChange}
    />
  );
}

type InboxStatusMark = {
  Icon: IconComponent;
  className: string;
  label: string;
};

/** Status reads from the glyph first and the color second, so it survives color blindness. */
export function inboxStatusMark(item: InboxItem): InboxStatusMark {
  const label = inboxItemStatus(item);
  const pr = item.kind === "pr";
  if (label === "Draft") {
    return {
      Icon: GitPullRequestDraft,
      className: "text-content/50",
      label,
    };
  }
  if (label === "Merged") {
    return { Icon: GitMerge, className: "text-violet-400/90", label };
  }
  if (label === "Closed") {
    if (
      item.provider === "github" &&
      item.kind === "issue" &&
      item.stateReason?.trim().toLowerCase() === "completed"
    ) {
      return { Icon: CheckCircle, className: "text-violet-400/90", label };
    }
    return {
      Icon: pr ? GitPullRequestClosed : CircleX,
      className: "text-rose-400/90",
      label,
    };
  }
  return {
    Icon: pr ? GitPullRequest : CircleDot,
    className: "text-emerald-400/90",
    label,
  };
}

function InboxCard({
  item,
  active,
  logoPath,
  mascotName,
  mascotColor,
  relatedSessionCount,
  onSelect,
}: {
  item: InboxItem;
  active: boolean;
  logoPath: string | null;
  mascotName: string | null;
  mascotColor: string;
  relatedSessionCount: number;
  onSelect: () => void;
}) {
  useInboxSeenTick();
  const status = inboxStatusMark(item);
  const kindLabel = item.kind === "pr" ? "Pull request" : "Issue";
  const time = formatRelativeTime(item.updatedAt);
  const name = projectName(item.projectPath);
  const source = item.repo || name;
  const unseen = isInboxEntryUnseen({
    key: inboxItemKey(item),
    updatedAt: item.updatedAt,
  });

  return (
    <button
      type="button"
      title={item.title}
      aria-current={active ? "true" : undefined}
      aria-label={`${status.label} ${kindLabel.toLowerCase()} ${inboxItemRef(
        item,
      )}: ${item.title}${unseen ? ", new" : ""}${relatedSessionCount > 0 ? `, ${relatedSessionCount} related ${relatedSessionCount === 1 ? "thread" : "threads"}` : ""}`}
      onClick={onSelect}
      className={`flex w-full flex-col rounded-md border px-2.5 py-2 text-left ${
        active
          ? "border-transparent bg-selection text-content"
          : "border-transparent text-content/80 hover:bg-content/5 hover:text-content"
      }`}
    >
      <span className="flex items-center gap-2">
        <span className="flex min-w-0 flex-1 items-center gap-1.5">
          <InboxProviderMark
            provider={item.provider}
            className="size-3.5 shrink-0"
          />
          <status.Icon
            className={`size-3 shrink-0 ${status.className}`}
            strokeWidth={1.75}
          />
          <span className="min-w-0 truncate text-[11px] text-content/50">
            {kindLabel} · {inboxItemRef(item)}
          </span>
        </span>
        {relatedSessionCount > 0 || time || unseen ? (
          <span className="flex shrink-0 items-center gap-1.5">
            {relatedSessionCount > 0 ? (
              <span
                title={`${relatedSessionCount} related ${relatedSessionCount === 1 ? "thread" : "threads"}`}
                className="inline-flex items-center gap-0.5 text-[11px] tabular-nums text-accent"
              >
                <MessageMultiple className="size-3" strokeWidth={1.75} />
                {relatedSessionCount}
              </span>
            ) : null}
            {time ? (
              <span className="text-[11px] tabular-nums text-content/45">
                {time}
              </span>
            ) : null}
            {unseen ? (
              <span aria-hidden className="size-1.5 rounded-full bg-accent" />
            ) : null}
          </span>
        ) : null}
      </span>
      <span className="mt-1 line-clamp-1 text-[13px] font-semibold leading-snug text-content">
        {item.title}
      </span>
      <span className="mt-1 flex min-w-0 items-center gap-2">
        <span className="flex min-w-0 flex-1 items-center gap-1.5 text-[11px] text-content/45">
          {!item.projectPath ? null : logoPath ? (
            <ProjectLogoIcon
              path={logoPath}
              className="size-3.5 shrink-0 rounded-sm"
              imageClassName="size-3.5"
            />
          ) : (
            <ProjectMascot
              project={name}
              color={mascotColor}
              name={mascotName}
              className="size-3 shrink-0"
            />
          )}
          <span className="min-w-0 truncate">{source}</span>
        </span>
        {item.labels.length > 0 ? (
          <span className="flex min-w-0 shrink-0 items-center gap-1">
            {item.labels.slice(0, 2).map((label) => (
              <InboxLabel key={label.name} label={label} compact />
            ))}
          </span>
        ) : null}
      </span>
    </button>
  );
}

export function inboxShowsFullFileDiff(item: InboxItem): boolean {
  return item.provider === "github" && item.kind === "pr";
}

export function InboxDetail({
  item,
  cwd,
  revision,
  relatedSessions,
  mode = "inbox",
  visible = true,
  onDiscuss,
  onStart,
  repairSessions,
  onRepairChecks,
  onOpenSession,
  onItemChange,
}: {
  item: InboxItem;
  cwd: string;
  revision: number;
  relatedSessions: readonly SessionSummary[];
  mode?: "inbox" | "panel";
  visible?: boolean;
  onDiscuss?: () => void;
  onStart?: (item: InboxItem) => void | Promise<void>;
  repairSessions?: CiRepairProps["repairSessions"];
  onRepairChecks?: CiRepairProps["onRepairChecks"];
  onOpenSession?: (sessionId: string) => void | Promise<void>;
  onItemChange?: (item: InboxItem) => void;
}) {
  const detailLock = useLockOverscroll<HTMLDivElement>();
  const panel = mode === "panel";
  const githubKind = item.kind;
  const isPr = githubKind === "pr";
  const externalActionLabel =
    item.kind === "pr" ? "Review on GitHub" : "Open on GitHub";
  const cached = peekGithubWorkItemDetails(item.repo, githubKind, item.number);
  const cachedDiff = isPr ? peekGithubPrDiff(item.repo, item.number) : null;
  const cachedThread = peekGithubWorkItemThread(
    item.repo,
    githubKind,
    item.number,
  );
  const [details, setDetails] = useState<GithubWorkItemDetails | null>(cached);
  const [loading, setLoading] = useState(cached == null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"summary" | "code" | "checks">("summary");
  const [diffMode, setDiffMode] = useState<"hunks" | "full">("hunks");
  const fullFile = inboxShowsFullFileDiff(item) && diffMode === "full";
  const [prDiff, setPrDiff] = useState<GithubPrDiff | null>(cachedDiff);
  const [diffLoading, setDiffLoading] = useState(isPr && cachedDiff == null);
  const [diffError, setDiffError] = useState<string | null>(null);
  const [thread, setThread] = useState<GithubWorkItemThread | null>(
    cachedThread,
  );
  const [threadLoading, setThreadLoading] = useState(cachedThread == null);
  const [threadError, setThreadError] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<InboxReplyTarget | null>(null);
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const status = inboxItemStatus(item);
  const statusMark = inboxStatusMark(item);

  const source = item.repo || projectName(item.projectPath);
  const markdownCwd = item.projectPath || cwd;
  const authorName = details?.author?.trim() ?? "";
  const extraAssignees = item.assignees.filter(
    (person) =>
      !authorName ||
      person.login.trim().toLowerCase() !== authorName.toLowerCase(),
  );
  const showAssignment =
    extraAssignees.length > 0 || item.assignees.length === 0;
  const reviewDecision =
    details?.reviewDecision?.trim() || thread?.reviewDecision?.trim() || "";
  const reviewLabel = githubReviewDecisionLabel(reviewDecision);
  const reviewClass =
    reviewDecision.toUpperCase() === "APPROVED"
      ? "text-emerald-400/90"
      : reviewDecision.toUpperCase() === "CHANGES_REQUESTED"
        ? "text-rose-400/90"
        : "text-content/50";
  const baseRef =
    details?.baseRefName?.trim() || thread?.baseRefName?.trim() || "";
  const headRef =
    details?.headRefName?.trim() || thread?.headRefName?.trim() || "";

  // Checks load as soon as a GitHub PR is open, whatever tab is active. The
  // panel passes revision 0, so its loads ride on mount and the identity key.
  const prChecksEnabled = githubKind === "pr";
  const prChecksView = useGithubPrChecks({
    cwd: item.projectPath || cwd,
    repo: item.repo,
    number: item.number,
    enabled: prChecksEnabled,
    open: isPr && item.state.trim().toLowerCase() === "open",
    poll: visible,
    revision,
  });
  const prChecksOverall = prChecksEnabled
    ? summarizePrChecks({
        loading: prChecksView.loading,
        error: prChecksView.error,
        checks: prChecksView.checks?.checks ?? null,
      })
    : null;

  useEffect(() => {
    let cancelled = false;
    const cachedDetails = peekGithubWorkItemDetails(
      item.repo,
      githubKind,
      item.number,
    );
    if (cachedDetails) {
      setDetails(cachedDetails);
      setLoading(false);
      setError(null);
    } else {
      setLoading(true);
      setError(null);
      setDetails(null);
    }
    void githubWorkItemDetails(
      item.projectPath,
      item.repo,
      githubKind,
      item.number,
    )
      .then((next) => {
        if (cancelled) return;
        setDetails(next);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (cachedDetails) return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [githubKind, item.number, item.projectPath, item.repo, revision]);

  useEffect(() => {
    let cancelled = false;
    const cachedThread = peekGithubWorkItemThread(
      item.repo,
      githubKind,
      item.number,
    );
    if (cachedThread) {
      setThread(cachedThread);
      setThreadLoading(false);
      setThreadError(null);
    } else {
      setThreadLoading(true);
      setThreadError(null);
      setThread(null);
    }
    void githubWorkItemThread(
      item.projectPath,
      item.repo,
      githubKind,
      item.number,
    )
      .then((next) => {
        if (cancelled) return;
        setThread(next);
        setThreadError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (cachedThread) return;
        setThreadError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setThreadLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [githubKind, item.number, item.projectPath, item.repo, revision]);

  useEffect(() => {
    if (!isPr || tab !== "code") return;
    let cancelled = false;
    const cachedDiff = peekGithubPrDiff(item.repo, item.number, fullFile);
    if (cachedDiff) {
      setPrDiff(cachedDiff);
      setDiffLoading(false);
      setDiffError(null);
    } else {
      setDiffLoading(true);
      setDiffError(null);
      setPrDiff(null);
    }
    void githubPrDiff(item.projectPath, item.repo, item.number, {
      fullContext: fullFile,
    })
      .then((next) => {
        if (cancelled) return;
        setPrDiff(next);
        setDiffError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (cachedDiff) return;
        setDiffError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setDiffLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fullFile, isPr, item.number, item.projectPath, item.repo, revision, tab]);

  const postComment = async (body: string) => {
    setPosting(true);
    setPostError(null);
    try {
      await githubWorkItemComment(
        item.projectPath,
        item.repo,
        githubKind,
        item.number,
        body,
        { inReplyTo: replyTo?.threadId },
      );
      setReplyTo(null);
      try {
        setThread(
          await githubWorkItemThread(
            item.projectPath,
            item.repo,
            githubKind,
            item.number,
            {
              force: true,
            },
          ),
        );
      } catch (err: unknown) {
        setPostError(err instanceof Error ? err.message : String(err));
      }
    } catch (err: unknown) {
      setPostError(err instanceof Error ? err.message : String(err));
      throw err;
    } finally {
      setPosting(false);
    }
  };

  const identityRow = (
    <div
      data-inbox-detail-identity
      data-inbox-detail-fixed-header={panel ? "" : undefined}
      className={`flex min-w-0 items-center gap-2 text-[12px] text-content/50 ${
        panel ? "h-9 shrink-0 border-b border-stroke px-4 pr-[34px]" : ""
      }`}
    >
      <InboxProviderMark
        provider={item.provider}
        className="size-3.5 shrink-0"
      />
      <span className="shrink-0">
        {item.kind === "pr" ? "Pull request" : "Issue"}
      </span>
      <span className="shrink-0 tabular-nums">{inboxItemRef(item)}</span>
      <span
        className={`flex shrink-0 items-center gap-1 ${statusMark.className}`}
      >
        <statusMark.Icon className="size-3.5" strokeWidth={1.75} />
        {status}
      </span>
      {source ? <span className="min-w-0 truncate">{source}</span> : null}
      {panel ? (
        <button
          type="button"
          title={item.url ? externalActionLabel : "No link available"}
          aria-label={externalActionLabel}
          disabled={!item.url}
          onClick={() => void openUrl(item.url)}
          className={`${ACTION_PANEL_HEADER} ml-auto shrink-0 disabled:opacity-40`}
        >
          <ExternalLink className="size-3.5" strokeWidth={1.75} />
          <span className="@max-[420px]/linked:hidden">
            {externalActionLabel}
          </span>
        </button>
      ) : null}
    </div>
  );

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      {panel ? identityRow : null}
      <div
        ref={panel ? detailLock : undefined}
        data-inbox-detail-scroll={panel ? "" : undefined}
        className={
          panel
            ? "min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-none"
            : "contents"
        }
      >
        <div
          data-inbox-detail-header
          className={`relative border-b border-stroke ${
            panel ? "" : "z-10 shrink-0"
          }`}
        >
          <div
            className={`mx-auto flex w-full max-w-5xl flex-col ${
              panel ? "gap-2 px-4 pt-4" : "gap-2.5 px-8 pt-5"
            } ${isPr ? "" : panel ? "pb-4" : "pb-5"}`}
          >
            <header className={`flex flex-col ${panel ? "gap-2" : "gap-2.5"}`}>
              {panel ? null : identityRow}
              <h1
                title={item.title}
                className={`line-clamp-2 font-semibold leading-tight text-content ${
                  panel ? "text-[18px]" : "text-[20px]"
                }`}
              >
                {item.title}
              </h1>
              <div className="flex min-w-0 items-center gap-2 overflow-hidden whitespace-nowrap text-[12px] text-content/50">
                {authorName ? (
                  <InboxPerson
                    name={authorName}
                    avatarUrl={inboxPersonAvatarUrl(
                      item.provider,
                      authorName,
                      details?.authorAvatarUrl,
                    )}
                    size={16}
                  />
                ) : null}
                {showAssignment ? (
                  <>
                    {authorName ? <span aria-hidden>·</span> : null}
                    {extraAssignees.length > 0 ? (
                      <span className="flex min-w-0 items-center gap-2 overflow-hidden">
                        {extraAssignees.map((person) => (
                          <InboxPerson
                            key={person.login}
                            name={person.login}
                            avatarUrl={inboxPersonAvatarUrl(
                              item.provider,
                              person.login,
                              person.avatarUrl,
                            )}
                            size={16}
                          />
                        ))}
                      </span>
                    ) : (
                      <span>Unassigned</span>
                    )}
                  </>
                ) : null}
                {item.createdAt && formatRelativeTime(item.createdAt) ? (
                  <>
                    <span aria-hidden>·</span>
                    <time
                      dateTime={item.createdAt}
                      title={new Date(item.createdAt).toLocaleString()}
                    >
                      Created {formatRelativeTime(item.createdAt)}
                    </time>
                  </>
                ) : null}
                {formatRelativeTime(item.updatedAt) ? (
                  <>
                    <span aria-hidden>·</span>
                    <span>Updated {formatRelativeTime(item.updatedAt)}</span>
                  </>
                ) : null}
                {baseRef && headRef ? (
                  <>
                    <span aria-hidden>·</span>
                    <span className="inline-flex min-w-0 items-center gap-1">
                      <GitCompare
                        className="size-3 shrink-0"
                        strokeWidth={1.75}
                      />
                      <span className="min-w-0 truncate">
                        {baseRef} ← {headRef}
                      </span>
                      <CopyBranchNameButton branch={headRef} />
                    </span>
                  </>
                ) : null}
                {reviewLabel ? (
                  <>
                    <span aria-hidden>·</span>
                    <span className={reviewClass}>{reviewLabel}</span>
                  </>
                ) : null}
              </div>
              {!panel && relatedSessions.length > 0 ? (
                <div className="flex min-w-0 items-center gap-1.5 overflow-hidden">
                  <span className="mr-0.5 inline-flex shrink-0 items-center gap-1 text-[11px] text-content/45">
                    <MessageMultiple className="size-3.5" strokeWidth={1.75} />
                    Related{" "}
                    {relatedSessions.length === 1 ? "thread" : "threads"}
                  </span>
                  {relatedSessions.map((session) => {
                    const title = sessionDisplayTitle(
                      session.title,
                      session.harness,
                    );
                    return (
                      <button
                        key={session.id}
                        type="button"
                        title={`Open thread: ${title}`}
                        onClick={() => void onOpenSession?.(session.id)}
                        className="inline-flex min-w-0 max-w-64 items-center gap-1 rounded-md bg-content/5 px-2 py-1 text-[11px] text-content/70 hover:bg-content/10 hover:text-content"
                      >
                        <span className="truncate">{title}</span>
                        {session.archived ? (
                          <span className="shrink-0 text-content/40">
                            Archived
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              ) : null}
              <div className="flex flex-wrap items-center gap-2 pt-0.5">
                {onStart && item.kind !== "pr" ? (
                  <>
                    <button
                      type="button"
                      disabled={starting}
                      onClick={() => {
                        if (starting) return;
                        setStarting(true);
                        setStartError(null);
                        void Promise.resolve(onStart(item))
                          .catch((err: unknown) => {
                            setStartError(
                              err instanceof Error ? err.message : String(err),
                            );
                          })
                          .finally(() => setStarting(false));
                      }}
                      className={`${ACTION_FILLED} disabled:cursor-default disabled:opacity-40`}
                    >
                      {starting ? "Sending..." : "Send to agent"}
                    </button>
                  </>
                ) : null}
                {githubKind === "pr" ? (
                  <GithubPrActions
                    pr={{
                      cwd: item.projectPath,
                      repo: item.repo,
                      number: item.number,
                      state: item.state,
                      draft: item.draft,
                    }}
                    baseRef={baseRef}
                    headRef={headRef}
                    onChange={(next) =>
                      onItemChange?.({
                        ...item,
                        state: next.state,
                        draft: next.draft,
                      })
                    }
                  />
                ) : null}
                {onDiscuss ? (
                  <button
                    type="button"
                    onClick={onDiscuss}
                    className={ACTION_OUTLINE}
                  >
                    <MessageSquare className="size-3.5" strokeWidth={1.75} />{" "}
                    Ask
                  </button>
                ) : null}
                {panel ? null : (
                  <button
                    type="button"
                    title={item.url ? externalActionLabel : "No link available"}
                    disabled={!item.url}
                    onClick={() => void openUrl(item.url)}
                    className={`${ACTION_GHOST} disabled:opacity-40`}
                  >
                    <ExternalLink className="size-3.5" strokeWidth={1.75} />
                    {externalActionLabel}
                  </button>
                )}
              </div>
              {startError ? (
                <p className="text-[12px] text-red-400/90">{startError}</p>
              ) : null}
            </header>
            {isPr ? (
              <div className="flex h-9 items-stretch gap-4">
                <div
                  role="tablist"
                  aria-label={
                    "Pull request sections"
                  }
                  className="flex items-stretch gap-4"
                >
                  <InboxDetailTab
                    label="Summary"
                    selected={tab === "summary"}
                    onSelect={() => setTab("summary")}
                  />
                  <InboxDetailTab
                    label="Code"
                    selected={tab === "code"}
                    onSelect={() => setTab("code")}
                  />
                  {prChecksOverall ? (
                    <PrChecksTab
                      overall={prChecksOverall}
                      selected={tab === "checks"}
                      onSelect={() => setTab("checks")}
                    />
                  ) : null}
                </div>
                {tab === "code" && inboxShowsFullFileDiff(item) ? (
                  <div
                    role="group"
                    aria-label="Diff context"
                    className="ml-auto flex items-center self-center rounded-md border border-content/10 bg-content/[0.03] p-0.5"
                  >
                    <button
                      type="button"
                      aria-pressed={diffMode === "hunks"}
                      onClick={() => setDiffMode("hunks")}
                      className={`rounded px-2.5 py-1 text-[11px] leading-none ${
                        diffMode === "hunks"
                          ? "bg-selection text-content"
                          : "text-content/45 hover:text-content/70"
                      }`}
                    >
                      Hunks
                    </button>
                    <button
                      type="button"
                      aria-pressed={diffMode === "full"}
                      onClick={() => setDiffMode("full")}
                      className={`rounded px-2.5 py-1 text-[11px] leading-none ${
                        diffMode === "full"
                          ? "bg-selection text-content"
                          : "text-content/45 hover:text-content/70"
                      }`}
                    >
                      Full file
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
        <div
          ref={panel ? undefined : detailLock}
          data-inbox-detail-scroll={panel ? undefined : ""}
          className={
            panel
              ? "min-w-0"
              : "min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-none"
          }
        >
          <div
            className={`mx-auto flex w-full max-w-5xl flex-col ${
              panel ? "gap-4 px-4 py-4" : "gap-5 px-8 py-5"
            }`}
          >
            {item.labels.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {item.labels.map((label) => (
                  <InboxLabel key={label.name} label={label} />
                ))}
              </div>
            ) : null}
            {isPr && tab === "code" ? (
              diffLoading ? (
                <div className="flex justify-center py-10 text-content/40">
                  <LoaderCircle
                    className="size-4 animate-spin"
                    strokeWidth={1.75}
                  />
                </div>
              ) : diffError ? (
                <p className="text-[13px] text-content/50">{diffError}</p>
              ) : prDiff ? (
                <InboxPrDiff
                  key={`${item.projectPath}:${item.number}:${revision}:${diffMode}`}
                  diff={prDiff}
                  fullFile={fullFile}
                />
              ) : (
                <p className="text-[13px] text-content/45">No file changes</p>
              )
            ) : isPr && tab === "checks" ? (
              <PrChecks
                view={prChecksView}
                onRefresh={prChecksView.refresh}
                cwd={item.projectPath || cwd}
                repo={item.repo}
                repair={
                  onRepairChecks &&
                  item.provider === "github" &&
                  item.projectPath
                    ? {
                        number: item.number,
                        onOpenSession,
                        sessions: (repairSessions ?? []).filter(
                          (session) =>
                            !session.archived &&
                            !session.orchestrationLeadId &&
                            sameProjectPath(session.cwd, item.projectPath),
                        ),
                        onStart: (request, sessionId) =>
                          onRepairChecks(item, request, sessionId),
                      }
                    : undefined
                }
              />
            ) : loading ? (
              <div className="flex justify-center py-10 text-content/40">
                <LoaderCircle
                  className="size-4 animate-spin"
                  strokeWidth={1.75}
                />
              </div>
            ) : error ? (
              <p className="text-[13px] text-content/50">{error}</p>
            ) : (
              <>
                {details?.body.trim() ? (
                  <AgentMarkdown
                    text={details.body}
                    cwd={markdownCwd}
                    allowRemoteMedia
                  />
                ) : (
                  <p className="text-[13px] text-content/45">No description</p>
                )}
                <InboxComments
                  thread={thread}
                  loading={threadLoading}
                  error={threadError}
                  cwd={markdownCwd}
                  provider={item.provider}
                  onReply={setReplyTo}
                />
                <InboxCommentForm
                  replyTo={replyTo}
                  posting={posting}
                  error={postError}
                  onCancelReply={() => {
                    setReplyTo(null);
                    setPostError(null);
                  }}
                  onSubmit={postComment}
                />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function CopyBranchNameButton({ branch }: { branch: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    setCopied(false);
    return () => {
      if (timer.current != null) window.clearTimeout(timer.current);
    };
  }, [branch]);

  return (
    <button
      type="button"
      title={copied ? "Copied" : "Copy branch name"}
      aria-label={copied ? "Copied" : "Copy branch name"}
      className="shrink-0 rounded p-0.5 text-content/40 hover:bg-content/8 hover:text-content/70"
      onClick={() => {
        void copyText(branch).then(
          () => {
            playCue("copy");
            setCopied(true);
            if (timer.current != null) window.clearTimeout(timer.current);
            timer.current = window.setTimeout(() => setCopied(false), 2000);
          },
          () => {},
        );
      }}
    >
      {copied ? (
        <Check className="size-3" strokeWidth={1.75} />
      ) : (
        <Copy className="size-3" strokeWidth={1.75} />
      )}
    </button>
  );
}

function InboxPerson({
  name,
  avatarUrl,
  size = 20,
  className = "",
}: {
  name: string;
  avatarUrl?: string;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(!avatarUrl);
  const initial = name.trim().charAt(0).toUpperCase() || "?";

  useEffect(() => {
    setFailed(!avatarUrl);
  }, [avatarUrl]);

  return (
    <span className={`inline-flex min-w-0 items-center gap-1.5 ${className}`}>
      {avatarUrl && !failed ? (
        <img
          src={avatarUrl}
          alt=""
          width={size}
          height={size}
          referrerPolicy="no-referrer"
          draggable={false}
          onError={() => setFailed(true)}
          className="shrink-0 rounded-full bg-content/10 object-cover"
          style={{ width: size, height: size }}
        />
      ) : (
        <span
          aria-hidden
          className="grid shrink-0 place-items-center rounded-full bg-content/12 font-medium text-content/55"
          style={{
            width: size,
            height: size,
            fontSize: Math.max(9, Math.round(size * 0.45)),
          }}
        >
          {initial}
        </span>
      )}
      <span className="min-w-0 truncate">{name}</span>
    </span>
  );
}

function InboxLabel({
  label,
  compact = false,
}: {
  label: GithubLabel;
  compact?: boolean;
}) {
  const color = labelColor(label.color);
  return (
    <span
      className={`inline-flex min-w-0 items-center gap-1 rounded px-1.5 py-px text-content/50 bg-content/8 ${
        compact ? "max-w-20 text-[10px]" : "text-[11px]"
      }`}
    >
      {color ? (
        <span
          aria-hidden
          className="size-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: color }}
        />
      ) : null}
      <span className="min-w-0 truncate">{label.name}</span>
    </span>
  );
}

function labelColor(value: string): string | null {
  const hex = value.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return null;
  return `#${hex}`;
}
