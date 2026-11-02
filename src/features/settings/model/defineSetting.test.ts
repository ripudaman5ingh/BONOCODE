// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clampedNumber,
  defineSetting,
  flag,
  oneOf,
  readStored,
} from "./defineSetting";

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

let store: Storage;

beforeEach(() => {
  store = memoryStorage();
  vi.stubGlobal("localStorage", store);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const plain = () =>
  defineSetting<string>({
    key: "test.plain",
    default: "a",
    parse: (raw) => raw ?? undefined,
  });

describe("load", () => {
  it("returns the default for a missing key and for parse returning undefined", () => {
    const setting = defineSetting<string>({
      key: "test.k",
      default: "fallback",
      parse: (raw) => (raw === "ok" ? raw : undefined),
    });
    expect(setting.load()).toBe("fallback");
    store.setItem("test.k", "nope");
    expect(setting.load()).toBe("fallback");
    store.setItem("test.k", "ok");
    expect(setting.load()).toBe("ok");
  });

  it("keeps a parsed null instead of replacing it with the default", () => {
    const setting = defineSetting<string | null>({
      key: "test.null",
      default: "d",
      parse: () => null,
    });
    expect(setting.load()).toBeNull();
  });

  it("returns the default when parse throws", () => {
    const setting = defineSetting<number>({
      key: "test.throws",
      default: 7,
      parse: () => {
        throw new SyntaxError("bad json");
      },
    });
    store.setItem("test.throws", "{");
    expect(setting.load()).toBe(7);
  });

  it("returns the default when storage throws", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("denied");
      },
    });
    expect(plain().load()).toBe("a");
  });

  it("hands parse null for a missing key", () => {
    const parse = vi.fn(() => undefined);
    defineSetting<string>({ key: "test.missing", default: "x", parse }).load();
    expect(parse).toHaveBeenCalledWith(null);
  });
});

describe("save", () => {
  it("writes String(value) by default and removes the key for null", () => {
    const setting = defineSetting<number | null>({
      key: "test.num",
      default: null,
      parse: () => undefined,
      serialize: (value) => (value == null ? null : String(value)),
    });
    setting.save(3);
    expect(store.getItem("test.num")).toBe("3");
    setting.save(null);
    expect(store.getItem("test.num")).toBeNull();
  });

  it("applies normalize before writing", () => {
    const setting = defineSetting<number>({
      key: "test.norm",
      default: 1,
      parse: () => undefined,
      normalize: (value) => Math.min(10, value),
    });
    setting.save(99);
    expect(store.getItem("test.norm")).toBe("10");
  });

  it("dispatches a CustomEvent with the normalized detail only when event is set", () => {
    const listener = vi.fn();
    window.addEventListener("test:changed", listener);
    const withEvent = defineSetting<number>({
      key: "test.evt",
      default: 1,
      parse: () => undefined,
      normalize: (value) => Math.min(10, value),
      event: "test:changed",
    });
    withEvent.save(50);
    expect(listener).toHaveBeenCalledTimes(1);
    const event = listener.mock.calls[0][0] as CustomEvent<number>;
    expect(event.detail).toBe(10);

    plain().save("z");
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener("test:changed", listener);
  });

  it("still dispatches when the write throws", () => {
    vi.stubGlobal("localStorage", {
      setItem: () => {
        throw new Error("quota");
      },
    });
    const listener = vi.fn();
    window.addEventListener("test:quota", listener);
    defineSetting<boolean>({
      key: "test.quota",
      default: false,
      ...flag(),
      event: "test:quota",
    }).save(true);
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener("test:quota", listener);
  });

  it("does not dispatch when there is no window", () => {
    vi.stubGlobal("window", undefined);
    expect(() =>
      defineSetting<boolean>({
        key: "test.nowindow",
        default: false,
        ...flag(),
        event: "test:nowindow",
      }).save(true),
    ).not.toThrow();
    expect(store.getItem("test.nowindow")).toBe("1");
  });
});

describe("subscribe", () => {
  it("is absent without an event", () => {
    const setting = plain();
    expect("subscribe" in setting).toBe(false);
    expect("use" in setting).toBe(false);
  });

  it("fires on its event until unsubscribed", () => {
    const setting = defineSetting<string>({
      key: "test.sub",
      default: "a",
      parse: (raw) => raw ?? undefined,
      event: "test:sub",
    });
    const onChange = vi.fn();
    const unsubscribe = setting.subscribe(onChange);
    setting.save("b");
    expect(onChange).toHaveBeenCalledTimes(1);
    unsubscribe();
    setting.save("c");
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("refreshes on storage events for its own key only when crossWindow is set", () => {
    const storageEvent = (key: string) =>
      Object.assign(new Event("storage"), { key });

    const local = defineSetting<string>({
      key: "test.local",
      default: "a",
      parse: (raw) => raw ?? undefined,
      event: "test:local",
    });
    const localChange = vi.fn();
    const stopLocal = local.subscribe(localChange);
    window.dispatchEvent(storageEvent("test.local"));
    expect(localChange).not.toHaveBeenCalled();
    stopLocal();

    const shared = defineSetting<string>({
      key: "test.shared",
      default: "a",
      parse: (raw) => raw ?? undefined,
      event: "test:shared",
      crossWindow: true,
    });
    const sharedChange = vi.fn();
    const stopShared = shared.subscribe(sharedChange);
    window.dispatchEvent(storageEvent("test.shared"));
    expect(sharedChange).toHaveBeenCalledTimes(1);
    window.dispatchEvent(storageEvent("test.other"));
    expect(sharedChange).toHaveBeenCalledTimes(1);
    stopShared();
    window.dispatchEvent(storageEvent("test.shared"));
    expect(sharedChange).toHaveBeenCalledTimes(1);
  });
});

describe("use", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = document.createElement("div");
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
  });

  it("re-reads storage when the event fires", async () => {
    const setting = defineSetting<string>({
      key: "test.hook",
      default: "first",
      parse: (raw) => raw ?? undefined,
      event: "test:hook",
    });
    const seen: string[] = [];
    function Probe(props: { useValue: () => string }) {
      seen.push(props.useValue());
      return null;
    }

    await act(async () => {
      root.render(createElement(Probe, { useValue: setting.use }));
    });
    expect(seen.at(-1)).toBe("first");

    await act(async () => {
      store.setItem("test.hook", "second");
      setting.save("second");
    });
    expect(seen.at(-1)).toBe("second");
  });
});

describe("use during server rendering", () => {
  it("renders the stored value with react-dom/server", () => {
    store.setItem("test.ssr", "stored");
    const setting = defineSetting<string>({
      key: "test.ssr",
      default: "fallback",
      parse: (raw) => raw ?? undefined,
      event: "test:ssr",
    });
    function Probe(props: { useValue: () => string }) {
      return createElement("span", null, props.useValue());
    }
    expect(
      renderToStaticMarkup(createElement(Probe, { useValue: setting.use })),
    ).toBe("<span>stored</span>");
  });
});

describe("readStored", () => {
  it("returns the raw string, or null when storage throws", () => {
    store.setItem("test.raw", "  x ");
    expect(readStored("test.raw")).toBe("  x ");
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("denied");
      },
    });
    expect(readStored("test.raw")).toBeNull();
  });
});

describe("codecs", () => {
  it("flag reads 1 and true as on and writes 1 or 0", () => {
    const parse = flag().parse;
    expect(parse(null)).toBeUndefined();
    expect(parse("1")).toBe(true);
    expect(parse("true")).toBe(true);
    expect(parse("0")).toBe(false);
    expect(parse("yes")).toBe(false);
    const serialize = flag().serialize;
    expect(serialize(true)).toBe("1");
    expect(serialize(false)).toBe("0");
  });

  it("oneOf returns only the listed values", () => {
    const { parse } = oneOf("a", "b");
    expect(parse("b")).toBe("b");
    expect(parse("c")).toBeUndefined();
    expect(parse(null)).toBeUndefined();
  });

  it("clampedNumber clamps, optionally rounds, and ignores non-numbers", () => {
    const plainCodec = clampedNumber(0, 1);
    expect(plainCodec.parse("0.5555")).toBe(0.5555);
    expect(plainCodec.parse("2")).toBe(1);
    expect(plainCodec.parse("abc")).toBeUndefined();
    expect(plainCodec.parse(null)).toBeUndefined();
    expect(plainCodec.normalize(-3)).toBe(0);

    const rounded = clampedNumber(0, 10, { round: true });
    expect(rounded.parse("2.6")).toBe(3);
    expect(rounded.normalize(20.4)).toBe(10);
  });
});
