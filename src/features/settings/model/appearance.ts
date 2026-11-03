import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { hexToRgb, isHexColor, type Rgb } from "../../../shared/lib/colorUtils";
import { IS_LINUX, IS_MAC } from "../../../platform/tauri/platform";
import {
  clampedNumber,
  defineSetting,
  flag,
  oneOf,
  readStored,
} from "./defineSetting";
import { applyUiScale, loadUiScale } from "./uiScale";
import {
  applyPreparedNewThreadBackground,
  clearPreparedNewThreadBackground,
} from "./newThreadBackgroundEffects";

const PROJECT_RAIL_OPEN_KEY = "bonocode.projectRailOpen";
const SESSION_SIDEBAR_OPEN_KEY = "bonocode.sessionSidebarOpen";
const SIDEBAR_TAB_ORDER_KEY = "bonocode.sidebarTabOrder";
const PROJECT_RAIL_WIDTH_KEY = "bonocode.projectRailWidth";
const TRANSCRIPT_LAYOUT_KEY = "bonocode.transcriptLayout";
const TRANSCRIPT_ANCHOR_KEY = "bonocode.transcriptAnchor";
const CHAT_BACKGROUND_PATH_KEY = "bonocode.chatBackgroundPath";
const CHAT_BACKGROUND_OPACITY_KEY = "bonocode.chatBackgroundOpacity";
const CHAT_BACKGROUND_EMPTY_OPACITY_KEY = "bonocode.chatBackgroundEmptyOpacity";
const CHAT_BACKGROUND_SESSION_OPACITY_KEY =
  "bonocode.chatBackgroundSessionOpacity";
const CHAT_BACKGROUND_SCOPE_KEY = "bonocode.chatBackgroundScope";
const NEW_THREAD_BACKGROUND_EFFECT_KEY = "bonocode.newThreadBackgroundEffect";
const SHOW_EXCLUDED_FILES_KEY = "bonocode.showExcludedFiles";
let chatBackgroundRevision = Date.now();
let nativeGlassReady = false;
let glassFadeTimer: number | undefined;
let glassSyncGeneration = 0;

export const CHAT_BACKGROUND_PATH_CHANGE_EVENT =
  "bonocode:chat-background-path-change";

export type ColorScheme = "dark" | "light";
export type TranscriptLayout = "full" | "chat";
export type ChatBackgroundScope = "empty" | "all";
export type NewThreadBackgroundEffect =
  "none" | "dither" | "ascii" | "halftone" | "scanlines" | "gradient-blur";

export const NEW_THREAD_BACKGROUND_EFFECTS: readonly NewThreadBackgroundEffect[] =
  ["none", "dither", "ascii", "halftone", "scanlines", "gradient-blur"];

export const NEW_THREAD_BACKGROUND_EFFECT_DEFAULT: NewThreadBackgroundEffect =
  "none";

export const NEW_THREAD_BACKGROUND_EFFECT_LABELS: Record<
  NewThreadBackgroundEffect,
  string
> = {
  none: "None",
  dither: "Dither",
  ascii: "ASCII",
  halftone: "Halftone",
  scanlines: "Scanlines",
  "gradient-blur": "Haze",
};

export const NEW_THREAD_BACKGROUND_EFFECT_DESCRIPTIONS: Record<
  NewThreadBackgroundEffect,
  string
> = {
  none: "Shows the original artwork.",
  dither: "Rebuilds the artwork with a dithered color palette.",
  ascii: "Recreates the artwork with colored characters on black.",
  halftone: "Recreates the artwork with colored print dots on black.",
  scanlines: "Adds a pronounced horizontal display-line texture.",
  "gradient-blur": "Blurs and fades the artwork into the background below.",
};

/** Fired on `window` whenever the color scheme flips (detail: ColorScheme). */
export const SCHEME_CHANGE_EVENT = "bonocode:schemechange";

export const TRANSCRIPT_LAYOUT_DEFAULT: TranscriptLayout = "chat";

export const TRANSCRIPT_ANCHOR_DEFAULT = true;

/** Fired on `window` whenever prompt-to-top anchoring flips (detail: boolean). */
export const TRANSCRIPT_ANCHOR_CHANGE_EVENT = "bonocode:transcriptanchorchange";

/** Fired on `window` whenever the transcript layout flips (detail: TranscriptLayout). */
export const TRANSCRIPT_LAYOUT_CHANGE_EVENT = "bonocode:transcriptlayoutchange";

export const SHOW_EXCLUDED_FILES_DEFAULT = false;

/** Fired on `window` whenever the explorer excluded-files setting flips (detail: boolean). */
export const SHOW_EXCLUDED_FILES_CHANGE_EVENT =
  "bonocode:showexcludedfileschange";

export type SidebarTabId = "files" | "sessions";

const DEFAULT_SIDEBAR_TAB_ORDER: SidebarTabId[] = ["sessions", "files"];

export const PROJECT_RAIL_WIDTH_MIN = 180;
export const PROJECT_RAIL_WIDTH_MAX = 360;
export const PROJECT_RAIL_WIDTH_DEFAULT = 200;

export const CHAT_BACKGROUND_OPACITY_MIN = 0.05;
export const CHAT_BACKGROUND_OPACITY_MAX = 0.65;
export const CHAT_BACKGROUND_OPACITY_DEFAULT = 0.24;
export const CHAT_BACKGROUND_EMPTY_OPACITY_DEFAULT =
  CHAT_BACKGROUND_OPACITY_DEFAULT;
export const CHAT_BACKGROUND_SESSION_OPACITY_DEFAULT =
  CHAT_BACKGROUND_OPACITY_DEFAULT;
export const CHAT_BACKGROUND_SCOPE_DEFAULT: ChatBackgroundScope = "all";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function initAppearance() {
  document.documentElement.classList.toggle("is-mac", IS_MAC);
  applyChatBackground(loadChatBackgroundPath());
  applyChatBackgroundEmptyOpacity(loadChatBackgroundEmptyOpacity());
  applyChatBackgroundSessionOpacity(loadChatBackgroundSessionOpacity());
  applyChatBackgroundScope(loadChatBackgroundScope());
  void applyUiScale(loadUiScale());
}

export function isLightScheme(): boolean {
  return document.documentElement.classList.contains("theme-light");
}

export function applyColorScheme(scheme: ColorScheme): ColorScheme {
  const root = document.documentElement;
  // Every theme apply lands here, but only a flip changes the rendered chat
  // background. Re-rendering it drops chat-background-effect-ready, so doing
  // it on every theme-editor change made the background blink.
  const flipped =
    root.classList.contains("theme-light") !== (scheme === "light");
  root.classList.toggle("theme-light", scheme === "light");
  if (nativeGlassReady) syncNativeGlass(scheme);
  window.dispatchEvent(
    new CustomEvent<ColorScheme>(SCHEME_CHANGE_EVENT, { detail: scheme }),
  );
  const backgroundPath = loadChatBackgroundPath();
  if (
    flipped &&
    backgroundPath &&
    root.classList.contains("has-chat-background")
  ) {
    renderChatBackground(backgroundPath);
  }
  return scheme;
}

/** The page colour the native window sits behind while glass is off. */
function opaqueWindowBackground(): Rgb {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue("--color-background-base")
    .trim();
  return hexToRgb(isHexColor(value) ? value : "#171717");
}

/** How long the page takes to reach opaque, from the same token the CSS uses. */
function glassFadeMs(): number {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue("--motion-feedback-duration")
    .trim();
  const milliseconds = parseFloat(value) * (value.endsWith("ms") ? 1 : 1000);
  return Number.isFinite(milliseconds) ? Math.max(0, milliseconds) : 0;
}

/**
 * `has-native-glass` follows the window, not the platform: Linux can turn glass
 * off in dark mode too. Whichever side moves second has to wait for the other,
 * or one of them shows through the gap - so entering glass settles the window
 * first, and leaving it fades the page first. A call that a newer one has
 * overtaken is dropped rather than left to settle last.
 */
export function syncNativeGlass(scheme: ColorScheme) {
  const root = document.documentElement;
  // applyTheme sets glass-body before it calls in here, so this follows the
  // theme being applied even when it isn't the saved one yet.
  const enabled =
    scheme === "dark" && (!IS_LINUX || root.classList.contains("glass-body"));
  const generation = ++glassSyncGeneration;
  const setWindow = () =>
    invoke("set_window_glass_enabled", {
      enabled,
      background: opaqueWindowBackground(),
    }).catch(() => {});

  if (glassFadeTimer !== undefined) {
    window.clearTimeout(glassFadeTimer);
    glassFadeTimer = undefined;
  }

  if (enabled) {
    void setWindow().finally(() => {
      if (generation === glassSyncGeneration) {
        root.classList.add("has-native-glass");
      }
    });
    return;
  }

  root.classList.remove("has-native-glass");
  glassFadeTimer = window.setTimeout(() => {
    glassFadeTimer = undefined;
    void setWindow();
  }, glassFadeMs());
}

/** Applies native transparency once the opaque launch cover can be removed. */
export function activateWindowAppearance() {
  nativeGlassReady = true;
  syncNativeGlass(isLightScheme() ? "light" : "dark");
}

/** The theme's glass.blur, already validated as an integer from 1 to 64. */
export function applySidebarBlur(radius: number) {
  // Tests and the browser preview have no Tauri bridge to receive this.
  invoke("set_window_background_blur", { radius }).catch(() => {});
}

const chatBackgroundPath = defineSetting<string | null>({
  key: CHAT_BACKGROUND_PATH_KEY,
  default: null,
  parse: (raw) => raw?.trim() || null,
  serialize: (value) => value || null,
  event: CHAT_BACKGROUND_PATH_CHANGE_EVENT,
});

export const loadChatBackgroundPath = chatBackgroundPath.load;
export const saveChatBackgroundPath = chatBackgroundPath.save;
export const subscribeChatBackgroundPath = chatBackgroundPath.subscribe;

export function applyChatBackground(path: string | null) {
  const root = document.documentElement;
  root.classList.toggle("has-chat-background", !!path);
  if (!path) {
    clearPreparedNewThreadBackground();
    return null;
  }
  chatBackgroundRevision += 1;
  renderChatBackground(path);
  return path;
}

export function chatBackgroundSrc(path: string | null): string | null {
  return path ? `${convertFileSrc(path)}?v=${chatBackgroundRevision}` : null;
}

const newThreadBackgroundEffect = defineSetting<NewThreadBackgroundEffect>({
  key: NEW_THREAD_BACKGROUND_EFFECT_KEY,
  default: NEW_THREAD_BACKGROUND_EFFECT_DEFAULT,
  ...oneOf<NewThreadBackgroundEffect>(...NEW_THREAD_BACKGROUND_EFFECTS),
});

export const loadNewThreadBackgroundEffect = newThreadBackgroundEffect.load;
export const saveNewThreadBackgroundEffect = newThreadBackgroundEffect.save;

function renderChatBackground(
  path: string,
  effect = loadNewThreadBackgroundEffect(),
) {
  const src = chatBackgroundSrc(path);
  if (!src) return;
  void applyPreparedNewThreadBackground(
    `${path}?v=${chatBackgroundRevision}`,
    src,
    effect,
    isLightScheme(),
  );
}

export function applyNewThreadBackgroundEffect(
  effect: NewThreadBackgroundEffect,
) {
  const path = loadChatBackgroundPath();
  if (path) renderChatBackground(path, effect);
  return effect;
}

export function setNewThreadBackgroundEffect(
  effect: NewThreadBackgroundEffect,
) {
  saveNewThreadBackgroundEffect(effect);
  applyNewThreadBackgroundEffect(effect);
  window.dispatchEvent(new Event(CHAT_BACKGROUND_PATH_CHANGE_EVENT));
}

const chatBackgroundOpacityRange = clampedNumber(
  CHAT_BACKGROUND_OPACITY_MIN,
  CHAT_BACKGROUND_OPACITY_MAX,
);

/**
 * One surface's opacity. A missing or unreadable value falls back to the single
 * key that predates the per-surface split.
 */
function chatBackgroundOpacitySetting(key: string, fallback: number) {
  return defineSetting<number>({
    key,
    default: fallback,
    ...chatBackgroundOpacityRange,
    parse: (raw) =>
      chatBackgroundOpacityRange.parse(raw) ??
      chatBackgroundOpacityRange.parse(readStored(CHAT_BACKGROUND_OPACITY_KEY)),
  });
}

const chatBackgroundEmptyOpacity = chatBackgroundOpacitySetting(
  CHAT_BACKGROUND_EMPTY_OPACITY_KEY,
  CHAT_BACKGROUND_EMPTY_OPACITY_DEFAULT,
);
const chatBackgroundSessionOpacity = chatBackgroundOpacitySetting(
  CHAT_BACKGROUND_SESSION_OPACITY_KEY,
  CHAT_BACKGROUND_SESSION_OPACITY_DEFAULT,
);
/** Kept in step with the per-surface keys for anything still reading the old key. */
const chatBackgroundLegacyOpacity = defineSetting<number>({
  key: CHAT_BACKGROUND_OPACITY_KEY,
  default: CHAT_BACKGROUND_OPACITY_DEFAULT,
  ...chatBackgroundOpacityRange,
});

/** The empty-state opacity doubles as the general one. */
export const loadChatBackgroundOpacity = chatBackgroundEmptyOpacity.load;
export const loadChatBackgroundEmptyOpacity = chatBackgroundEmptyOpacity.load;
export const saveChatBackgroundEmptyOpacity = chatBackgroundEmptyOpacity.save;
export const loadChatBackgroundSessionOpacity =
  chatBackgroundSessionOpacity.load;
export const saveChatBackgroundSessionOpacity =
  chatBackgroundSessionOpacity.save;

export function saveChatBackgroundOpacity(value: number) {
  const next = clamp(
    value,
    CHAT_BACKGROUND_OPACITY_MIN,
    CHAT_BACKGROUND_OPACITY_MAX,
  );
  chatBackgroundEmptyOpacity.save(next);
  chatBackgroundSessionOpacity.save(next);
  chatBackgroundLegacyOpacity.save(next);
}

export function applyChatBackgroundOpacity(value: number) {
  const next = applyChatBackgroundEmptyOpacity(value);
  applyChatBackgroundSessionOpacity(next);
  return next;
}


function applyChatBackgroundOpacityValue(variable: string, value: number) {
  const next = clamp(
    value,
    CHAT_BACKGROUND_OPACITY_MIN,
    CHAT_BACKGROUND_OPACITY_MAX,
  );
  document.documentElement.style.setProperty(variable, String(next));
  return next;
}


export function applyChatBackgroundEmptyOpacity(value: number) {
  return applyChatBackgroundOpacityValue(
    "--chat-background-empty-opacity",
    value,
  );
}


export function applyChatBackgroundSessionOpacity(value: number) {
  return applyChatBackgroundOpacityValue(
    "--chat-background-session-opacity",
    value,
  );
}

const chatBackgroundScope = defineSetting<ChatBackgroundScope>({
  key: CHAT_BACKGROUND_SCOPE_KEY,
  default: CHAT_BACKGROUND_SCOPE_DEFAULT,
  ...oneOf<ChatBackgroundScope>("empty", "all"),
});

export const loadChatBackgroundScope = chatBackgroundScope.load;
export const saveChatBackgroundScope = chatBackgroundScope.save;

export function applyChatBackgroundScope(value: ChatBackgroundScope) {
  document.documentElement.classList.toggle(
    "chat-background-empty-only",
    value === "empty",
  );
  return value;
}

function isSidebarTabId(value: unknown): value is SidebarTabId {
  return value === "files" || value === "sessions";
}

const projectRailOpen = defineSetting<boolean>({
  key: PROJECT_RAIL_OPEN_KEY,
  default: true,
  ...flag(),
});

export const loadProjectRailOpen = projectRailOpen.load;
export const saveProjectRailOpen = projectRailOpen.save;

const sessionSidebarOpen = defineSetting<boolean>({
  key: SESSION_SIDEBAR_OPEN_KEY,
  default: true,
  ...flag(),
});

export const loadSessionSidebarOpen = sessionSidebarOpen.load;
export const saveSessionSidebarOpen = sessionSidebarOpen.save;

const sidebarTabOrder = defineSetting<SidebarTabId[]>({
  key: SIDEBAR_TAB_ORDER_KEY,
  default: DEFAULT_SIDEBAR_TAB_ORDER,
  parse: (raw) => {
    if (!raw) return undefined;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return undefined;
    const next = parsed.filter(isSidebarTabId);
    for (const id of DEFAULT_SIDEBAR_TAB_ORDER) {
      if (!next.includes(id)) next.push(id);
    }
    return next.length === DEFAULT_SIDEBAR_TAB_ORDER.length ? next : undefined;
  },
  serialize: (order) => JSON.stringify(order),
});

/** A fresh array on every call, so callers can change what they get back. */
export function loadSidebarTabOrder(): SidebarTabId[] {
  return [...sidebarTabOrder.load()];
}

export const saveSidebarTabOrder = sidebarTabOrder.save;

const projectRailWidth = defineSetting<number>({
  key: PROJECT_RAIL_WIDTH_KEY,
  default: PROJECT_RAIL_WIDTH_DEFAULT,
  ...clampedNumber(PROJECT_RAIL_WIDTH_MIN, PROJECT_RAIL_WIDTH_MAX, {
    round: true,
  }),
});

export const loadProjectRailWidth = projectRailWidth.load;
export const saveProjectRailWidth = projectRailWidth.save;

function isTranscriptLayout(value: unknown): value is TranscriptLayout {
  return value === "full" || value === "chat";
}

export const transcriptLayoutSetting = defineSetting<TranscriptLayout>({
  key: TRANSCRIPT_LAYOUT_KEY,
  default: TRANSCRIPT_LAYOUT_DEFAULT,
  ...oneOf<TranscriptLayout>("full", "chat"),
  normalize: (value) =>
    isTranscriptLayout(value) ? value : TRANSCRIPT_LAYOUT_DEFAULT,
  event: TRANSCRIPT_LAYOUT_CHANGE_EVENT,
});

export const loadTranscriptLayout = transcriptLayoutSetting.load;
export const saveTranscriptLayout = transcriptLayoutSetting.save;

export const transcriptAnchorSetting = defineSetting<boolean>({
  key: TRANSCRIPT_ANCHOR_KEY,
  default: TRANSCRIPT_ANCHOR_DEFAULT,
  ...flag(),
  event: TRANSCRIPT_ANCHOR_CHANGE_EVENT,
});

export const loadTranscriptAnchor = transcriptAnchorSetting.load;
export const saveTranscriptAnchor = transcriptAnchorSetting.save;

const showExcludedFiles = defineSetting<boolean>({
  key: SHOW_EXCLUDED_FILES_KEY,
  default: SHOW_EXCLUDED_FILES_DEFAULT,
  ...flag(),
  event: SHOW_EXCLUDED_FILES_CHANGE_EVENT,
});

export const loadShowExcludedFiles = showExcludedFiles.load;
export const saveShowExcludedFiles = showExcludedFiles.save;
export const subscribeShowExcludedFiles = showExcludedFiles.subscribe;
