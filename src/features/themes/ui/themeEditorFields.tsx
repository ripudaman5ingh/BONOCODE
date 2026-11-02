import { useEffect, useId, useState, type ReactNode } from "react";
import { isHexColor } from "../../../shared/lib/colorUtils";
import { SecondaryButton } from "../../../shared/ui/SecondaryButton";
import { Group, Row } from "../../settings/ui/settingsControls";

const TEXT_INPUT =
  "h-6 rounded-md border border-content/10 bg-transparent px-1.5 text-[11px] text-content outline-none focus:border-accent aria-[invalid=true]:border-danger/60";

/** "brightBlack" → "Bright black". */
export function keyLabel(key: string): string {
  const words = key.replace(/[A-Z]/g, (c) => ` ${c.toLowerCase()}`);
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Text the user is typing, kept apart from the theme until it is valid, so a
 * half-typed value never reaches the theme and never snaps back mid-edit.
 */
function useDraftText(value: string) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return [text, setText] as const;
}

export function ColorInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (hex: string) => void;
}) {
  const [text, setText] = useDraftText(value);
  return (
    <span className="flex items-center gap-2">
      <input
        type="color"
        aria-label={`${label} picker`}
        value={value}
        onChange={(event) => onChange(event.target.value.toLowerCase())}
        className="h-6 w-8 shrink-0 cursor-pointer rounded border border-content/10 bg-transparent p-0"
      />
      <input
        type="text"
        aria-label={label}
        aria-invalid={!isHexColor(text)}
        value={text}
        maxLength={7}
        spellCheck={false}
        onChange={(event) => {
          const next = event.target.value.trim();
          setText(next);
          if (isHexColor(next)) onChange(next.toLowerCase());
        }}
        onBlur={() => setText(value)}
        className={`${TEXT_INPUT} w-20 font-mono`}
      />
    </span>
  );
}

export function ColorRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (hex: string) => void;
}) {
  return (
    <Row label={label}>
      <ColorInput label={label} value={value} onChange={onChange} />
    </Row>
  );
}

export function FontRow({
  label,
  value,
  suggestions,
  onChange,
}: {
  label: string;
  value: string;
  suggestions: readonly string[];
  onChange: (fontFamily: string) => void;
}) {
  const [text, setText] = useDraftText(value);
  const listId = useId();
  return (
    <Row label={label} description="A CSS font-family list.">
      <input
        type="text"
        aria-label={label}
        aria-invalid={text.trim() === ""}
        list={listId}
        value={text}
        spellCheck={false}
        onChange={(event) => {
          setText(event.target.value);
          if (event.target.value.trim()) onChange(event.target.value);
        }}
        onBlur={() => setText(value)}
        className={`${TEXT_INPUT} w-56 max-w-full`}
      />
      <datalist id={listId}>
        {suggestions.map((font) => (
          <option key={font} value={font} />
        ))}
      </datalist>
    </Row>
  );
}

/** A Group whose rows stay hidden until it is opened. */
export function CollapsibleGroup({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Group
      title={title}
      description={description}
      action={
        <SecondaryButton aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? "Hide" : "Show"}
        </SecondaryButton>
      }
    >
      {open ? children : null}
    </Group>
  );
}
