import { IS_WIN } from "../../../platform/tauri/platform";
import {
  HARNESS_IDLE_PARK_MS,
  setHarnessIdleParkMs,
} from "../../../integrations/harness/core/registry";
import { defineSetting, flag, oneOf, readStored } from "./defineSetting";

// Keybindings live in their own module; re-exported so importers stay put.
export * from "./keybindings";

const SECTION_KEY = "bonocode.settingsSection";

export type SettingsSectionId =
  | "general"
  | "appearance"
  | "keybindings"
  | "chat"
  | "providers"
  | "mcp"
  | "skills"
  | "github"
  | "worktrees"
  | "archive";

/** Rail buckets. Sections list in order under their group label. */
export type SettingsGroupId = "app" | "agents" | "workspace";

export const SETTINGS_GROUPS: { id: SettingsGroupId; label: string }[] = [
  { id: "app", label: "App" },
  { id: "agents", label: "Agents" },
  { id: "workspace", label: "Workspace" },
];

export type SettingsSection = {
  id: SettingsSectionId;
  group: SettingsGroupId;
  label: string;
  description: string;
  /** Extra words search matches the section on, beyond its label. */
  keywords?: string;
};

export const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    id: "general",
    group: "app",
    label: "General",
    description:
      "The build you are running, how Bonocode reaches you, and the panels it shows.",
    keywords: "version update sounds notifications rail",
  },
  {
    id: "appearance",
    group: "app",
    label: "Appearance",
    description:
      "Theme, translucency, workspace layout, and conversation backgrounds.",
    keywords:
      "theme dark light color accent glass blur zoom scale wallpaper rail sidebar",
  },
  {
    id: "keybindings",
    group: "app",
    label: "Keybindings",
    description:
      "Every shortcut the workspace handles, from the app menu and the key handler.",
    keywords: "shortcut hotkey keyboard binding",
  },
  {
    id: "chat",
    group: "agents",
    label: "Chat",
    description:
      "How transcripts read, what the composer does with a follow-up, how files save, and how diffs open.",
    keywords:
      "transcript composer prompt message diff review layout format save editor",
  },
  {
    id: "providers",
    group: "agents",
    label: "Providers",
    description:
      "Provider accounts, agent CLIs Bonocode can drive, and the model new sessions start with.",
    keywords:
      "account sign in login model harness claude codex gemini cli default hooks",
  },
  {
    id: "mcp",
    group: "agents",
    label: "MCP",
    description: "Find MCP servers across providers and manage their connections.",
    keywords: "tools servers connections oauth authenticate login claude codex cursor opencode",
  },
  {
    id: "skills",
    group: "agents",
    label: "Skills",
    description:
      "Discover and manage file skills from project, personal, and harness folders.",
    keywords: "skill instructions prompt",
  },
  {
    id: "github",
    group: "workspace",
    label: "GitHub & notifications",
    description:
      "Notification preferences for each project, and the GitHub connection that linked chats use.",
    keywords: "github connect token integration",
  },
  {
    id: "archive",
    group: "workspace",
    label: "Archive",
    description: "Projects and conversations you have archived.",
    keywords: "archived restore delete hidden",
  },
  {
    id: "worktrees",
    group: "workspace",
    label: "Worktrees",
    description: "Manage additional worktrees for each project.",
    keywords: "git branch worktree working copy project create delete",
  },
];

export function settingsSectionsByGroup(): {
  id: SettingsGroupId;
  label: string;
  sections: SettingsSection[];
}[] {
  return SETTINGS_GROUPS.map((group) => ({
    ...group,
    sections: SETTINGS_SECTIONS.filter((section) => section.group === group.id),
  })).filter((group) => group.sections.length > 0);
}

/**
 * One searchable control. `id` is the row's `data-setting-id` in SettingsView,
 * which is also what Settings scrolls to when it opens on an anchor.
 */
export type SettingsEntry = {
  id: string;
  section: SettingsSectionId;
  label: string;
  keywords?: string;
};

export const SETTINGS_INDEX: SettingsEntry[] = [
  {
    id: "mcp-servers",
    section: "mcp",
    label: "MCP servers",
    keywords: "claude tools connections oauth authenticate login add remove",
  },
  {
    id: "project-worktrees",
    section: "worktrees",
    label: "Project worktrees",
    keywords: "git branch working copy create delete manage",
  },
  {
    id: "update",
    section: "general",
    label: "Version",
    keywords: "update upgrade release what's new build changelog",
  },
  {
    id: "sounds",
    section: "general",
    label: "Sounds",
    keywords: "audio cue chime mute volume",
  },
  {
    id: "notifications",
    section: "general",
    label: "Notifications",
    keywords: "notify alert toast permission background",
  },
  {
    id: "working-agents",
    section: "general",
    label: "Working agents",
    keywords: "live running sessions rail card",
  },
  {
    id: "file-tabs",
    section: "general",
    label: "File tabs",
    keywords: "editor open top workspace normal session pane beside chat",
  },
  {
    id: "tab-animations",
    section: "general",
    label: "Tab animations",
    keywords: "motion open close resize transition",
  },
  ...(IS_WIN
    ? [
        {
          id: "close-to-tray",
          section: "general" as const,
          label: "Close to tray",
          keywords: "minimize background quit exit window taskbar windows",
        },
      ]
    : []),
  {
    id: "theme",
    section: "appearance",
    label: "Theme",
    keywords: "dark light color palette accent font",
  },
  {
    id: "theme-editor",
    section: "appearance",
    label: "Theme editor",
    keywords:
      "colors fonts code size glass translucency blur opacity status terminal syntax custom",
  },
  {
    id: "interface-scale",
    section: "appearance",
    label: "Interface scale",
    keywords: "zoom font size bigger smaller ui",
  },
  {
    id: "collapsed-project-rail",
    section: "appearance",
    label: "Collapsed project rail",
    keywords: "sidebar compact icons hidden navigation layout",
  },
  {
    id: "show-excluded-files",
    section: "appearance",
    label: "Show excluded files",
    keywords: "explorer gitignore ignored hidden files tree",
  },
  {
    id: "chat-background",
    section: "appearance",
    label: "Chat background",
    keywords: "wallpaper image picture opacity backdrop",
  },
  {
    id: "transcript-layout",
    section: "chat",
    label: "Transcript layout",
    keywords: "full width chat bubble message",
  },
  {
    id: "anchor-prompts",
    section: "chat",
    label: "Anchor prompts to top",
    keywords: "scroll position sticky message",
  },
  {
    id: "follow-up",
    section: "chat",
    label: "Follow-up behavior",
    keywords: "queue steer interrupt send while running",
  },
  {
    id: "model-controls",
    section: "chat",
    label: "Model controls",
    keywords:
      "effort thinking reasoning fast service tier model picker composer",
  },
  {
    id: "composer-mascot",
    section: "chat",
    label: "Composer mascot",
    keywords: "runner animation coin fun",
  },
  {
    id: "format-on-save",
    section: "chat",
    label: "Format on save",
    keywords: "prettier quotes editor save format",
  },
  {
    id: "diff-view",
    section: "chat",
    label: "Diff view",
    keywords: "unified editor review changes working tree",
  },
  {
    id: "agent-clis",
    section: "providers",
    label: "Agent CLIs",
    keywords: "codex opencode cursor grok pi omp fx hermes antigravity binary path",
  },
  {
    id: "provider-accounts",
    section: "providers",
    label: "Provider accounts",
    keywords:
      "account sign in login rename remove delete credentials profile usage limit quota exhausted",
  },
  {
    id: "agent-idle",
    section: "providers",
    label: "Keep agents running",
    keywords: "idle park stop process memory timeout warm",
  },
  {
    id: "claude-hooks",
    section: "providers",
    label: "Claude Code hooks",
    keywords: "pretooluse settings.json block command notification",
  },
  {
    id: "project-notifications",
    section: "github",
    label: "Project notifications",
    keywords: "mute resume sounds banners categories",
  },
  {
    id: "github",
    section: "github",
    label: "GitHub",
    keywords: "gh cli connect pull request sign in",
  },
  {
    id: "show-archived",
    section: "archive",
    label: "Show archived in the sidebar",
    keywords: "hidden conversations list",
  },
];

export type SettingsSearchResult = {
  section: SettingsSectionId;
  sectionLabel: string;
  /** Row to scroll to, or `null` when the whole section matched. */
  settingId: string | null;
  label: string;
};

/** Ranks a label/keyword pair against a lowercased needle; `null` means no match. */
function matchScore(
  needle: string,
  label: string,
  keywords?: string,
): number | null {
  const lower = label.toLowerCase();
  if (lower.startsWith(needle)) return 0;
  if (lower.includes(needle)) return 1;
  if (keywords?.toLowerCase().includes(needle)) return 2;
  return null;
}

/** Individual settings first, then whole sections, so a row wins its own name. */
export function searchSettings(
  query: string,
  limit = 8,
): SettingsSearchResult[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const scored: { score: number; result: SettingsSearchResult }[] = [];

  for (const entry of SETTINGS_INDEX) {
    const score = matchScore(needle, entry.label, entry.keywords);
    if (score == null) continue;
    scored.push({
      score,
      result: {
        section: entry.section,
        sectionLabel: settingsSectionLabel(entry.section),
        settingId: entry.id,
        label: entry.label,
      },
    });
  }

  for (const section of SETTINGS_SECTIONS) {
    const score = matchScore(
      needle,
      section.label,
      `${section.description} ${section.keywords ?? ""}`,
    );
    if (score == null) continue;
    scored.push({
      score: score + 0.5,
      result: {
        section: section.id,
        sectionLabel: section.label,
        settingId: null,
        label: section.label,
      },
    });
  }

  return scored
    .sort(
      (a, b) =>
        a.score - b.score || a.result.label.localeCompare(b.result.label),
    )
    .slice(0, limit)
    .map((item) => item.result);
}

export const SETTINGS_SECTION_DEFAULT: SettingsSectionId = "general";

export function isSettingsSectionId(
  value: unknown,
): value is SettingsSectionId {
  return SETTINGS_SECTIONS.some((section) => section.id === value);
}

export function settingsSectionLabel(id: SettingsSectionId): string {
  return (
    SETTINGS_SECTIONS.find((section) => section.id === id)?.label ?? "General"
  );
}

export function settingsSectionDescription(id: SettingsSectionId): string {
  return (
    SETTINGS_SECTIONS.find((section) => section.id === id)?.description ?? ""
  );
}

const settingsSection = defineSetting<SettingsSectionId>({
  key: SECTION_KEY,
  default: SETTINGS_SECTION_DEFAULT,
  parse: (raw) => (isSettingsSectionId(raw) ? raw : undefined),
});

export const loadSettingsSection = settingsSection.load;
export const saveSettingsSection = settingsSection.save;

const COMPOSER_RUNNER_KEY = "bonocode.composerRunner";

const FOLLOW_UP_BEHAVIOR_KEY = "bonocode.followUpBehavior";

const COMPOSER_EFFORT_VISIBLE_KEY = "bonocode.composerEffortVisible";

const MODEL_CONTROLS_KEY = "bonocode.modelControls";

const FILE_TAB_MODE_KEY = "bonocode.fileTabMode";

const TAB_ANIMATIONS_ENABLED_KEY = "bonocode.tabAnimationsEnabled";

const COLLAPSED_PROJECT_RAIL_MODE_KEY = "bonocode.collapsedProjectRailMode";

export type FollowUpBehavior = "steer" | "queue";

export const FOLLOW_UP_BEHAVIOR_DEFAULT: FollowUpBehavior = "steer";

const followUpBehavior = defineSetting<FollowUpBehavior>({
  key: FOLLOW_UP_BEHAVIOR_KEY,
  default: FOLLOW_UP_BEHAVIOR_DEFAULT,
  ...oneOf<FollowUpBehavior>("steer", "queue"),
});

export const loadFollowUpBehavior = followUpBehavior.load;
export const saveFollowUpBehavior = followUpBehavior.save;

const AGENT_IDLE_KEY = "bonocode.agentIdleMs";

export const AGENT_IDLE_OPTIONS: { ms: number; label: string }[] = [
  { ms: 30_000, label: "30 seconds" },
  { ms: 60_000, label: "1 minute" },
  { ms: 120_000, label: "2 minutes" },
  { ms: 300_000, label: "5 minutes" },
  { ms: 900_000, label: "15 minutes" },
];


/** How long an agent stays running after a turn. Unknown stored values fall back to the default. */
export function loadAgentIdleMs(): number {
  try {
    const stored = Number(localStorage.getItem(AGENT_IDLE_KEY));
    return AGENT_IDLE_OPTIONS.some((option) => option.ms === stored)
      ? stored
      : HARNESS_IDLE_PARK_MS;
  } catch {
    return HARNESS_IDLE_PARK_MS;
  }
}

export function saveAgentIdleMs(ms: number) {
  try {
    localStorage.setItem(AGENT_IDLE_KEY, String(ms));
  } catch {
    // private mode / quota
  }
  setHarnessIdleParkMs(ms);
}

export type FileTabMode = "pane" | "workspace";

export const FILE_TAB_MODE_DEFAULT: FileTabMode = "pane";

const fileTabMode = defineSetting<FileTabMode>({
  key: FILE_TAB_MODE_KEY,
  default: FILE_TAB_MODE_DEFAULT,
  ...oneOf<FileTabMode>("pane", "workspace"),
});

/** Choose whether an ordinary file joins the active pane or gets a top tab. */
export const loadFileTabMode = fileTabMode.load;
export const saveFileTabMode = fileTabMode.save;

export const TAB_ANIMATIONS_ENABLED_DEFAULT = false;

const tabAnimationsEnabled = defineSetting<boolean>({
  key: TAB_ANIMATIONS_ENABLED_KEY,
  default: TAB_ANIMATIONS_ENABLED_DEFAULT,
  ...flag(),
});

export const loadTabAnimationsEnabled = tabAnimationsEnabled.load;
export const saveTabAnimationsEnabled = tabAnimationsEnabled.save;

export type CollapsedProjectRailMode = "compact" | "hidden";

export const COLLAPSED_PROJECT_RAIL_MODE_DEFAULT: CollapsedProjectRailMode =
  "compact";

export const COLLAPSED_PROJECT_RAIL_MODE_CHANGE_EVENT =
  "bonocode:collapsed-project-rail-mode-change";

const collapsedProjectRailMode = defineSetting<CollapsedProjectRailMode>({
  key: COLLAPSED_PROJECT_RAIL_MODE_KEY,
  default: COLLAPSED_PROJECT_RAIL_MODE_DEFAULT,
  ...oneOf<CollapsedProjectRailMode>("compact", "hidden"),
  event: COLLAPSED_PROJECT_RAIL_MODE_CHANGE_EVENT,
});

export const loadCollapsedProjectRailMode = collapsedProjectRailMode.load;
export const saveCollapsedProjectRailMode = collapsedProjectRailMode.save;
export const subscribeCollapsedProjectRailMode =
  collapsedProjectRailMode.subscribe;

export type ModelControls = "menu" | "beside";

export const MODEL_CONTROLS_DEFAULT: ModelControls = "menu";

/** Fired on `window` when the composer model controls setting flips. */
export const MODEL_CONTROLS_CHANGE_EVENT = "bonocode:model-controls-change";

const modelControlValues = oneOf<ModelControls>("menu", "beside");

const modelControls = defineSetting<ModelControls>({
  key: MODEL_CONTROLS_KEY,
  default: MODEL_CONTROLS_DEFAULT,
  parse: (raw) => {
    if (raw != null) return modelControlValues.parse(raw);
    // Migrate the previous effort-control toggle: on means beside the picker.
    const legacy = readStored(COMPOSER_EFFORT_VISIBLE_KEY);
    return legacy === "1" || legacy === "true" ? "beside" : undefined;
  },
  event: MODEL_CONTROLS_CHANGE_EVENT,
});

export const loadModelControls = modelControls.load;
export const saveModelControls = modelControls.save;
export const subscribeModelControls = modelControls.subscribe;

export const COMPOSER_RUNNER_DEFAULT = true;

/** Fired on `window` when the composer mascot setting flips. */
export const COMPOSER_RUNNER_CHANGE_EVENT = "bonocode:composer-runner-change";

const composerRunner = defineSetting<boolean>({
  key: COMPOSER_RUNNER_KEY,
  default: COMPOSER_RUNNER_DEFAULT,
  ...flag(),
  event: COMPOSER_RUNNER_CHANGE_EVENT,
});

export const loadComposerRunner = composerRunner.load;
export const saveComposerRunner = composerRunner.save;

const LIVE_AGENTS_ENABLED_KEY = "bonocode.liveAgentsEnabled";

export const LIVE_AGENTS_ENABLED_DEFAULT = true;

/** Fired on `window` when the working-agents rail card setting flips. */
export const LIVE_AGENTS_ENABLED_CHANGE_EVENT =
  "bonocode:live-agents-enabled-change";

const liveAgentsEnabled = defineSetting<boolean>({
  key: LIVE_AGENTS_ENABLED_KEY,
  default: LIVE_AGENTS_ENABLED_DEFAULT,
  ...flag(),
  event: LIVE_AGENTS_ENABLED_CHANGE_EVENT,
});

export const loadLiveAgentsEnabled = liveAgentsEnabled.load;
export const saveLiveAgentsEnabled = liveAgentsEnabled.save;
export const subscribeLiveAgentsEnabled = liveAgentsEnabled.subscribe;

const CLOSE_TO_TRAY_KEY = "bonocode.closeToTray";

export const CLOSE_TO_TRAY_DEFAULT = true;

const closeToTray = defineSetting<boolean>({
  key: CLOSE_TO_TRAY_KEY,
  default: CLOSE_TO_TRAY_DEFAULT,
  ...flag(),
});

export function loadCloseToTray(): boolean {
  // Close to tray is Windows-only: nowhere else installs a tray icon.
  if (!IS_WIN) return false;
  return closeToTray.load();
}

export const saveCloseToTray = closeToTray.save;

const DIFF_VIEWER_KEY = "bonocode.diffViewer";

export type DiffViewer = "editor" | "unified";

export const DIFF_VIEWER_DEFAULT: DiffViewer = "editor";

/** Fired on `window` when the working-tree diff layout flips. */
export const DIFF_VIEWER_CHANGE_EVENT = "bonocode:diff-viewer-change";

function isDiffViewer(value: unknown): value is DiffViewer {
  return value === "editor" || value === "unified";
}

const diffViewer = defineSetting<DiffViewer>({
  key: DIFF_VIEWER_KEY,
  default: DIFF_VIEWER_DEFAULT,
  ...oneOf<DiffViewer>("editor", "unified"),
  normalize: (value) => (isDiffViewer(value) ? value : DIFF_VIEWER_DEFAULT),
  event: DIFF_VIEWER_CHANGE_EVENT,
});

export const loadDiffViewer = diffViewer.load;
export const saveDiffViewer = diffViewer.save;
export const subscribeDiffViewer = diffViewer.subscribe;

const FORMAT_ON_SAVE_KEY = "bonocode.formatOnSave";

export const FORMAT_ON_SAVE_DEFAULT = true;

const formatOnSave = defineSetting<boolean>({
  key: FORMAT_ON_SAVE_KEY,
  default: FORMAT_ON_SAVE_DEFAULT,
  ...flag(),
});

export const loadFormatOnSave = formatOnSave.load;
export const saveFormatOnSave = formatOnSave.save;

const AUTOSAVE_KEY = "bonocode.autosave";
const AUTOSAVE_CHANGE_EVENT = "bonocode:autosave-change";

export const AUTOSAVE_DEFAULT = false;

const autosave = defineSetting<boolean>({
  key: AUTOSAVE_KEY,
  default: AUTOSAVE_DEFAULT,
  ...flag(),
  event: AUTOSAVE_CHANGE_EVENT,
  // Another window's write also means this window's switch has moved.
  crossWindow: true,
});

export const loadAutosave = autosave.load;
export const subscribeAutosave = autosave.subscribe;

/** Returns the value storage holds after the write, which is what the switch should show. */
export function saveAutosave(value: boolean): boolean {
  autosave.save(value);
  return autosave.load();
}

const CLAUDE_HOOKS_KEY = "bonocode.claudeHooks";

export const CLAUDE_HOOKS_DEFAULT = true;

const claudeHooks = defineSetting<boolean>({
  key: CLAUDE_HOOKS_KEY,
  default: CLAUDE_HOOKS_DEFAULT,
  ...flag(),
});

export const loadClaudeHooks = claudeHooks.load;
export const saveClaudeHooks = claudeHooks.save;
