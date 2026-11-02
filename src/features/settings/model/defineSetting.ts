import { useSyncExternalStore } from "react";

export type SettingOptions<T> = {
  key: string;
  default: T;
  /** Turns the stored string into a value. `undefined` (or a throw) means "use the default". */
  parse: (raw: string | null) => T | undefined;
  /** Stored form. `null` removes the key. Defaults to `String(value)`. */
  serialize?: (value: T) => string | null;
  /** Applied before the write and to the event detail. */
  normalize?: (value: T) => T;
  /** Window event that save() dispatches with `{ detail }`. */
  event?: string;
  /** With `event`, subscribers also refresh on `storage` events for this key from other windows. */
  crossWindow?: boolean;
};

export type Setting<T> = {
  readonly key: string;
  readonly default: T;
  load: () => T;
  save: (value: T) => void;
};

export type EventSetting<T> = Setting<T> & {
  subscribe: (onStoreChange: () => void) => () => void;
  /** React hook. `T` must be a primitive so the snapshot is stable. */
  use: () => T;
};

/**
 * One localStorage-backed setting: owns the key, the stored format, the default
 * fallback and, when `event` is set, the window event that save() announces.
 */
export function defineSetting<T>(
  options: SettingOptions<T> & { event: string },
): EventSetting<T>;
export function defineSetting<T>(
  options: SettingOptions<T> & { event?: undefined },
): Setting<T>;
export function defineSetting<T>(
  options: SettingOptions<T>,
): Setting<T> | EventSetting<T> {
  const { key, event, crossWindow = false } = options;
  const serialize = options.serialize ?? ((value: T) => String(value));
  const normalize = options.normalize ?? ((value: T) => value);

  const load = (): T => {
    try {
      const parsed = options.parse(localStorage.getItem(key));
      return parsed === undefined ? options.default : parsed;
    } catch {
      return options.default;
    }
  };

  const save = (value: T) => {
    const next = normalize(value);
    try {
      const stored = serialize(next);
      if (stored == null) localStorage.removeItem(key);
      else localStorage.setItem(key, stored);
    } catch {
      // private mode / quota: listeners still hear about the change.
    }
    if (event !== undefined && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(event, { detail: next }));
    }
  };

  const setting: Setting<T> = { key, default: options.default, load, save };
  if (event === undefined) return setting;

  const subscribe = (onStoreChange: () => void) => {
    if (typeof window === "undefined") return () => {};
    const onStorage = (storageEvent: StorageEvent) => {
      if (storageEvent.key === key) onStoreChange();
    };
    window.addEventListener(event, onStoreChange);
    if (crossWindow) window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(event, onStoreChange);
      if (crossWindow) window.removeEventListener("storage", onStorage);
    };
  };
  // The server snapshot is the same read: server renders have no events to wait for.
  const use = () => useSyncExternalStore(subscribe, load, load);

  return { ...setting, subscribe, use };
}

/** Raw stored string, or null when the key is missing or storage throws. */
export function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Booleans stored as "1" / "0". Reads "1" or "true" as true, any other string as false. */
export function flag(): Required<
  Pick<SettingOptions<boolean>, "parse" | "serialize">
> {
  return {
    parse: (raw) => (raw == null ? undefined : raw === "1" || raw === "true"),
    serialize: (value) => (value ? "1" : "0"),
  };
}

/** One of a fixed set of strings. Anything else reads as "use the default". */
export function oneOf<T extends string>(
  ...values: readonly T[]
): Pick<SettingOptions<T>, "parse"> {
  return { parse: (raw) => values.find((value) => value === raw) };
}

/** Finite numbers clamped to [min, max]; optionally rounded to an integer. */
export function clampedNumber(
  min: number,
  max: number,
  options: { round?: boolean } = {},
): Required<Pick<SettingOptions<number>, "parse" | "normalize">> {
  const clamp = (value: number) => {
    const clamped = Math.min(max, Math.max(min, value));
    return options.round ? Math.round(clamped) : clamped;
  };
  return {
    parse: (raw) => {
      if (raw == null) return undefined;
      const parsed = Number(raw);
      return Number.isFinite(parsed) ? clamp(parsed) : undefined;
    },
    normalize: clamp,
  };
}
