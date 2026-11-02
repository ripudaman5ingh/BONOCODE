import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ask } from "@tauri-apps/plugin-dialog";
import {
  ArrowDownCircle,
  ExternalLink,
  FolderOpen,
  Globe,
  ImagePlus,
  Loader,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
  X,
} from "../../../shared/ui/icons";
import {
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { HarnessIcon } from "../../sessions/ui/HarnessIcon";
import { Popover } from "../../../shared/ui/Popover";
import { SecondaryButton } from "../../../shared/ui/SecondaryButton";
import { GradientBlurBackground } from "./GradientBlurBackground";
import { McpSettings } from "./McpSettings";
import {
  Group,
  RevealedSetting,
  Row,
  Segmented,
  Select,
  settingDomId,
  Slider,
  Toggle,
} from "./settingsControls";
import { InboxProviderMark } from "../../github/ui/InboxProviderMark";
import { RemoveProjectDialog } from "../../projects/ui/RemoveProjectDialog";
import { WindowControls } from "../../../app/shell/WindowControls";
import { useLockOverscroll } from "../../../shared/hooks/useLockOverscroll";
import {
  applyChatBackground,
  applyChatBackgroundEmptyOpacity,
  applyChatBackgroundSessionOpacity,
  applyChatBackgroundScope,
  CHAT_BACKGROUND_EMPTY_OPACITY_DEFAULT,
  CHAT_BACKGROUND_OPACITY_MAX,
  CHAT_BACKGROUND_OPACITY_MIN,
  CHAT_BACKGROUND_SESSION_OPACITY_DEFAULT,
  CHAT_BACKGROUND_SCOPE_DEFAULT,
  chatBackgroundSrc,
  loadChatBackgroundEmptyOpacity,
  loadChatBackgroundPath,
  loadChatBackgroundSessionOpacity,
  loadChatBackgroundScope,
  loadNewThreadBackgroundEffect,
  loadTranscriptLayout,
  loadTranscriptAnchor,
  saveChatBackgroundEmptyOpacity,
  saveChatBackgroundPath,
  saveChatBackgroundSessionOpacity,
  saveChatBackgroundScope,
  setNewThreadBackgroundEffect,
  saveTranscriptLayout,
  saveTranscriptAnchor,
  TRANSCRIPT_ANCHOR_CHANGE_EVENT,
  loadShowExcludedFiles,
  saveShowExcludedFiles,
  SHOW_EXCLUDED_FILES_DEFAULT,
  type ChatBackgroundScope,
  NEW_THREAD_BACKGROUND_EFFECTS,
  NEW_THREAD_BACKGROUND_EFFECT_LABELS,
  NEW_THREAD_BACKGROUND_EFFECT_DESCRIPTIONS,
  NEW_THREAD_BACKGROUND_EFFECT_DEFAULT,
  type NewThreadBackgroundEffect,
  type TranscriptLayout,
} from "../model/appearance";
import {
  activeTheme,
  DEFAULT_THEME_ID,
  setTheme,
  useThemes,
} from "../../themes/model/themeEngine";
import { ThemeEditor } from "../../themes/ui/ThemeEditor";
import {
  pickAndSaveChatBackground,
  removeChatBackground,
} from "../../projects/model/chatBackground";
import {
  applyUiScale,
  loadUiScale,
  saveUiScale,
  subscribeUiScale,
  UI_SCALE_DEFAULT,
  UI_SCALE_PERCENTS,
} from "../model/uiScale";
import {
  getHarnessAvailabilitySnapshot,
  harnessUnavailableHint,
  isHarnessAvailable,
  probeHarnessAvailability,
  subscribeHarnessAvailability,
} from "../../../integrations/harness/core/availability";
import {
  inspectHarnessBinary,
  type HarnessBinaryInspection,
} from "../../../integrations/harness/core/child";
import {
  loadProviderBinaryPath,
  providerBinaryPathChangePending,
  saveProviderBinaryPath,
  type ConfigurableBinaryProvider,
} from "../../providers/model/providerBinaryPaths";
import {
  compareSemver,
  MINIMUM_OPENCODE_VERSION,
  parseOpenCodeVersion,
} from "../../../integrations/harness/providers/opencode/opencodeProtocol";
import { refreshHarnessCatalogs } from "../../../integrations/harness/core/registry";
import { loginHarness } from "../../../integrations/harness/core/auth";
import {
  defaultModelId,
  firstEnabledHarness,
  getModelSnapshot,
  loadDefaultModels,
  loadHiddenPickerProviders,
  loadLastModelChoice,
  modelsFor,
  resolveModel,
  saveDefaultModel,
  saveLastModelChoice,
  savePickerProviderVisible,
  subscribeModels,
} from "../../sessions/model/models";
import {
  pathKey,
  prettyCwd,
  projectKey,
  projectName,
} from "../../../shared/lib/paths";
import { revealPath } from "../../../platform/tauri/fs";
import { IS_MAC, IS_WIN } from "../../../platform/tauri/platform";
import {
  loadArchivedProjects,
  looksLikeProject,
  subscribeArchivedProjects,
  type ArchivedProject,
  type RecentProject,
} from "../../projects/model/recents";
import {
  HARNESSES,
  HARNESS_TITLE,
  sessionDisplayTitle,
  type HarnessId,
} from "../../sessions/model/session";
import {
  loadProjectProviderSettings,
  projectProvidersRevision,
  setProjectDefaultModel,
  setProjectDefaultProvider,
  setProjectProviderHidden,
  subscribeProjectProviders,
} from "../../sessions/model/projectProviders";
import {
  newProviderAccount,
  providerAccounts,
  PROVIDER_ACCOUNT_PROVIDERS,
  removeProviderAccount,
  renameProviderAccount,
  saveProviderAccount,
  subscribeProviderAccounts,
  type ProviderAccount,
  type ProviderAccountProvider,
} from "../../providers/model/providerAccounts";
import { removeProviderAccountCredentials } from "../../providers/model/providerAccountCredentials";
import {
  identityKey,
  identityOrganizationTag,
  useProviderAccountIdentities,
} from "../../providers/model/providerAccountIdentity";
import { ProviderAccountSubtitle } from "../../providers/ui/ProviderAccountSubtitle";
import {
  accountStatus,
  accountUsageKey,
  useProviderAccountUsage,
} from "../../providers/model/accountUsage";
import { clearCachedRateLimits } from "../../providers/model/rateLimitsCache";
import {
  AccountStatusLabel,
  AccountUsageMeters,
  AccountUsageRefresh,
} from "../../providers/ui/ProviderAccountUsage";
import {
  loadSessionSidebarFilters,
  saveSessionSidebarFilters,
} from "../../sessions/model/sessionFilters";
import type { SessionSummary } from "../../sessions/data/sessionStore";
import { githubStatus, type GithubStatus } from "../../github/model/githubTasks";
import {
  loadTabGroupColors,
  loadTabGroupCustomColors,
  loadTabGroupLabels,
  loadTabGroupMascots,
  resolveTabGroupColor,
  resolveTabGroupLabel,
  resolveTabGroupLogo,
  resolveTabGroupMascot,
} from "../../workspace/model/tabGroups";
import { useTabGroupLogos } from "../../projects/hooks/useTabGroupLogos";
import { ProjectLogoIcon } from "../../projects/ui/ProjectLogoIcon";
import { ProjectMascot } from "../../projects/ui/ProjectMascot";
import {
  AGENT_IDLE_OPTIONS,
  filterKeybindings,
  currentKeybindings,
  loadAgentIdleMs,
  loadClaudeHooks,
  loadCloseToTray,
  loadCollapsedProjectRailMode,
  loadComposerRunner,
  loadDiffViewer,
  loadFileTabMode,
  loadFollowUpBehavior,
  loadFormatOnSave,
  loadLiveAgentsEnabled,
  loadModelControls,
  loadKeybindingOverrides,
  loadTabAnimationsEnabled,
  saveAgentIdleMs,
  saveClaudeHooks,
  saveCloseToTray,
  saveCollapsedProjectRailMode,
  saveComposerRunner,
  saveDiffViewer,
  saveFileTabMode,
  saveFollowUpBehavior,
  saveFormatOnSave,
  saveLiveAgentsEnabled,
  saveModelControls,
  saveKeybindingOverride,
  subscribeKeybindings,
  type KeybindingOverride,
  saveTabAnimationsEnabled,
  searchSettings,
  settingsSectionDescription,
  settingsSectionLabel,
  COLLAPSED_PROJECT_RAIL_MODE_DEFAULT,
  type CollapsedProjectRailMode,
  type DiffViewer,
  type FileTabMode,
  type FollowUpBehavior,
  type ModelControls,
  type SettingsSearchResult,
  type SettingsSectionId,
} from "../model/settings";
import { loadSoundsEnabled, saveSoundsEnabled } from "../model/sounds";
import {
  shortcutFromKeyEvent,
  shortcutPreview,
} from "../model/shortcutFormat";
import {
  cachedNotificationPermission,
  loadNotificationsEnabled,
  openNotificationSettings,
  probeNotificationPermission,
  requestNotificationPermission,
  saveNotificationsEnabled,
  type NotificationPermission,
} from "../../notifications/model/notifications";
import {
  installPendingUpdate,
  readAppVersion,
  runUpdateFlow,
  type UpdaterSnapshot,
} from "../../../app/model/updater";

import { SkillsPage } from "../../skills/ui/SkillsPage";
import { ProjectNotificationSettings } from "../../notifications/ui/ProjectNotificationSettings";
import { WorktreesPage } from "../../source-control/ui/WorktreesPage";
import {
  removeWorktree,
  type RemoveWorktree,
} from "../../source-control/model/worktrees";
import type { Session } from "../../sessions/model/session";

/**
 * The `data-setting-id` Settings should reveal when it opens: one of the ids in
 * `SETTINGS_INDEX`. Notification and GitHub settings pass their anchor id.
 */
export type SettingsAnchor = string;

type Props = {
  section: SettingsSectionId;
  /** Card to scroll to; the General page is too long to land at the top. */
  anchor?: SettingsAnchor | null;
  /** Project to focus when opening notification settings from a quick action. */
  notificationProjectPath?: string | null;
  /** Changes for each quick action, including repeated requests for one project. */
  notificationSettingsRequest?: number;
  recents?: RecentProject[];
  cwd: string;
  sessions: SessionSummary[];
  liveSessions?: Session[];
  onRemoveWorktree?: RemoveWorktree;
  onCheckWorktreeRemoval?: RemoveWorktree;
  onDeleteWorktreeSessions?: (
    sessionIds: readonly string[],
  ) => Promise<boolean>;
  besideRail?: boolean;
  onClose: () => void;
  /** Lets search jump to a setting that lives on another page. */
  onSelectSection?: (section: SettingsSectionId) => void;
  onOpenSession: (sessionId: string) => void;
  onArchiveSession: (sessionId: string, archived: boolean) => void;
  onDeleteSession: (sessionId: string) => void;
  onRestoreProject?: (path: string) => void;
  onDeleteProject?: (path: string) => void;
  onOpenWhatsNew: (version: string) => void;
  collapsedProjectRailMode?: CollapsedProjectRailMode;
  onCollapsedProjectRailModeChange?: (mode: CollapsedProjectRailMode) => void;
};

export function SettingsView({
  section,
  anchor = null,
  notificationProjectPath = null,
  notificationSettingsRequest = 0,
  recents,
  cwd,
  sessions,
  liveSessions,
  onRemoveWorktree = removeWorktree,
  onCheckWorktreeRemoval,
  onDeleteWorktreeSessions,
  besideRail = false,
  onClose,
  onSelectSection,
  onOpenSession,
  onArchiveSession,
  onDeleteSession,
  onRestoreProject,
  onDeleteProject,
  onOpenWhatsNew,
  collapsedProjectRailMode,
  onCollapsedProjectRailModeChange,
}: Props) {
  const lockOverscroll = useLockOverscroll<HTMLDivElement>();
  const [revealed, setRevealed] = useState<string | null>(anchor);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const appearance = useAppearanceSettings(
    collapsedProjectRailMode,
    onCollapsedProjectRailModeChange,
  );

  useEffect(() => setRevealed(anchor), [anchor, notificationSettingsRequest]);

  // Section is a dependency so a search result on another page scrolls once
  // that page has mounted the row.
  useEffect(() => {
    if (!revealed) return;
    // A project quick action lets the project card focus itself after discovery.
    if (!(revealed === "project-notifications" && notificationProjectPath)) {
      document
        .getElementById(settingDomId(revealed))
        ?.scrollIntoView?.({ block: "center" });
    }
    const timer = window.setTimeout(() => setRevealed(null), 1800);
    return () => window.clearTimeout(timer);
  }, [revealed, section, notificationProjectPath, notificationSettingsRequest]);

  const onReveal = useCallback(
    (next: SettingsSectionId, settingId: string | null) => {
      if (next !== section) onSelectSection?.(next);
      setRevealed(settingId);
    },
    [onSelectSection, section],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      event.stopPropagation();
      onCloseRef.current();
    };
    // Let dialogs and other Settings controls handle Escape first.
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div
      role="region"
      aria-label="Settings"
      data-app-settings
      className="flex min-h-0 min-w-0 flex-1 flex-col text-content"
    >
      <div
        className="flex h-10 shrink-0 select-none items-center border-b border-stroke"
        data-tauri-drag-region="deep"
      >
        {IS_MAC && !besideRail ? <div className="w-[78px] shrink-0" /> : null}
        <div className="flex min-w-0 flex-1 items-center gap-2 px-3 text-[13px]">
          <span className="shrink-0 text-content/45">Settings</span>
          <span aria-hidden className="shrink-0 text-content/25">
            /
          </span>
          <span className="min-w-0 truncate text-content">
            {settingsSectionLabel(section)}
          </span>
        </div>
        <div
          className="flex shrink-0 items-center gap-1.5 pr-2"
          data-tauri-drag-region="false"
        >
          {section === "appearance" ? (
            <button
              type="button"
              onClick={appearance.restoreDefaults}
              className="flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-[12px] text-content/50 hover:bg-content/10 hover:text-content"
            >
              <RotateCcw className="size-3.5" strokeWidth={1.75} />
              Restore defaults
            </button>
          ) : null}
          <SettingsSearch onReveal={onReveal} />
        </div>
        {IS_MAC ? null : <WindowControls />}
      </div>

      {section === "skills" ? (
        <SkillsPage
          key={cwd}
          cwd={cwd}
          header={
            <PageHeader
              title={settingsSectionLabel(section)}
              description={settingsSectionDescription(section)}
            />
          }
        />
      ) : (
        <RevealedSetting.Provider value={revealed}>
          <div
            ref={lockOverscroll}
            className="@container/settings min-h-0 flex-1 overflow-y-auto overscroll-none"
          >
            <div className="mx-auto w-full max-w-5xl px-5 py-6 pb-16 @min-[560px]/settings:px-8 @min-[560px]/settings:py-8">
              <PageHeader
                title={settingsSectionLabel(section)}
                description={settingsSectionDescription(section)}
              />
              {section === "general" ? (
                <GeneralPage onOpenWhatsNew={onOpenWhatsNew} />
              ) : null}
              {section === "appearance" ? (
                <AppearancePage appearance={appearance} />
              ) : null}
              {section === "chat" ? <ChatPage /> : null}
              {section === "keybindings" ? <KeybindingsPage /> : null}
              {section === "mcp" ? (
                <McpSettings cwd={cwd} recents={recents} />
              ) : null}
              {section === "providers" ? (
                <ProvidersPage cwd={cwd} recents={recents} />
              ) : null}
              {section === "worktrees" ? (
                <WorktreesPage
                  cwd={cwd}
                  recents={recents}
                  liveSessions={liveSessions}
                  onRemove={onRemoveWorktree}
                  onCheckRemove={onCheckWorktreeRemoval}
                  onDeleteSessions={onDeleteWorktreeSessions}
                />
              ) : null}
              {section === "github" ? (
                <InboxPage
                  cwd={cwd}
                  recents={recents}
                  notificationProjectPath={notificationProjectPath}
                  notificationSettingsRequest={notificationSettingsRequest}
                />
              ) : null}
              {section === "archive" ? (
                <ArchivePage
                  cwd={cwd}
                  sessions={sessions}
                  onOpenSession={onOpenSession}
                  onArchiveSession={onArchiveSession}
                  onDeleteSession={onDeleteSession}
                  onRestoreProject={onRestoreProject}
                  onDeleteProject={onDeleteProject}
                />
              ) : null}
            </div>
          </div>
        </RevealedSetting.Provider>
      )}
    </div>
  );
}

/** Jumps to any setting by name, including ones on another page. */
function SettingsSearch({
  onReveal,
}: {
  onReveal: (section: SettingsSectionId, settingId: string | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const results = useMemo(() => searchSettings(query), [query]);
  const open = query.trim().length > 0;

  useEffect(() => setActive(0), [query]);

  const go = (result: SettingsSearchResult | undefined) => {
    if (!result) return;
    onReveal(result.section, result.settingId);
    setQuery("");
    input.current?.blur();
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => Math.min(results.length - 1, index + 1));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => Math.max(0, index - 1));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      go(results[active]);
    }
  };

  return (
    <div ref={root} className="relative shrink-0">
      <label className="flex h-7 w-48 items-center gap-2 rounded-md border border-content/10 px-2 text-content/45 focus-within:border-content/20">
        <Search className="size-3.5 shrink-0" strokeWidth={1.75} />
        <input
          ref={input}
          role="combobox"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Search settings"
          aria-label="Search settings"
          aria-expanded={open}
          aria-controls={listId}
          spellCheck={false}
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent text-[12px] text-content outline-none placeholder:text-content/35"
        />
        {query ? (
          <button
            type="button"
            aria-label="Clear settings search"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              setQuery("");
              input.current?.focus();
            }}
            className="grid size-4 shrink-0 place-items-center rounded text-content/45 hover:text-content"
          >
            <X className="size-3" strokeWidth={2} />
          </button>
        ) : null}
      </label>
      {open ? (
        <Popover
          anchor={root}
          side="bottom"
          align="end"
          width={300}
          maxHeight={320}
          onDismiss={(reason) => {
            setQuery("");
            if (reason === "escape") input.current?.focus();
          }}
          id={listId}
          role="listbox"
          aria-label="Settings search results"
          className="overflow-y-auto overscroll-contain p-1"
        >
          {results.length === 0 ? (
            <p className="px-2 py-1.5 text-[12px] text-content/45">
              No matching settings
            </p>
          ) : (
            results.map((result, index) => (
              <button
                key={`${result.section}:${result.settingId ?? "*"}`}
                type="button"
                role="option"
                aria-selected={index === active}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActive(index)}
                onClick={() => go(result)}
                className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12px] ${
                  index === active
                    ? "bg-selection text-content"
                    : "text-content hover:bg-content/5"
                }`}
              >
                <span className="min-w-0 flex-1 truncate">{result.label}</span>
                <span className="shrink-0 text-[11px] text-content/40">
                  {result.settingId ? result.sectionLabel : "Page"}
                </span>
              </button>
            ))
          )}
        </Popover>
      ) : null}
    </div>
  );
}

function GeneralPage({
  onOpenWhatsNew,
}: {
  onOpenWhatsNew: (version: string) => void;
}) {
  const [soundsEnabled, setSoundsEnabled] = useState(loadSoundsEnabled);
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    loadNotificationsEnabled,
  );
  const [notificationPermission, setNotificationPermission] =
    useState<NotificationPermission>(cachedNotificationPermission);
  const [liveAgentsEnabled, setLiveAgentsEnabled] = useState(
    loadLiveAgentsEnabled,
  );
  const [fileTabMode, setFileTabMode] = useState<FileTabMode>(loadFileTabMode);
  const [tabAnimationsEnabled, setTabAnimationsEnabled] = useState(
    loadTabAnimationsEnabled,
  );
  const [closeToTray, setCloseToTray] = useState(loadCloseToTray);

  // The user may flip the switch in System Settings and come back: re-read
  // the OS state whenever the window regains focus while the toggle is on.
  useEffect(() => {
    if (!notificationsEnabled) return;
    const refresh = () => {
      void probeNotificationPermission().then(setNotificationPermission);
    };
    refresh();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [notificationsEnabled]);

  const onSoundsEnabled = (next: boolean) => {
    saveSoundsEnabled(next);
    setSoundsEnabled(next);
  };

  const onNotificationsEnabled = (next: boolean) => {
    saveNotificationsEnabled(next);
    setNotificationsEnabled(next);
    if (!next) return;
    void requestNotificationPermission().then(setNotificationPermission);
  };

  const onLiveAgentsEnabled = (next: boolean) => {
    saveLiveAgentsEnabled(next);
    setLiveAgentsEnabled(next);
  };

  const onFileTabMode = (next: FileTabMode) => {
    saveFileTabMode(next);
    setFileTabMode(next);
  };

  const onTabAnimationsEnabled = (next: boolean) => {
    saveTabAnimationsEnabled(next);
    setTabAnimationsEnabled(next);
  };

  const onCloseToTray = (next: boolean) => {
    saveCloseToTray(next);
    setCloseToTray(next);
  };

  return (
    <>
      <Group
        title="Alerts"
        description="How Bonocode reaches you while you are looking somewhere else."
      >
        <Row
          id="sounds"
          label="Sounds"
          description="Short cues for project activity, finished turns, and available updates. Choose project notification categories in GitHub & notifications settings. Switches and Copy on a finished turn also play."
        >
          <Toggle
            label="Sounds"
            on={soundsEnabled}
            onChange={onSoundsEnabled}
          />
        </Row>
        <Row
          id="notifications"
          label="Notifications"
          description="Notify when an agent finishes or needs input in another session or while Bonocode is in the background. Click the notification to open that session."
        >
          {notificationsEnabled && notificationPermission === "denied" ? (
            <NotificationsBlocked />
          ) : null}
          {notificationsEnabled && notificationPermission === "unsupported" ? (
            <span className="text-[12px] text-content/45">
              Not available on this platform
            </span>
          ) : null}
          <Toggle
            label="Notifications"
            on={notificationsEnabled}
            onChange={onNotificationsEnabled}
          />
        </Row>
      </Group>

      <Group
        title="Workspace"
        description="How project navigation and workspace tabs behave."
      >
        <Row
          id="file-tabs"
          label="File tabs"
          description="Open files beside the active chat, or give each file a normal tab in the top bar. Top-bar files can still be combined into split panes."
        >
          <Segmented
            label="File tabs"
            value={fileTabMode}
            options={[
              { value: "pane", label: "Beside chat" },
              { value: "workspace", label: "Top bar" },
            ]}
            onChange={onFileTabMode}
          />
        </Row>
        <Row
          id="tab-animations"
          label="Tab animations"
          description="Animate tabs as they open and close. Turn this off for instant tab changes."
        >
          <Toggle
            label="Tab animations"
            on={tabAnimationsEnabled}
            onChange={onTabAnimationsEnabled}
          />
        </Row>
        <Row
          id="working-agents"
          label="Working agents"
          description="When two or more chats are in flight, a card on the project rail lists them so you can jump across projects. Finished turns stay until you open that session."
        >
          <Toggle
            label="Working agents"
            on={liveAgentsEnabled}
            onChange={onLiveAgentsEnabled}
          />
        </Row>
        {IS_WIN && (
          <Row
            id="close-to-tray"
            label="Close to tray"
            description="Closing a window hides it to the system tray instead of quitting, so running agents keep going. Reopen from the tray icon, and quit for real from its menu. Turn this off to have close end the window."
          >
            <Toggle
              label="Close to tray"
              on={closeToTray}
              onChange={onCloseToTray}
            />
          </Row>
        )}
      </Group>

      <Group title="About">
        <UpdateRow onOpenWhatsNew={onOpenWhatsNew} />
      </Group>
    </>
  );
}

function ChatPage() {
  const [transcriptLayout, setTranscriptLayout] =
    useState<TranscriptLayout>(loadTranscriptLayout);
  const [transcriptAnchor, setTranscriptAnchor] =
    useState(loadTranscriptAnchor);
  const [followUpBehavior, setFollowUpBehavior] =
    useState<FollowUpBehavior>(loadFollowUpBehavior);
  const [modelControls, setModelControls] =
    useState<ModelControls>(loadModelControls);
  const [diffViewer, setDiffViewer] = useState<DiffViewer>(loadDiffViewer);
  const [formatOnSave, setFormatOnSave] = useState(loadFormatOnSave);
  const [composerRunner, setComposerRunner] = useState(loadComposerRunner);

  useEffect(() => {
    const onAnchor = (event: Event) => {
      setTranscriptAnchor((event as CustomEvent<boolean>).detail === true);
    };
    window.addEventListener(TRANSCRIPT_ANCHOR_CHANGE_EVENT, onAnchor);
    return () => {
      window.removeEventListener(TRANSCRIPT_ANCHOR_CHANGE_EVENT, onAnchor);
    };
  }, []);

  const onTranscriptLayout = (next: TranscriptLayout) => {
    saveTranscriptLayout(next);
    setTranscriptLayout(next);
  };

  const onTranscriptAnchor = (next: boolean) => {
    saveTranscriptAnchor(next);
    setTranscriptAnchor(next);
  };

  const onFollowUpBehavior = (next: FollowUpBehavior) => {
    saveFollowUpBehavior(next);
    setFollowUpBehavior(next);
  };

  const onModelControls = (next: ModelControls) => {
    saveModelControls(next);
    setModelControls(next);
  };

  const onDiffViewer = (next: DiffViewer) => {
    saveDiffViewer(next);
    setDiffViewer(next);
  };

  const onFormatOnSave = (next: boolean) => {
    saveFormatOnSave(next);
    setFormatOnSave(next);
  };

  const onComposerRunner = (next: boolean) => {
    saveComposerRunner(next);
    setComposerRunner(next);
  };

  return (
    <>
      <Group
        title="Transcript"
        description="How a conversation reads as it grows."
      >
        <Row
          id="transcript-layout"
          label="Transcript layout"
          description="Full width keeps user prompts as a spanning card. Chat aligns them to the right with a max width, like a messaging app."
        >
          <Segmented
            label="Transcript layout"
            value={transcriptLayout}
            options={[
              { value: "full", label: "Full width" },
              { value: "chat", label: "Chat" },
            ]}
            onChange={onTranscriptLayout}
          />
        </Row>
        <Row
          id="anchor-prompts"
          label="Anchor prompts to top"
          description="When you send, the new prompt sits at the top of the transcript and the reply grows into the space below. Turn this off to keep the classic layout, with the latest message resting on the composer."
        >
          <Toggle
            label="Anchor prompts to top"
            on={transcriptAnchor}
            onChange={onTranscriptAnchor}
          />
        </Row>
      </Group>

      <Group
        title="Composer"
        description="What the composer does with what you type."
      >
        <Row
          id="follow-up"
          label="Follow-up behavior"
          description="Queue follow-ups until the active turn finishes, or steer the active turn immediately."
        >
          <Segmented
            label="Follow-up behavior"
            value={followUpBehavior}
            options={[
              { value: "queue", label: "Queue" },
              { value: "steer", label: "Steer" },
            ]}
            onChange={onFollowUpBehavior}
          />
        </Row>
        <Row
          id="model-controls"
          label="Model controls"
          description="Show model options beside the picker instead of inside the model menu."
        >
          <Segmented
            label="Model controls"
            value={modelControls}
            options={[
              { value: "menu", label: "Menu" },
              { value: "beside", label: "Beside" },
            ]}
            onChange={onModelControls}
          />
        </Row>
      </Group>

      <Group
        title="Editor"
        description="What happens when you save a file in the workspace editor."
      >
        <Row
          id="format-on-save"
          label="Format on save"
          description="Run Prettier on supported files before writing. Off keeps the text you typed, including quote style."
        >
          <Toggle
            label="Format on save"
            on={formatOnSave}
            onChange={onFormatOnSave}
          />
        </Row>
      </Group>

      <Group
        title="Code review"
        description="Where a turn's changes open when you go to read them."
      >
        <Row
          id="diff-view"
          label="Diff view"
          description="Editor keeps working-tree changes in the file. Unified stacks every changed file in one review, with sticky headers and collapsed unchanged lines."
        >
          <Segmented
            label="Diff view"
            value={diffViewer}
            options={[
              { value: "editor", label: "Editor" },
              { value: "unified", label: "Unified" },
            ]}
            onChange={onDiffViewer}
          />
        </Row>
      </Group>

      <Group
        title="Extras"
        description="Idle animation, and nothing else. Turn both off for a still workspace."
      >
        <Row
          id="composer-mascot"
          label="Composer mascot"
          description="When a turn is running, the project mascot runs along the composer, bonks the scroll-to-latest button the first time, then jumps it, and sometimes grabs a coin."
        >
          <Toggle
            label="Composer mascot"
            on={composerRunner}
            onChange={onComposerRunner}
          />
        </Row>
      </Group>
    </>
  );
}

function InboxPage({
  cwd,
  recents,
  notificationProjectPath,
  notificationSettingsRequest,
}: {
  cwd: string;
  recents?: RecentProject[];
  notificationProjectPath?: string | null;
  notificationSettingsRequest?: number;
}) {
  const revealed = useContext(RevealedSetting);
  return (
    <>
      <div
        id={settingDomId("project-notifications")}
        data-setting-id="project-notifications"
      >
        <ProjectNotificationSettings
          cwd={cwd}
          recents={recents}
          notificationProjectPath={notificationProjectPath}
          notificationSettingsRequest={notificationSettingsRequest}
          highlighted={revealed === "project-notifications"}
        />
      </div>
      <Group
        id="github"
        title={
          <span className="flex items-center gap-2">
            <InboxProviderMark provider="github" className="size-4 shrink-0" />
            GitHub
          </span>
        }
        description="Pull requests, reviews, and issues, read through the GitHub CLI."
      >
        <GithubSettings />
      </Group>

    </>
  );
}

function GithubSettings() {
  const [status, setStatus] = useState<GithubStatus | null>(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0);

  const checkStatus = useCallback(async () => {
    const generation = ++request.current;
    setChecking(true);
    setError(null);
    try {
      const next = await githubStatus();
      if (generation === request.current) setStatus(next);
    } catch (err: unknown) {
      if (generation === request.current) {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      if (generation === request.current) setChecking(false);
    }
  }, []);

  useEffect(() => {
    void checkStatus();
    return () => {
      request.current += 1;
    };
  }, [checkStatus]);

  const description = status?.connected
    ? "GitHub CLI is installed and authenticated. Bonocode uses it for linked GitHub issues and pull requests."
    : status?.installed
      ? "Run gh auth login in a terminal, complete the sign-in flow, then check again."
      : "Install GitHub CLI from cli.github.com, run gh auth login in a terminal, then check again.";
  const label = checking
    ? "Checking"
    : status?.connected
      ? "Connected"
      : status?.installed
        ? "Sign in required"
        : "Not installed";

  return (
    <>
      <Row label="Connection" description={description}>
        <span className="text-[12px] text-content/50">{label}</span>
        {!checking && !status?.installed ? (
          <SecondaryButton
            onClick={() => {
              void openUrl("https://cli.github.com/").catch(() => {});
            }}
          >
            Installation guide
          </SecondaryButton>
        ) : null}
        <SecondaryButton onClick={() => void checkStatus()} disabled={checking}>
          {checking ? "Checking" : "Check again"}
        </SecondaryButton>
      </Row>
      {error ? (
        <p className="border-b border-content/5 px-4 pb-3 text-[12px] text-danger/90 last:border-b-0">
          {error}
        </p>
      ) : null}
    </>
  );
}

function UpdateRow({
  onOpenWhatsNew,
}: {
  onOpenWhatsNew: (version: string) => void;
}) {
  const [snapshot, setSnapshot] = useState<UpdaterSnapshot>({
    phase: "idle",
    currentVersion: "…",
  });

  useEffect(() => {
    let cancelled = false;
    void readAppVersion().then((currentVersion) => {
      if (cancelled) return;
      setSnapshot((current) => ({ ...current, currentVersion }));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const busy =
    snapshot.phase === "checking" || snapshot.phase === "downloading";
  const hasUpdate = snapshot.phase === "available";

  const onClick = async () => {
    if (busy) return;
    if (hasUpdate) {
      await installPendingUpdate(setSnapshot);
      return;
    }
    await runUpdateFlow(true, setSnapshot);
  };

  const status =
    snapshot.phase === "available"
      ? `Version ${snapshot.availableVersion} is available.`
      : snapshot.phase === "downloading"
        ? `Downloading${snapshot.progress != null ? ` ${snapshot.progress}%` : "…"}`
        : snapshot.phase === "checking"
          ? "Checking for updates…"
          : snapshot.phase === "current"
            ? "You're on the latest version."
            : snapshot.phase === "error"
              ? (snapshot.error ?? "Update check failed.")
              : "Bonocode updates itself from the release feed.";

  return (
    <Row
      id="update"
      label={
        <span className="flex items-baseline gap-2">
          Version
          <span className="font-mono text-[12px] text-content/45">
            {snapshot.currentVersion}
          </span>
        </span>
      }
      description={status}
    >
      <div className="flex items-center gap-2">
        <SecondaryButton
          onClick={() => onOpenWhatsNew(snapshot.currentVersion)}
          disabled={snapshot.currentVersion === "…"}
        >
          What's new
        </SecondaryButton>
        <SecondaryButton onClick={() => void onClick()} disabled={busy}>
          {busy ? (
            <Loader className="size-3.5 animate-spin" aria-hidden />
          ) : hasUpdate ? (
            <ArrowDownCircle className="size-3.5 text-accent" aria-hidden />
          ) : (
            <RefreshCw className="size-3.5" strokeWidth={1.75} aria-hidden />
          )}
          {hasUpdate ? "Download" : "Check for updates"}
        </SecondaryButton>
      </div>
    </Row>
  );
}

type AppearanceSettings = ReturnType<typeof useAppearanceSettings>;

function useAppearanceSettings(
  controlledCollapsedProjectRailMode?: CollapsedProjectRailMode,
  onControlledCollapsedProjectRailModeChange?: (
    mode: CollapsedProjectRailMode,
  ) => void,
) {
  const [showExcludedFiles, setShowExcludedFiles] = useState(
    loadShowExcludedFiles,
  );
  const [chatBackgroundPath, setChatBackgroundPath] = useState(
    loadChatBackgroundPath,
  );
  const [chatBackgroundEmptyOpacity, setChatBackgroundEmptyOpacity] = useState(
    loadChatBackgroundEmptyOpacity,
  );
  const [chatBackgroundSessionOpacity, setChatBackgroundSessionOpacity] =
    useState(loadChatBackgroundSessionOpacity);
  const [chatBackgroundScope, setChatBackgroundScope] =
    useState<ChatBackgroundScope>(loadChatBackgroundScope);
  const [newThreadBackgroundEffect, setBackgroundEffect] =
    useState<NewThreadBackgroundEffect>(loadNewThreadBackgroundEffect);
  const [chatBackgroundBusy, setChatBackgroundBusy] = useState(false);
  const [chatBackgroundError, setChatBackgroundError] = useState<string | null>(
    null,
  );
  const [uiScale, setUiScale] = useState(loadUiScale);
  const [storedCollapsedProjectRailMode, setStoredCollapsedProjectRailMode] =
    useState<CollapsedProjectRailMode>(loadCollapsedProjectRailMode);
  const collapsedProjectRailMode =
    controlledCollapsedProjectRailMode ?? storedCollapsedProjectRailMode;

  useEffect(() => subscribeUiScale(() => setUiScale(loadUiScale())), []);

  const onShowExcludedFiles = useCallback((next: boolean) => {
    saveShowExcludedFiles(next);
    setShowExcludedFiles(next);
  }, []);

  const onChooseChatBackground = useCallback(async () => {
    setChatBackgroundBusy(true);
    setChatBackgroundError(null);
    try {
      const path = await pickAndSaveChatBackground();
      if (!path) return;
      saveChatBackgroundPath(path);
      applyChatBackground(path);
      setChatBackgroundPath(path);
    } catch (error) {
      setChatBackgroundError(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setChatBackgroundBusy(false);
    }
  }, []);

  const onClearChatBackground = useCallback(async () => {
    setChatBackgroundBusy(true);
    setChatBackgroundError(null);
    try {
      await removeChatBackground();
      saveChatBackgroundPath(null);
      applyChatBackground(null);
      setChatBackgroundPath(null);
    } catch (error) {
      setChatBackgroundError(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setChatBackgroundBusy(false);
    }
  }, []);

  const onChatBackgroundEmptyOpacity = useCallback((percent: number) => {
    const next = applyChatBackgroundEmptyOpacity(percent / 100);
    saveChatBackgroundEmptyOpacity(next);
    setChatBackgroundEmptyOpacity(next);
  }, []);

  const onChatBackgroundSessionOpacity = useCallback((percent: number) => {
    const next = applyChatBackgroundSessionOpacity(percent / 100);
    saveChatBackgroundSessionOpacity(next);
    setChatBackgroundSessionOpacity(next);
  }, []);

  const onChatBackgroundScope = useCallback((next: ChatBackgroundScope) => {
    applyChatBackgroundScope(next);
    saveChatBackgroundScope(next);
    setChatBackgroundScope(next);
  }, []);

  const onNewThreadBackgroundEffect = useCallback(
    (next: NewThreadBackgroundEffect) => {
      setNewThreadBackgroundEffect(next);
      setBackgroundEffect(next);
    },
    [],
  );

  const onUiScale = useCallback((percent: number) => {
    const next = saveUiScale(percent / 100);
    setUiScale(next);
    void applyUiScale(next);
  }, []);

  const onCollapsedProjectRailMode = useCallback(
    (next: CollapsedProjectRailMode) => {
      saveCollapsedProjectRailMode(next);
      setStoredCollapsedProjectRailMode(next);
      onControlledCollapsedProjectRailModeChange?.(next);
    },
    [onControlledCollapsedProjectRailModeChange],
  );

  const restoreDefaults = useCallback(() => {
    setTheme(DEFAULT_THEME_ID);
    onShowExcludedFiles(SHOW_EXCLUDED_FILES_DEFAULT);
    onChatBackgroundEmptyOpacity(
      Math.round(CHAT_BACKGROUND_EMPTY_OPACITY_DEFAULT * 100),
    );
    onChatBackgroundSessionOpacity(
      Math.round(CHAT_BACKGROUND_SESSION_OPACITY_DEFAULT * 100),
    );
    onChatBackgroundScope(CHAT_BACKGROUND_SCOPE_DEFAULT);
    onNewThreadBackgroundEffect(NEW_THREAD_BACKGROUND_EFFECT_DEFAULT);
    if (chatBackgroundPath) void onClearChatBackground();
    onUiScale(Math.round(UI_SCALE_DEFAULT * 100));
    onCollapsedProjectRailMode(COLLAPSED_PROJECT_RAIL_MODE_DEFAULT);
  }, [
    chatBackgroundPath,
    onChatBackgroundEmptyOpacity,
    onChatBackgroundSessionOpacity,
    onChatBackgroundScope,
    onNewThreadBackgroundEffect,
    onClearChatBackground,
    onShowExcludedFiles,
    onUiScale,
    onCollapsedProjectRailMode,
  ]);

  return {
    showExcludedFiles,
    chatBackgroundPath,
    chatBackgroundEmptyOpacity,
    chatBackgroundSessionOpacity,
    chatBackgroundScope,
    newThreadBackgroundEffect,
    chatBackgroundBusy,
    chatBackgroundError,
    uiScale,
    collapsedProjectRailMode,
    onShowExcludedFiles,
    onChooseChatBackground,
    onClearChatBackground,
    onChatBackgroundEmptyOpacity,
    onChatBackgroundSessionOpacity,
    onChatBackgroundScope,
    onNewThreadBackgroundEffect,
    onUiScale,
    onCollapsedProjectRailMode,
    restoreDefaults,
  };
}

function AppearancePage({ appearance }: { appearance: AppearanceSettings }) {
  const themeId = activeTheme.use();
  const themes = useThemes();

  return (
    <>
      <Group title="Theme">
        <Row
          id="theme"
          label="Theme"
          description="Colors and fonts for the whole interface, including whether it is dark or light."
        >
          <Select
            label="Theme"
            value={themeId}
            options={themes.map((theme) => ({
              value: theme.id,
              label: theme.name,
            }))}
            onChange={setTheme}
          />
        </Row>
      </Group>

      <ThemeEditor />

      <ChatBackgroundCard appearance={appearance} />

      <Group title="Layout">
        <Row
          id="collapsed-project-rail"
          label="Collapsed project rail"
          description="Keep project navigation available as a compact icon rail, or hide the rail completely."
        >
          <Segmented
            label="Collapsed project rail"
            value={appearance.collapsedProjectRailMode}
            options={[
              { value: "compact", label: "Icon rail" },
              { value: "hidden", label: "Hidden" },
            ]}
            onChange={appearance.onCollapsedProjectRailMode}
          />
        </Row>
        <Row
          id="interface-scale"
          label="Interface scale"
          description="Zoom the whole interface. You can also use Ctrl+=, Ctrl+-, and Ctrl+0 (Cmd on macOS)."
        >
          <Select
            label="Interface scale"
            value={String(Math.round(appearance.uiScale * 100))}
            options={UI_SCALE_PERCENTS.map((percent) => ({
              value: String(percent),
              label: `${percent}%`,
            }))}
            onChange={(value) => appearance.onUiScale(Number(value))}
          />
        </Row>
        <Row
          id="show-excluded-files"
          label="Show excluded files"
          description="Show files and folders Git excludes, such as build output and dependencies, in the explorer."
        >
          <Toggle
            label="Show excluded files"
            on={appearance.showExcludedFiles}
            onChange={appearance.onShowExcludedFiles}
          />
        </Row>
      </Group>
    </>
  );
}

function ChatBackgroundCard({
  appearance,
}: {
  appearance: AppearanceSettings;
}) {
  const src = chatBackgroundSrc(appearance.chatBackgroundPath);
  const hasImage = Boolean(appearance.chatBackgroundPath && src);
  const emptyVisibility = Math.round(
    appearance.chatBackgroundEmptyOpacity * 100,
  );
  const sessionVisibility = Math.round(
    appearance.chatBackgroundSessionOpacity * 100,
  );
  const busy = appearance.chatBackgroundBusy;

  return (
    <Group
      id="chat-background"
      title="Chat background"
      description="An image behind your chat panes. It stays on this device."
    >
      <div className="border-b border-content/5 p-4 last:border-b-0">
        <div className="overflow-hidden rounded-lg border border-content/10">
          {hasImage ? (
            <div
              className={`relative h-36 ${appearance.newThreadBackgroundEffect === "gradient-blur" ? "bg-background-base" : ""}`}
            >
              {appearance.newThreadBackgroundEffect === "gradient-blur" ? (
                <GradientBlurBackground
                  className="gradient-blur-preview absolute inset-0"
                  style={{ opacity: appearance.chatBackgroundEmptyOpacity }}
                />
              ) : (
                <div
                  aria-hidden
                  className="size-full bg-cover bg-center bg-no-repeat"
                  style={{
                    backgroundImage: "var(--chat-background-image)",
                    opacity: appearance.chatBackgroundEmptyOpacity,
                  }}
                />
              )}
              <span className="pointer-events-none absolute bottom-2 left-2 text-[11px] text-content/40">
                Empty chat preview at {emptyVisibility}%
              </span>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => void appearance.onChooseChatBackground()}
              disabled={busy}
              className="flex h-36 w-full flex-col items-center justify-center gap-2 text-content/40 hover:bg-content/5 hover:text-content/70 disabled:cursor-default disabled:opacity-40"
            >
              {busy ? (
                <Loader className="size-5 animate-spin" aria-hidden />
              ) : (
                <ImagePlus className="size-5" aria-hidden />
              )}
              <span className="text-[12px]">Choose an image</span>
            </button>
          )}
        </div>
        {hasImage ? (
          <div className="mt-3 flex items-center justify-end gap-2">
            <SecondaryButton
              onClick={() => void appearance.onChooseChatBackground()}
              disabled={busy}
            >
              {busy ? (
                <Loader className="size-3.5 animate-spin" aria-hidden />
              ) : null}
              Change
            </SecondaryButton>
            <SecondaryButton
              onClick={() => void appearance.onClearChatBackground()}
              disabled={busy}
              danger
            >
              Remove
            </SecondaryButton>
          </div>
        ) : null}
        {appearance.chatBackgroundError ? (
          <p className="mt-2 text-[12px] text-danger">
            {appearance.chatBackgroundError}
          </p>
        ) : null}
      </div>
      {hasImage ? (
        <>
          <Row
            label="Background effect"
            description={
              NEW_THREAD_BACKGROUND_EFFECT_DESCRIPTIONS[
                appearance.newThreadBackgroundEffect
              ]
            }
          >
            <Segmented
              label="Background effect"
              value={appearance.newThreadBackgroundEffect}
              options={NEW_THREAD_BACKGROUND_EFFECTS.map((effect) => ({
                value: effect,
                label: NEW_THREAD_BACKGROUND_EFFECT_LABELS[effect],
              }))}
              onChange={appearance.onNewThreadBackgroundEffect}
              optionIdPrefix="new-thread-background-effect"
            />
          </Row>
          <Row
            label="Show on"
            description="Empty sessions only, or every conversation."
          >
            <Segmented
              label="Show background on"
              value={appearance.chatBackgroundScope}
              options={[
                { value: "empty", label: "Empty only" },
                { value: "all", label: "All sessions" },
              ]}
              onChange={appearance.onChatBackgroundScope}
            />
          </Row>
          <Row
            label="Empty chat visibility"
            description="Background strength before a chat has messages."
          >
            <Slider
              label="Empty chat background visibility"
              value={emptyVisibility}
              display={`${emptyVisibility}%`}
              min={Math.round(CHAT_BACKGROUND_OPACITY_MIN * 100)}
              max={Math.round(CHAT_BACKGROUND_OPACITY_MAX * 100)}
              onChange={appearance.onChatBackgroundEmptyOpacity}
            />
          </Row>
          <Row
            label="Session visibility"
            description="Background strength once the conversation has messages."
          >
            <Slider
              label="Session background visibility"
              value={sessionVisibility}
              display={`${sessionVisibility}%`}
              min={Math.round(CHAT_BACKGROUND_OPACITY_MIN * 100)}
              max={Math.round(CHAT_BACKGROUND_OPACITY_MAX * 100)}
              onChange={appearance.onChatBackgroundSessionOpacity}
            />
          </Row>
        </>
      ) : null}
    </Group>
  );
}

type ShortcutModifier = "metaKey" | "ctrlKey" | "altKey" | "shiftKey";

function shortcutModifier(event: KeyboardEvent): ShortcutModifier | null {
  if (event.key === "Meta" || event.code.startsWith("Meta")) return "metaKey";
  if (event.key === "Control" || event.code.startsWith("Control"))
    return "ctrlKey";
  if (event.key === "Alt" || event.code.startsWith("Alt")) return "altKey";
  if (event.key === "Shift" || event.code.startsWith("Shift"))
    return "shiftKey";
  return null;
}

function ShortcutEditor({
  name,
  display,
  resetVisible,
  onApply,
  onDisable,
  onReset,
}: {
  name: string;
  display: string | null;
  resetVisible: boolean;
  onApply: (shortcut: string) => void | Promise<void>;
  onDisable: () => void | Promise<void>;
  onReset: () => void | Promise<void>;
}) {
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState("");
  const held = useRef({
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
  });

  const run = async (action: () => void | Promise<void>) => {
    setRecording(false);
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy(false);
    }
  };

  const beginRecording = () => {
    held.current = {
      metaKey: false,
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
    };
    setPreview("");
    setError(null);
    setRecording(true);
  };

  useEffect(() => {
    if (!recording) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const bare =
        !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey;
      // An unmodified Tab leaves the recorder instead of trapping focus.
      if (bare && event.code === "Tab") {
        setRecording(false);
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.code === "Escape") {
        setRecording(false);
        setError(null);
        return;
      }
      // Delete disables, but only on its own so Cmd+Delete still records.
      if (bare && (event.code === "Backspace" || event.code === "Delete")) {
        void run(onDisable);
        return;
      }
      const modifier = shortcutModifier(event);
      if (modifier) held.current[modifier] = true;
      const modifiers = {
        metaKey: event.metaKey || held.current.metaKey,
        ctrlKey: event.ctrlKey || held.current.ctrlKey,
        altKey: event.altKey || held.current.altKey,
        shiftKey: event.shiftKey || held.current.shiftKey,
      };
      setPreview(
        shortcutPreview(
          modifiers,
          modifier ? undefined : event.code,
          event.key,
        ),
      );
      if (modifier) return;
      const next = shortcutFromKeyEvent({ ...modifiers, code: event.code });
      if (next) void run(() => onApply(next));
    };
    const onKeyUp = (event: KeyboardEvent) => {
      const modifier = shortcutModifier(event);
      if (!modifier) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      held.current[modifier] = false;
      const modifiers = {
        metaKey: event.metaKey || held.current.metaKey,
        ctrlKey: event.ctrlKey || held.current.ctrlKey,
        altKey: event.altKey || held.current.altKey,
        shiftKey: event.shiftKey || held.current.shiftKey,
      };
      modifiers[modifier] = false;
      setPreview(shortcutPreview(modifiers));
    };
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
    };
  }, [onApply, onDisable, recording]);

  return (
    <div className="relative w-40 shrink-0">
      <div className="flex items-center gap-0.5">
        <input
          type="text"
          readOnly
          aria-label={`Change ${name} shortcut`}
          data-shortcut-recorder-active={recording ? "true" : undefined}
          aria-busy={busy || undefined}
          value={
            recording || busy ? preview || "Record…" : (display ?? "Disabled")
          }
          onFocus={beginRecording}
          onClick={beginRecording}
          onBlur={() => setRecording(false)}
          className={`h-6 w-28 shrink-0 truncate rounded-md border bg-transparent px-1.5 py-0 font-mono text-[11px] leading-none outline-none focus:border-accent ${
            busy ? "opacity-50" : ""
          } ${
            display === null
              ? "border-dashed border-content/15 text-content/35"
              : "border-content/15 text-content/80 hover:bg-content/10"
          }`}
        />
        {resetVisible ? (
          <button
            type="button"
            aria-label={`Reset ${name} shortcut`}
            disabled={busy}
            onClick={() => void run(onReset)}
            className="rounded-md px-1 py-1 text-content/35 hover:bg-content/10 hover:text-content disabled:opacity-50"
          >
            <RotateCcw className="size-3.5" />
          </button>
        ) : null}
      </div>
      {recording ? (
        <p
          className="pointer-events-none absolute top-1/2 right-full z-40 mr-3 -translate-y-1/2 text-[10px] whitespace-nowrap text-content/50"
          aria-live="polite"
        >
          Del disables · Esc cancels
        </p>
      ) : null}
      {error ? (
        <p
          role="alert"
          className="absolute top-full left-0 z-40 mt-1.5 w-max max-w-64 rounded-md border border-content/10 bg-background-base/95 px-2 py-1 text-[11px] whitespace-nowrap text-danger shadow-lg"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

function KeybindingShortcutEditor({
  command,
  display,
  modified,
  onSave,
}: {
  command: string;
  display: string | null;
  modified: boolean;
  onSave: (
    command: string,
    override: KeybindingOverride,
  ) => void | Promise<void>;
}) {
  return (
    <ShortcutEditor
      name={command}
      display={display}
      resetVisible={modified}
      onApply={(shortcut) => onSave(command, { shortcut })}
      onDisable={() => onSave(command, { disabled: true })}
      onReset={() => onSave(command, {})}
    />
  );
}

function KeybindingsPage() {
  const [query, setQuery] = useState("");
  const [overrides, setOverrides] = useState(loadKeybindingOverrides);
  useEffect(
    () => subscribeKeybindings(() => setOverrides(loadKeybindingOverrides())),
    [],
  );
  const rows = useMemo(
    () => filterKeybindings(currentKeybindings(), query),
    [query, overrides],
  );

  const save = async (command: string, override: KeybindingOverride) => {
    const next = saveKeybindingOverride(command, override);
    if (IS_MAC) await invoke("keybindings_set_overrides", { overrides: next });
  };

  return (
    <Group
      title="Shortcuts"
      description="Click a shortcut to record new keys. Press Delete while recording to disable it."
      action={
        <div className="flex items-center gap-3">
          <span className="shrink-0 text-[12px] text-content/40 tabular-nums">
            {rows.length} {rows.length === 1 ? "binding" : "bindings"}
          </span>
          <label className="flex h-7 w-44 shrink-0 items-center gap-2 rounded-md border border-content/10 px-2 text-content/45 focus-within:border-content/20">
            <Search className="size-3.5 shrink-0" strokeWidth={1.75} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter"
              aria-label="Filter keybindings"
              spellCheck={false}
              autoComplete="off"
              className="min-w-0 flex-1 bg-transparent text-[12px] text-content outline-none placeholder:text-content/35"
            />
          </label>
        </div>
      }
    >
      <div className="flex items-center border-b border-stroke bg-content/5 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-content/40">
        <span className="min-w-0 flex-1">Command</span>
        <span className="w-40 shrink-0">Keybinding</span>
        <span className="w-28 shrink-0">When</span>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-3 text-[12px] text-content/45">
          No matching bindings
        </p>
      ) : (
        rows.map((row) => {
          const override = overrides[row.command];
          const disabled = override?.disabled === true;
          return (
            <div
              key={row.command}
              className="flex h-11 items-center border-b border-content/5 px-4 text-[12px] last:border-b-0"
            >
              <span
                className={`min-w-0 flex-1 truncate ${disabled ? "text-content/45" : ""}`}
              >
                {row.command}
              </span>
              <KeybindingShortcutEditor
                command={row.command}
                display={disabled ? null : row.keys}
                modified={Boolean(override)}
                onSave={save}
              />
              <span className="w-28 shrink-0 font-mono text-[11px] text-content/40">
                {row.when}
              </span>
            </div>
          );
        })
      )}
    </Group>
  );
}

const GLOBAL_PROVIDER_SCOPE = "global";

function binaryInspectionError(
  provider: ConfigurableBinaryProvider,
  inspection: HarnessBinaryInspection,
): string | null {
  if (inspection.error) return inspection.error;
  if (provider === "codex" && !/^codex-cli\s+\d+\.\d+\.\d+/.test(inspection.version ?? "")) {
    return "Codex CLI returned an invalid version.";
  }
  if (provider === "opencode") {
    const version = parseOpenCodeVersion(inspection.version ?? "");
    if (!version) return "OpenCode CLI returned an invalid version.";
    if (compareSemver(version, MINIMUM_OPENCODE_VERSION) < 0) {
      return `OpenCode v${version} is too old. Upgrade to v${MINIMUM_OPENCODE_VERSION} or newer.`;
    }
  }
  return null;
}

function ProviderBinaryControl({
  provider,
}: {
  provider: ConfigurableBinaryProvider;
}) {
  const root = useRef<HTMLSpanElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const editInput = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(
    () => loadProviderBinaryPath(provider) ?? "",
  );
  const [overridden, setOverridden] = useState(() =>
    Boolean(loadProviderBinaryPath(provider)),
  );
  const [inspection, setInspection] = useState<
    HarnessBinaryInspection & { overridden: boolean }
  >();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revealError, setRevealError] = useState<string | null>(null);

  const inspect = useCallback(
    async (binaryPath?: string | null) => {
      setWorking(true);
      setInspection(undefined);
      setError(null);
      setRevealError(null);
      try {
        const next = await inspectHarnessBinary(provider, binaryPath);
        setInspection({
          ...next,
          overridden: Boolean(binaryPath?.trim()),
        });
        setError(binaryInspectionError(provider, next));
        return next;
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        setError(message);
        return null;
      } finally {
        setWorking(false);
      }
    },
    [provider],
  );

  useEffect(() => {
    if (editing) editInput.current?.focus();
  }, [editing]);

  const dismiss = (restoreFocus = false) => {
    setOpen(false);
    setEditing(false);
    if (restoreFocus) queueMicrotask(() => trigger.current?.focus());
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (working) return;
    const value = draft.trim();
    if (!value) {
      await useAuto();
      return;
    }
    const next = await inspect(value);
    if (!next) return;
    const validationError = binaryInspectionError(provider, next);
    if (validationError) {
      setError(validationError);
      return;
    }
    if (!saveProviderBinaryPath(provider, value)) {
      setInspection(undefined);
      setError("Could not save the binary path.");
      return;
    }
    setOverridden(true);
    dismiss(true);
  };

  const useAuto = async () => {
    if (working) return;
    const next = await inspect(null);
    if (!next || binaryInspectionError(provider, next)) return;
    if (!saveProviderBinaryPath(provider, null)) {
      setInspection(undefined);
      setError("Could not save the binary path.");
      return;
    }
    setDraft("");
    setOverridden(false);
    dismiss(true);
  };

  const title = HARNESS_TITLE[provider];
  const restartRequired = providerBinaryPathChangePending(provider);

  return (
    <span ref={root} className="inline-flex align-middle">
      <button
        ref={trigger}
        type="button"
        aria-label={
          restartRequired
            ? `Show ${title} CLI details, restart required`
            : `Show ${title} CLI details`
        }
        aria-expanded={open}
        aria-controls={`${provider}-binary-popover`}
        aria-haspopup="dialog"
        title={`${title} CLI path${restartRequired ? " — restart required" : ""}`}
        onClick={() => {
          if (!open && !inspection && !working && !error) {
            void inspect(loadProviderBinaryPath(provider));
          }
          setOpen((value) => !value);
          setEditing(false);
        }}
        className={`grid size-6 place-items-center rounded hover:bg-content/10 focus-visible:outline-2 focus-visible:outline-accent ${
          restartRequired ? "text-warning" : "text-content/35 hover:text-content"
        }`}
      >
        <FolderOpen className="size-3.5" strokeWidth={1.75} />
      </button>
      {open ? (
        <Popover
          id={`${provider}-binary-popover`}
          role="dialog"
          aria-label={`${title} CLI details`}
          aria-busy={working}
          tabIndex={-1}
          anchor={root}
          side="bottom"
          align="start"
          width={440}
          className="p-3"
          autoFocus
          onKeyDown={(event) => {
            if (event.key !== "Tab") return;
            const focusable = Array.from(
              event.currentTarget.querySelectorAll<HTMLElement>(
                'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
              ),
            );
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (!first || !last) return;
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault();
              last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first.focus();
            }
          }}
          onDismiss={(reason) => dismiss(reason === "escape")}
        >
          <div className="flex items-center justify-between gap-3">
            <span className="text-[12px] font-medium text-content">
              {title} CLI
            </span>
            <div className="flex items-center gap-1.5">
              <span className="rounded-full bg-content/10 px-1.5 py-0.5 text-[10px] text-content/50">
                Global path
              </span>
              <span className="rounded-full bg-content/10 px-1.5 py-0.5 text-[10px] text-content/50">
                {error
                  ? "Needs attention"
                  : restartRequired
                    ? "Restart required"
                    : overridden
                      ? "Configured"
                      : "Auto-detected"}
              </span>
            </div>
          </div>
          {editing ? (
            <form className="mt-2" onSubmit={submit}>
              <label
                htmlFor={`${provider}-binary-path`}
                className="text-[11px] text-content/50"
              >
                CLI path
              </label>
              <input
                id={`${provider}-binary-path`}
                ref={editInput}
                type="text"
                value={draft}
                placeholder={inspection?.path ?? "Auto-detected path"}
                disabled={working}
                autoFocus
                onChange={(event) => setDraft(event.target.value)}
                className="mt-1.5 h-8 w-full rounded-md border border-content/10 bg-content/[0.04] px-2 font-mono text-[11px] text-content outline-none placeholder:font-sans placeholder:text-content/35 focus:border-accent/45 disabled:opacity-50"
              />
              <p className="mt-1.5 text-[10px] text-content/40">
                Enter the absolute path to the CLI executable. Changes apply after restarting Bonocode.
              </p>
              {error ? (
                <span
                  role="alert"
                  className="mt-1.5 block text-[11px] text-danger"
                >
                  {error}
                </span>
              ) : null}
              <div className="mt-3 flex justify-end gap-2">
                <SecondaryButton
                  disabled={working}
                  onClick={() => {
                    setDraft(loadProviderBinaryPath(provider) ?? "");
                    setEditing(false);
                    queueMicrotask(() => trigger.current?.focus());
                  }}
                >
                  Cancel
                </SecondaryButton>
                {overridden ? (
                  <SecondaryButton
                    disabled={working}
                    onClick={() => void useAuto()}
                  >
                    Use auto-detected path
                  </SecondaryButton>
                ) : null}
                <SecondaryButton type="submit" disabled={working}>
                  Save path
                </SecondaryButton>
              </div>
            </form>
          ) : (
            <>
              <div className="mt-2 rounded-md border border-content/10 bg-content/[0.03] px-2.5 py-2">
                <span className="block max-h-12 overflow-y-auto whitespace-pre-wrap break-all font-mono text-[10px] text-content/65">
                  {inspection?.path ??
                    (error ? "CLI could not be resolved" : "Checking the selected CLI…")}
                </span>
                <span className="mt-1 block max-h-10 overflow-y-auto whitespace-pre-wrap break-words text-[10px] text-content/40">
                  {inspection?.version ??
                    (error ? "Retry to check this CLI" : "Checking version…")}
                </span>
              </div>
               {error ? (
                 <span
                   role="alert"
                   title={error}
                   className="mt-1.5 block max-h-20 overflow-y-auto whitespace-pre-wrap break-words text-[10px] leading-4 text-danger"
                 >
                   {error}
                 </span>
               ) : null}
               {revealError ? (
                 <span
                   role="alert"
                   className="mt-1.5 block max-h-20 overflow-y-auto whitespace-pre-wrap break-words text-[10px] leading-4 text-danger"
                 >
                   Could not open the CLI location: {revealError}
                 </span>
               ) : null}
               <div className="mt-3 flex justify-end gap-2">
                {error ? (
                  <SecondaryButton
                    disabled={working}
                    aria-label={`Retry ${title} ${
                      overridden ? "configured path" : "auto-detect"
                    }`}
                    onClick={() =>
                      void inspect(overridden ? draft.trim() || null : null)
                    }
                  >
                    <RefreshCw className="size-3.5" strokeWidth={1.75} />
                    {overridden ? "Retry configured path" : "Retry auto-detect"}
                  </SecondaryButton>
                ) : null}
                <SecondaryButton
                  aria-label={`Open ${title} CLI location`}
                  disabled={!inspection}
                  onClick={() => {
                    if (inspection) {
                      void revealPath(inspection.path).catch((cause) => {
                        setRevealError(
                          cause instanceof Error ? cause.message : String(cause),
                        );
                      });
                    }
                  }}
                >
                  <ExternalLink className="size-3.5" strokeWidth={1.75} />
                  Open location
                </SecondaryButton>
                <SecondaryButton
                  aria-label={`Edit ${title} CLI path`}
                  disabled={working}
                  onClick={() => setEditing(true)}
                >
                  <Pencil className="size-3.5" strokeWidth={1.75} />
                  Edit path
                </SecondaryButton>
              </div>
            </>
          )}
        </Popover>
      ) : null}
    </span>
  );
}

function ProvidersPage({
  cwd,
  recents,
}: {
  cwd?: string;
  recents?: RecentProject[];
}) {
  useSyncExternalStore(subscribeModels, getModelSnapshot, getModelSnapshot);
  useSyncExternalStore(
    subscribeHarnessAvailability,
    getHarnessAvailabilitySnapshot,
    getHarnessAvailabilitySnapshot,
  );
  const providersRevision = useSyncExternalStore(
    subscribeProjectProviders,
    projectProvidersRevision,
    projectProvidersRevision,
  );
  void providersRevision;
  const [choice, setChoice] = useState(loadLastModelChoice);
  const [defaultModels, setDefaultModels] = useState(loadDefaultModels);
  const [claudeHooks, setClaudeHooks] = useState(loadClaudeHooks);
  const [agentIdleMs, setAgentIdleMs] = useState(loadAgentIdleMs);
  const [scope, setScope] = useState<string>(GLOBAL_PROVIDER_SCOPE);
  const [hiddenGlobally, setHiddenGlobally] = useState(
    loadHiddenPickerProviders,
  );

  const scopeOptions = useMemo(() => {
    const options: { value: string; label: string; icon?: ReactNode }[] = [
      {
        value: GLOBAL_PROVIDER_SCOPE,
        label: "Global",
        icon: (
          <Globe
            className="size-3.5 shrink-0 text-content/60"
            strokeWidth={1.75}
          />
        ),
      },
    ];
    const seen = new Set<string>();
    for (const path of [cwd, ...(recents ?? []).map((entry) => entry.path)]) {
      if (!path || !looksLikeProject(path)) continue;
      const key = pathKey(path);
      if (seen.has(key)) continue;
      seen.add(key);
      options.push({
        value: path,
        label: projectName(path),
        icon: <ProjectScopeIcon path={path} />,
      });
    }
    return options;
  }, [cwd, recents]);

  const project = scope === GLOBAL_PROVIDER_SCOPE ? null : scope;
  const projectSettings = project ? loadProjectProviderSettings(project) : {};
  // A project without overrides inherits the global default provider, the same
  // way `defaultSessionChoice` resolves it for new conversations.
  const effectiveDefaultHarness = project
    ? firstEnabledHarness(
        project,
        projectSettings.defaultHarness ?? choice?.harness ?? "cursor",
      )
    : (choice?.harness ?? null);

  useEffect(() => {
    void probeHarnessAvailability();
  }, []);

  useEffect(() => {
    if (!scopeOptions.some((option) => option.value === scope)) {
      setScope(GLOBAL_PROVIDER_SCOPE);
    }
  }, [scope, scopeOptions]);

  const onClaudeHooks = (next: boolean) => {
    saveClaudeHooks(next);
    setClaudeHooks(next);
  };

  const onAgentIdleMs = (next: number) => {
    saveAgentIdleMs(next);
    setAgentIdleMs(next);
  };

  const onModelChange = (harness: HarnessId, model: string) => {
    if (project) {
      setProjectDefaultModel(project, harness, model);
      return;
    }
    saveDefaultModel(harness, model);
    setDefaultModels((prev) => ({ ...prev, [harness]: model }));
    if (choice?.harness === harness) {
      saveLastModelChoice(harness, model);
      setChoice({ harness, model });
    }
  };

  const onDefault = (harness: HarnessId, model: string) => {
    if (project) {
      setProjectDefaultProvider(project, harness, model);
      return;
    }
    saveLastModelChoice(harness, model);
    setDefaultModels((prev) => ({ ...prev, [harness]: model }));
    setChoice({ harness, model });
  };

  const onPickerVisible = (harness: HarnessId, visible: boolean) => {
    if (project) {
      setProjectProviderHidden(project, harness, !visible);
      return;
    }
    savePickerProviderVisible(harness, visible);
    setHiddenGlobally((prev) =>
      visible
        ? prev.filter((id) => id !== harness)
        : [...new Set([...prev, harness])],
    );
  };

  return (
    <>
      <ProviderAccountsSettings />

      <Group
        id="agent-clis"
        title="Agent CLIs"
        action={
          <Select
            label="Provider defaults scope"
            value={scope}
            options={scopeOptions}
            onChange={setScope}
          />
        }
        description={
          project
            ? `These defaults apply to ${projectName(project)} only. A provider with Show in picker off is also kept out of new conversations started in this project. CLI paths remain global for Bonocode.`
            : "A provider is listed as installed once its CLI is found on your PATH. Uninstalled CLIs stay listed but are left out of the model picker, as are installed ones with Show in picker off. The model beside a provider is what its new conversations start with; Use by default picks the provider itself. CLI paths are global for Bonocode and apply to every project."
        }
      >
        {HARNESSES.map((harness) => {
          const inPicker = project
            ? !(projectSettings.hidden ?? []).includes(harness) &&
              !hiddenGlobally.includes(harness)
            : !hiddenGlobally.includes(harness);
          // A globally hidden provider stays out of every project's picker, so
          // the project toggle is shown locked rather than appearing to work.
          const pickerLocked =
            project != null && hiddenGlobally.includes(harness);
          const selectedModel = project
            ? (projectSettings.models?.[harness] ??
              (projectSettings.defaultHarness === harness
                ? projectSettings.defaultModel
                : undefined) ??
              defaultModels[harness] ??
              (choice?.harness === harness
                ? choice.model
                : defaultModelId(harness)))
            : (defaultModels[harness] ??
              (choice?.harness === harness
                ? choice.model
                : defaultModelId(harness)));
          const isDefault = project
            ? effectiveDefaultHarness === harness
            : choice?.harness === harness;
          return (
            <ProviderRow
              key={harness}
              harness={harness}
              selectedModel={selectedModel}
              isDefault={isDefault}
              inPicker={inPicker}
              pickerLocked={pickerLocked}
              onDefault={onDefault}
              onModelChange={onModelChange}
              onPickerVisible={(visible) => onPickerVisible(harness, visible)}
            />
          );
        })}
      </Group>

      <Group title="Advanced">
        <Row
          id="agent-idle"
          label="Keep agents running"
          description="After a turn, how long an agent stays running for follow-ups. Shorter frees memory; your next message restarts it and keeps the conversation."
        >
          <Select
            label="Keep agents running"
            value={String(agentIdleMs)}
            options={AGENT_IDLE_OPTIONS.map((option) => ({
              value: String(option.ms),
              label: option.label,
            }))}
            onChange={(value) => onAgentIdleMs(Number(value))}
          />
        </Row>
        <Row
          id="claude-hooks"
          label="Claude Code hooks"
          description="Run the hooks configured in your settings.json files — PreToolUse command rewrites, blocks, notifications, and the rest — just as the Claude Code CLI would. Turn this off if a hook is misbehaving and you need the session back. Takes effect on the next turn."
        >
          <Toggle
            label="Claude Code hooks"
            on={claudeHooks}
            onChange={onClaudeHooks}
          />
        </Row>
      </Group>
    </>
  );
}

type AccountEditor = {
  provider: ProviderAccountProvider;
  accountId?: string;
  label: string;
};

function ProviderAccountsSettings() {
  const [version, setVersion] = useState(0);
  const [editor, setEditor] = useState<AccountEditor | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(
    () => subscribeProviderAccounts(() => setVersion((value) => value + 1)),
    [],
  );

  const startAdd = (provider: ProviderAccountProvider) => {
    setError(null);
    setEditor({ provider, label: "" });
  };

  const startRename = (account: ProviderAccount) => {
    setError(null);
    setEditor({
      provider: account.provider,
      accountId: account.id,
      label: account.label,
    });
  };

  const submitEditor = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editor || !editor.label.trim() || working) return;
    const key = editor.accountId
      ? `rename:${editor.provider}:${editor.accountId}`
      : `add:${editor.provider}`;
    setWorking(key);
    setError(null);
    try {
      if (editor.accountId) {
        renameProviderAccount(editor.provider, editor.accountId, editor.label);
      } else {
        const account = newProviderAccount(editor.provider, editor.label);
        await loginHarness(editor.provider, account.id);
        saveProviderAccount(account);
      }
      setEditor(null);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not save this account",
      );
    } finally {
      setWorking(null);
    }
  };

  const removeAccount = async (account: ProviderAccount) => {
    if (account.isDefault || working) return;
    const confirmed = await ask(
      `Remove “${account.label}”? Its stored credentials will be deleted and any running turns for this account will stop. Existing conversations stay in history, but cannot continue until you switch accounts.`,
      {
        title: `Remove ${HARNESS_TITLE[account.provider]} account`,
        kind: "warning",
        okLabel: "Remove account",
        cancelLabel: "Cancel",
      },
    );
    if (!confirmed) return;
    const key = `remove:${account.provider}:${account.id}`;
    setWorking(key);
    setError(null);
    try {
      await removeProviderAccountCredentials(account.provider, account.id);
      removeProviderAccount(account.provider, account.id);
      clearCachedRateLimits(account.provider, account.id);
      if (
        editor?.provider === account.provider &&
        editor.accountId === account.id
      ) {
        setEditor(null);
      }
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not remove this account",
      );
    } finally {
      setWorking(null);
    }
  };

  const identities = useProviderAccountIdentities(
    PROVIDER_ACCOUNT_PROVIDERS.flatMap(providerAccounts),
    version,
  );
  const usage = useProviderAccountUsage(version);

  return (
    <Group
      id="provider-accounts"
      title="Accounts"
      description="Create isolated sign-ins for providers that support account profiles. Account switching stays available from the usage control in the footer."
      action={<AccountUsageRefresh usage={usage} />}
    >
      {PROVIDER_ACCOUNT_PROVIDERS.map((provider) => {
        const accounts = providerAccounts(provider);
        const adding = editor?.provider === provider && !editor.accountId;
        return (
          <div
            key={provider}
            className="border-b border-content/5 last:border-b-0"
          >
            <div className="flex items-center gap-4 px-4 py-3.5">
              <div className="flex min-w-0 flex-1 items-center gap-2.5">
                <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-content/[0.05] ring-1 ring-inset ring-content/[0.06]">
                  <HarnessIcon harness={provider} className="size-4" />
                </span>
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-content">
                    {HARNESS_TITLE[provider]}
                  </div>
                  <div className="mt-0.5 text-[11px] text-content/40">
                    {accounts.length}{" "}
                    {accounts.length === 1 ? "account" : "accounts"}
                  </div>
                </div>
              </div>
              <button
                type="button"
                disabled={Boolean(working)}
                onClick={() => startAdd(provider)}
                className="flex shrink-0 items-center gap-1.5 rounded-md border border-content/10 px-2.5 py-1 text-[12px] text-content/70 transition-transform duration-150 hover:bg-content/10 hover:text-content active:scale-[0.97] disabled:cursor-default disabled:opacity-40"
              >
                <Plus className="size-3.5" strokeWidth={1.75} aria-hidden />
                Add account
              </button>
            </div>
            <div className="border-t border-content/5 bg-content/[0.015] pl-10">
              {accounts.map((account) => {
                const editing =
                  editor?.provider === provider &&
                  editor.accountId === account.id;
                const removing = working === `remove:${provider}:${account.id}`;
                const identity = identities[identityKey(account)];
                const orgTag = identityOrganizationTag(identity);
                const limits = usage.usage[accountUsageKey(account)];
                return editing ? (
                  <ProviderAccountEditor
                    key={account.id}
                    editor={editor}
                    working={Boolean(working)}
                    onLabel={(label) =>
                      setEditor((current) =>
                        current ? { ...current, label } : current,
                      )
                    }
                    onCancel={() => setEditor(null)}
                    onSubmit={submitEditor}
                  />
                ) : (
                  <div
                    key={account.id}
                    className="flex h-12 items-center gap-3 border-b border-content/5 px-4 py-2 last:border-b-0"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate text-[12px] text-content/85">
                          {account.label}
                        </span>
                        {orgTag ? (
                          <span className="max-w-[8rem] shrink-0 truncate rounded bg-content/[0.07] px-1 text-[9px] leading-4 text-content/50">
                            {orgTag}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-0.5 flex min-w-0 items-center gap-2.5 text-[10px]">
                        <AccountStatusLabel
                          status={accountStatus(limits, usage.now)}
                          className="shrink-0"
                        />
                        <ProviderAccountSubtitle
                          identity={identity}
                          fallback={
                            account.isDefault
                              ? "Provider CLI profile"
                              : "Isolated profile"
                          }
                          className="truncate text-content/30"
                        />
                      </div>
                    </div>
                    <AccountUsageMeters limits={limits} now={usage.now} />
                    <div className="flex w-24 shrink-0 items-center justify-end gap-1">
                      {account.isDefault ? (
                        <span className="mr-1 text-[10px] font-medium uppercase tracking-wide text-content/30">
                          Default
                        </span>
                      ) : null}
                      <button
                        type="button"
                        disabled={Boolean(working)}
                        aria-label={`Rename ${account.label}`}
                        title="Rename account"
                        onClick={() => startRename(account)}
                        className="grid size-7 place-items-center rounded-md text-content/40 transition-transform duration-150 hover:bg-content/10 hover:text-content active:scale-[0.96] disabled:opacity-35"
                      >
                        <Pencil className="size-3.5" strokeWidth={1.75} />
                      </button>
                      {!account.isDefault ? (
                        <button
                          type="button"
                          disabled={Boolean(working)}
                          aria-label={`Remove ${account.label}`}
                          title="Remove account"
                          onClick={() => void removeAccount(account)}
                          className="grid size-7 place-items-center rounded-md text-content/35 transition-transform duration-150 hover:bg-danger/10 hover:text-danger active:scale-[0.96] disabled:opacity-35"
                        >
                          {removing ? (
                            <Loader className="size-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="size-3.5" strokeWidth={1.75} />
                          )}
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
              {adding && editor ? (
                <ProviderAccountEditor
                  editor={editor}
                  working={Boolean(working)}
                  onLabel={(label) =>
                    setEditor((current) =>
                      current ? { ...current, label } : current,
                    )
                  }
                  onCancel={() => setEditor(null)}
                  onSubmit={submitEditor}
                />
              ) : null}
            </div>
          </div>
        );
      })}
      {error ? (
        <p
          className="border-t border-content/5 px-4 py-2.5 text-[11px] leading-4 text-danger"
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </Group>
  );
}

function ProviderAccountEditor({
  editor,
  working,
  onLabel,
  onCancel,
  onSubmit,
}: {
  editor: AccountEditor;
  working: boolean;
  onLabel: (label: string) => void;
  onCancel: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const adding = !editor.accountId;
  return (
    <form
      className="flex h-12 items-center border-b border-content/5 px-4 py-2 last:border-b-0"
      onSubmit={onSubmit}
    >
      <div
        data-provider-account-editor-field
        className="flex items-center pr-1 h-8 min-w-0 flex-1 overflow-hidden rounded-md border border-content/10 bg-content/[0.04] focus-within:border-accent/45"
      >
        <label className="h-full min-w-0 flex-1">
          <span className="sr-only">Account name</span>
          <input
            autoFocus
            type="text"
            maxLength={48}
            value={editor.label}
            disabled={working}
            placeholder="Work or Personal"
            aria-label={`${adding ? "New" : "Rename"} ${HARNESS_TITLE[editor.provider]} account`}
            onChange={(event) => onLabel(event.target.value)}
            className="h-full w-full bg-transparent px-2.5 text-[12px] text-content outline-none placeholder:text-content/25 disabled:opacity-50"
          />
        </label>
        <button
          type="button"
          disabled={working}
          onClick={onCancel}
          className="flex h-6 shrink-0 items-center rounded-[4.5px] bg-content/[0.05] px-2.5 text-[11px] text-content/45 transition-transform duration-150 hover:bg-content/10 hover:text-content active:scale-[0.97] disabled:opacity-40"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={working || !editor.label.trim()}
          className="ml-1 flex h-6 shrink-0 items-center gap-1.5 rounded-[4.5px] bg-content px-2.5 text-[11px] font-medium text-background-base transition-transform duration-150 hover:bg-content/85 active:scale-[0.97] disabled:cursor-default disabled:opacity-40"
        >
          {working ? <Loader className="size-3 animate-spin" /> : null}
          {adding
            ? working
              ? "Waiting for browser…"
              : "Sign in and add"
            : "Save"}
        </button>
      </div>
    </form>
  );
}

/** The icon the project rail shows: custom logo, else the project mascot. */
function ProjectScopeIcon({ path }: { path: string }) {
  const logos = useTabGroupLogos();
  const [colors] = useState(loadTabGroupColors);
  const [customColors] = useState(loadTabGroupCustomColors);
  const [mascots] = useState(loadTabGroupMascots);
  const key = projectKey(path);
  const name = projectName(path);
  const logoPath = resolveTabGroupLogo(key, logos);
  if (logoPath) {
    return (
      <ProjectLogoIcon
        path={logoPath}
        className="size-4 rounded-sm"
        imageClassName="size-4"
      />
    );
  }
  return (
    <ProjectMascot
      project={name}
      color={resolveTabGroupColor(key, colors, customColors, name)}
      name={resolveTabGroupMascot(key, mascots)}
      className="size-3.5"
    />
  );
}

function ProviderRow({
  harness,
  selectedModel,
  isDefault,
  inPicker,
  pickerLocked = false,
  onDefault,
  onModelChange,
  onPickerVisible,
}: {
  harness: HarnessId;
  selectedModel: string;
  isDefault: boolean;
  inPicker: boolean;
  /** Globally hidden providers cannot be turned on per project. */
  pickerLocked?: boolean;
  onDefault: (harness: HarnessId, model: string) => void;
  onModelChange: (harness: HarnessId, model: string) => void;
  onPickerVisible: (visible: boolean) => void;
}) {
  const models = modelsFor(harness);
  const available = isHarnessAvailable(harness);
  const current =
    models.length > 0 ? resolveModel(harness, selectedModel) : null;

  useEffect(() => {
    if (!available || models.length > 0) return;
    void refreshHarnessCatalogs([harness]);
  }, [available, harness, models.length]);

  return (
    <Row
      label={
        <span className="flex items-center gap-2">
          <HarnessIcon harness={harness} className="size-4 shrink-0" />
          {HARNESS_TITLE[harness]}
          <ProviderBinaryControl provider={harness} />
          {isDefault ? (
            <span className="rounded-full bg-content/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-content/60">
              Default
            </span>
          ) : null}
        </span>
      }
      description={
        available
          ? `${models.length} ${models.length === 1 ? "model" : "models"} available.`
          : harnessUnavailableHint(harness)
      }
    >
      {current ? (
        <Select
          label={`${HARNESS_TITLE[harness]} model`}
          value={current.id}
          onChange={(next) => onModelChange(harness, next)}
          options={models.map((item) => ({
            value: item.id,
            label: item.name,
          }))}
        />
      ) : null}
      <SecondaryButton
        onClick={() => current && onDefault(harness, current.id)}
        disabled={isDefault || !current}
      >
        {isDefault ? "Default" : "Use by default"}
      </SecondaryButton>
      {available ? (
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-content/50">
            {pickerLocked ? "Hidden globally" : "Show in picker"}
          </span>
          <Toggle
            label={`Show ${HARNESS_TITLE[harness]} in the model picker`}
            on={inPicker}
            onChange={onPickerVisible}
            disabled={pickerLocked}
          />
        </div>
      ) : null}
    </Row>
  );
}

function useArchivedProjects(): ArchivedProject[] {
  const [items, setItems] = useState(loadArchivedProjects);
  useEffect(
    () => subscribeArchivedProjects(() => setItems(loadArchivedProjects())),
    [],
  );
  return items;
}

function archivedProjectLabel(path: string): string {
  return resolveTabGroupLabel(
    projectKey(path),
    loadTabGroupLabels(),
    projectName(path),
  );
}

function ArchivePage({
  cwd,
  sessions,
  onOpenSession,
  onArchiveSession,
  onDeleteSession,
  onRestoreProject,
  onDeleteProject,
}: {
  cwd: string;
  sessions: SessionSummary[];
  onOpenSession: (sessionId: string) => void;
  onArchiveSession: (sessionId: string, archived: boolean) => void;
  onDeleteSession: (sessionId: string) => void;
  onRestoreProject?: (path: string) => void;
  onDeleteProject?: (path: string) => void;
}) {
  const [filters, setFilters] = useState(loadSessionSidebarFilters);
  const [deleting, setDeleting] = useState<ArchivedProject | null>(null);
  const archivedProjects = useArchivedProjects();
  const archived = useMemo(
    () =>
      sessions
        .filter((session) => session.archived)
        .sort((a, b) => b.updatedAt - a.updatedAt),
    [sessions],
  );

  const onShowArchived = (showArchived: boolean) => {
    const next = { ...filters, showArchived };
    saveSessionSidebarFilters(next);
    setFilters(next);
  };

  return (
    <>
      <Group
        title="Archived projects"
        description="Archive a project from the rail to keep its chats without listing it in the sidebar."
      >
        {archivedProjects.length === 0 ? (
          <p className="px-4 py-3.5 text-[12px] text-content/45">
            No archived projects.
          </p>
        ) : (
          archivedProjects.map((project) => (
            <div
              key={project.path}
              className="flex items-center gap-3 border-b border-content/5 px-4 py-2.5 last:border-b-0"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px]">
                  {archivedProjectLabel(project.path)}
                </div>
                <div className="truncate text-[11px] text-content/40">
                  {prettyCwd(project.path)}
                </div>
              </div>
              {onRestoreProject ? (
                <SecondaryButton onClick={() => onRestoreProject(project.path)}>
                  Restore
                </SecondaryButton>
              ) : null}
              {onDeleteProject ? (
                <SecondaryButton danger onClick={() => setDeleting(project)}>
                  Delete
                </SecondaryButton>
              ) : null}
            </div>
          ))
        )}
      </Group>

      <Group
        title={
          looksLikeProject(cwd)
            ? `Archived in ${projectName(cwd)}`
            : "Archived conversations"
        }
      >
        <Row
          id="show-archived"
          label="Show archived in the sidebar"
          description="Keep archived conversations listed alongside the active ones."
        >
          <Toggle
            label="Show archived in the sidebar"
            on={filters.showArchived}
            onChange={onShowArchived}
          />
        </Row>
        {!looksLikeProject(cwd) ? (
          <p className="px-4 py-3.5 text-[12px] text-content/45">
            Open a project to see its archived conversations.
          </p>
        ) : archived.length === 0 ? (
          <p className="px-4 py-3.5 text-[12px] text-content/45">
            No archived conversations in this project.
          </p>
        ) : (
          archived.map((session) => (
            <div
              key={session.id}
              className="flex items-center gap-3 border-b border-content/5 px-4 py-2.5 last:border-b-0"
            >
              <HarnessIcon
                harness={session.harness}
                className="size-3.5 shrink-0"
              />
              <button
                type="button"
                onClick={() => onOpenSession(session.id)}
                className="min-w-0 flex-1 truncate text-left text-[13px] hover:text-content"
              >
                {sessionDisplayTitle(session.title, session.harness)}
              </button>
              <span className="shrink-0 text-[11px] text-content/35 tabular-nums">
                {formatDate(session.updatedAt)}
              </span>
              <SecondaryButton
                onClick={() => onArchiveSession(session.id, false)}
              >
                Unarchive
              </SecondaryButton>
              <SecondaryButton
                danger
                onClick={() => onDeleteSession(session.id)}
              >
                Delete
              </SecondaryButton>
            </div>
          ))
        )}
      </Group>

      {deleting ? (
        <RemoveProjectDialog
          name={archivedProjectLabel(deleting.path)}
          path={deleting.path}
          onCancel={() => setDeleting(null)}
          onConfirm={() => {
            onDeleteProject?.(deleting.path);
            setDeleting(null);
          }}
        />
      ) : null}
    </>
  );
}

function formatDate(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "";
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
    }).format(new Date(value));
  } catch {
    return "";
  }
}

function PageHeader({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <header className="pb-4">
      <h1 className="text-[20px] font-semibold leading-tight text-content">
        {title}
      </h1>
      {description ? (
        <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-content/45">
          {description}
        </p>
      ) : null}
    </header>
  );
}

/** macOS keeps the decision after the first prompt; only System Settings can flip it. Windows toasts are governed by Settings > Notifications. */
function NotificationsBlocked() {
  return (
    <span className="flex items-center gap-2 text-[12px] text-content/45">
      Permission needed
      {IS_MAC || IS_WIN ? (
        <button
          type="button"
          onClick={() => {
            void openNotificationSettings().catch(() => {});
          }}
          className="rounded-md border border-content/10 px-2 py-1 text-content/70 hover:bg-content/10 hover:text-content"
        >
          Open System Settings
        </button>
      ) : null}
    </span>
  );
}
