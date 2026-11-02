import { useCallback, useEffect, useRef, useState } from "react";
import { Modal } from "../../../shared/ui/Modal";
import { SecondaryButton } from "../../../shared/ui/SecondaryButton";
import {
  Group,
  Row,
  Segmented,
  Slider,
  Toggle,
} from "../../settings/ui/settingsControls";
import {
  activeTheme,
  deleteUserTheme,
  duplicateTheme,
  isBuiltinTheme,
  previewTheme,
  renameUserTheme,
  saveUserTheme,
  setTheme,
  useThemes,
} from "../model/themeEngine";
import {
  parseTheme,
  STATUS_KEYS,
  SYNTAX_KEYS,
  TERMINAL_KEYS,
  themeWarnings,
  type Theme,
  type ThemeColors,
  type ThemeScheme,
  type ThemeSelection,
} from "../model/themeFormat";
import {
  CollapsibleGroup,
  ColorInput,
  ColorRow,
  FontRow,
  keyLabel,
} from "./themeEditorFields";

export const THEME_SAVE_DELAY_MS = 300;

type ColorKey = Exclude<keyof ThemeColors, "userAccent">;

const SYNTAX_LABELS: Record<(typeof SYNTAX_KEYS)[number], string> = {
  keyword: "Keywords",
  callable: "Functions",
  string: "Strings",
  type: "Types",
  number: "Numbers",
  comment: "Comments",
  property: "Properties",
  meta: "Meta",
  invalid: "Invalid code",
};

const SANS_FONTS = [
  'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  "Inter, system-ui, sans-serif",
  '"SF Pro Text", system-ui, sans-serif',
  '"Segoe UI", system-ui, sans-serif',
  '"Helvetica Neue", Arial, sans-serif',
] as const;

const MONO_FONTS = [
  "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  '"JetBrains Mono", ui-monospace, monospace',
  '"Fira Code", ui-monospace, monospace',
  '"Cascadia Code", ui-monospace, monospace',
  '"Source Code Pro", ui-monospace, monospace',
  "Menlo, Monaco, monospace",
] as const;

const SELECTION_LABELS: Record<keyof ThemeSelection, string> = {
  subtle: "Subtle selection",
  base: "Selection",
  strong: "Strong selection",
  hover: "Hover",
  emphasis: "Emphasis",
};

/** Edits the active theme. Built-ins are read-only and offer a copy instead. */
export function ThemeEditor() {
  const themeId = activeTheme.use();
  const theme = useThemes().find((candidate) => candidate.id === themeId);
  if (!theme) return null;
  if (isBuiltinTheme(theme.id)) return <BuiltinThemeNote theme={theme} />;
  // Keyed by id, so opening another theme takes a fresh undo snapshot.
  return <UserThemeEditor key={theme.id} saved={theme} />;
}

function BuiltinThemeNote({ theme }: { theme: Theme }) {
  return (
    <Group title="Theme editor">
      <Row
        id="theme-editor"
        label={theme.name}
        description="Built-in themes are read-only. Duplicate this one to change its colors, fonts and glass."
      >
        <SecondaryButton
          onClick={() => {
            const copy = duplicateTheme(theme.id);
            if (copy) setTheme(copy.id);
          }}
        >
          Duplicate to customize
        </SecondaryButton>
      </Row>
    </Group>
  );
}

function UserThemeEditor({ saved }: { saved: Theme }) {
  const [snapshot] = useState(saved);
  const [draft, setDraft] = useState(saved);
  const latest = useRef(saved);
  const pending = useRef<{ theme: Theme; timer: number } | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const cancelSave = useCallback(() => {
    if (pending.current) window.clearTimeout(pending.current.timer);
    pending.current = null;
  }, []);

  const flushSave = useCallback(() => {
    const queued = pending.current;
    cancelSave();
    if (queued) saveUserTheme(queued.theme);
  }, [cancelSave]);

  // Leaving the editor keeps the last edit instead of dropping it.
  useEffect(() => flushSave, [flushSave]);

  /** Every edit: validate, preview at once, save once the edits pause. */
  const edit = useCallback(
    (change: (theme: Theme) => Theme) => {
      const result = parseTheme(change(latest.current));
      if ("errors" in result) return;
      const next = result.theme;
      latest.current = next;
      setDraft(next);
      previewTheme(next);
      cancelSave();
      pending.current = {
        theme: next,
        timer: window.setTimeout(() => {
          pending.current = null;
          saveUserTheme(next);
        }, THEME_SAVE_DELAY_MS),
      };
    },
    [cancelSave],
  );

  const setColor = (key: ColorKey) => (value: string) =>
    edit((theme) => ({ ...theme, colors: { ...theme.colors, [key]: value } }));
  const setUserAccent = (value: string | null) =>
    edit((theme) => {
      const colors = { ...theme.colors };
      if (value == null) delete colors.userAccent;
      else colors.userAccent = value;
      return { ...theme, colors };
    });

  const rename = (name: string) => {
    setRenaming(false);
    if (!name.trim() || name.trim() === latest.current.name) return;
    flushSave();
    renameUserTheme(latest.current.id, name);
    latest.current = { ...latest.current, name: name.trim() };
    setDraft(latest.current);
  };

  const duplicate = () => {
    flushSave();
    const copy = duplicateTheme(latest.current.id);
    if (copy) setTheme(copy.id);
  };

  const remove = () => {
    // A pending save would bring the deleted theme back.
    cancelSave();
    setConfirmingDelete(false);
    deleteUserTheme(latest.current.id);
  };

  const warnings = themeWarnings(draft);
  const changed = JSON.stringify(draft) !== JSON.stringify(snapshot);
  const { colors, fonts, glass } = draft;

  return (
    <>
      <Group title="Theme editor">
        <Row
          id="theme-editor"
          label={
            renaming ? (
              <RenameInput name={draft.name} onDone={rename} />
            ) : (
              draft.name
            )
          }
          description="Changes apply as you make them and save on their own."
        >
          <SecondaryButton onClick={() => setRenaming(true)}>Rename</SecondaryButton>
          <SecondaryButton onClick={duplicate}>Duplicate</SecondaryButton>
          <SecondaryButton disabled={!changed} onClick={() => edit(() => snapshot)}>
            Undo changes
          </SecondaryButton>
          <SecondaryButton danger onClick={() => setConfirmingDelete(true)}>
            Delete
          </SecondaryButton>
        </Row>
        {warnings.length > 0 ? (
          <ul
            aria-label="Contrast warnings"
            className="flex flex-col gap-1 px-4 py-3 text-[12px] text-warning"
          >
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        ) : null}
      </Group>

      <Group title="Basics">
        <Row label="Scheme" description="Picks the light or dark variants of the interface.">
          <Segmented<ThemeScheme>
            label="Scheme"
            value={draft.scheme}
            options={[
              { value: "dark", label: "Dark" },
              { value: "light", label: "Light" },
            ]}
            onChange={(scheme) => edit((theme) => ({ ...theme, scheme }))}
          />
        </Row>
        <ColorRow label="Background" value={colors.background} onChange={setColor("background")} />
        <ColorRow label="Text" value={colors.foreground} onChange={setColor("foreground")} />
        <ColorRow label="Bold text" value={colors.strong} onChange={setColor("strong")} />
        <ColorRow label="Accent" value={colors.accent} onChange={setColor("accent")} />
        <Row
          label="Message bubble color"
          description="Your messages and primary buttons. Off keeps them neutral."
        >
          {colors.userAccent ? (
            <ColorInput
              label="Message bubble color"
              value={colors.userAccent}
              onChange={setUserAccent}
            />
          ) : null}
          <Toggle
            label="Message bubble color"
            on={colors.userAccent != null}
            onChange={(on) => setUserAccent(on ? colors.accent : null)}
          />
        </Row>
        <ColorRow label="Links" value={colors.link} onChange={setColor("link")} />
        <ColorRow label="Search match" value={colors.searchMatch} onChange={setColor("searchMatch")} />
      </Group>

      <Group title="Fonts">
        <FontRow
          label="UI font"
          value={fonts.sans}
          suggestions={SANS_FONTS}
          onChange={(sans) => edit((theme) => ({ ...theme, fonts: { ...theme.fonts, sans } }))}
        />
        <FontRow
          label="Code font"
          value={fonts.mono}
          suggestions={MONO_FONTS}
          onChange={(mono) => edit((theme) => ({ ...theme, fonts: { ...theme.fonts, mono } }))}
        />
        <Row label="Code size" description="The editor and the terminal.">
          <Slider
            label="Code size"
            value={fonts.codeSize}
            display={`${fonts.codeSize}px`}
            min={10}
            max={24}
            onChange={(codeSize) =>
              edit((theme) => ({ ...theme, fonts: { ...theme.fonts, codeSize } }))
            }
          />
        </Row>
      </Group>

      <Group
        title="Glass"
        description="How much of the desktop shows through. It applies to dark themes only; light themes keep an opaque window."
      >
        <PercentRow
          label="Sidebar opacity"
          value={glass.sidebarOpacity}
          onChange={(sidebarOpacity) =>
            edit((theme) => ({ ...theme, glass: { ...theme.glass, sidebarOpacity } }))
          }
        />
        <PercentRow
          label="Pane opacity"
          description="100% keeps the main pane opaque."
          value={glass.paneOpacity}
          onChange={(paneOpacity) =>
            edit((theme) => ({ ...theme, glass: { ...theme.glass, paneOpacity } }))
          }
        />
        <Row label="Blur" description="Costs more to composite the higher it goes.">
          <Slider
            label="Blur"
            value={glass.blur}
            display={String(glass.blur)}
            min={1}
            max={64}
            onChange={(blur) => edit((theme) => ({ ...theme, glass: { ...theme.glass, blur } }))}
          />
        </Row>
      </Group>

      <CollapsibleGroup title="Status" description="Errors, additions, warnings, notices and merged items.">
        {STATUS_KEYS.map((key) => (
          <ColorRow
            key={key}
            label={keyLabel(key)}
            value={draft.status[key]}
            onChange={(value) =>
              edit((theme) => ({ ...theme, status: { ...theme.status, [key]: value } }))
            }
          />
        ))}
      </CollapsibleGroup>

      <CollapsibleGroup title="Code" description="The editor, diffs and code blocks in chat.">
        {SYNTAX_KEYS.map((key) => (
          <ColorRow
            key={key}
            label={SYNTAX_LABELS[key]}
            value={draft.syntax[key]}
            onChange={(value) =>
              edit((theme) => ({ ...theme, syntax: { ...theme.syntax, [key]: value } }))
            }
          />
        ))}
      </CollapsibleGroup>

      <CollapsibleGroup title="Terminal" description="The 16 ANSI colors.">
        {TERMINAL_KEYS.map((key) => (
          <ColorRow
            key={key}
            label={keyLabel(key)}
            value={draft.terminal[key]}
            onChange={(value) =>
              edit((theme) => ({ ...theme, terminal: { ...theme.terminal, [key]: value } }))
            }
          />
        ))}
      </CollapsibleGroup>

      <CollapsibleGroup title="More" description="Skill and mention chips, headings, and selection fills.">
        <ColorRow label="Skills" value={colors.skill} onChange={setColor("skill")} />
        <ColorRow label="Mentions" value={colors.mention} onChange={setColor("mention")} />
        <ColorRow label="Headings" value={colors.heading} onChange={setColor("heading")} />
        {(Object.keys(SELECTION_LABELS) as (keyof ThemeSelection)[]).map((key) => (
          <Row key={key} label={SELECTION_LABELS[key]}>
            <Slider
              label={SELECTION_LABELS[key]}
              value={draft.selection[key]}
              display={`${draft.selection[key]}%`}
              min={0}
              max={40}
              onChange={(value) =>
                edit((theme) => ({ ...theme, selection: { ...theme.selection, [key]: value } }))
              }
            />
          </Row>
        ))}
      </CollapsibleGroup>

      {confirmingDelete ? (
        <Modal title="Delete theme?" size="sm" onClose={() => setConfirmingDelete(false)}>
          <div className="flex flex-col gap-4 p-4 text-[12px]">
            <p>“{draft.name}” will be permanently deleted. Bonocode Dark takes its place.</p>
            <div className="flex justify-end gap-2">
              <SecondaryButton onClick={() => setConfirmingDelete(false)}>Cancel</SecondaryButton>
              <SecondaryButton danger onClick={remove}>
                Delete theme
              </SecondaryButton>
            </div>
          </div>
        </Modal>
      ) : null}
    </>
  );
}

function PercentRow({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description?: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const percent = Math.round(value * 100);
  return (
    <Row label={label} description={description}>
      <Slider
        label={label}
        value={percent}
        display={`${percent}%`}
        min={15}
        max={100}
        onChange={(next) => onChange(next / 100)}
      />
    </Row>
  );
}

function RenameInput({
  name,
  onDone,
}: {
  name: string;
  onDone: (name: string) => void;
}) {
  const [text, setText] = useState(name);
  return (
    <input
      type="text"
      aria-label="Theme name"
      autoFocus
      value={text}
      onChange={(event) => setText(event.target.value)}
      onBlur={() => onDone(text)}
      onKeyDown={(event) => {
        if (event.key === "Enter") onDone(text);
        if (event.key === "Escape") onDone(name);
      }}
      className="h-6 w-56 max-w-full rounded-md border border-content/10 bg-transparent px-1.5 text-[13px] font-medium text-content outline-none focus:border-accent"
    />
  );
}
