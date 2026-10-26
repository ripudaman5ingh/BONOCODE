// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { applyHarnessEvents } from "../../../integrations/harness/core/apply";
import type { HarnessEvent } from "../../../integrations/harness/core/types";
import { syncDockBadge } from "../../notifications/model/dockBadge";
import { createLiveSessionStore } from "./liveSessions";
import type { Session } from "./session";

vi.mock("../../../integrations/harness/core/apply", () => ({
  applyHarnessEvents: vi.fn(),
}));
vi.mock("../../notifications/model/dockBadge", () => ({
  syncDockBadge: vi.fn(),
}));

type Applied = Session & { applied?: string[] };

const session = (id: string) => ({ id }) as Session;
const text = (value: string): HarnessEvent => ({
  type: "message.delta",
  text: value,
});
const approval: HarnessEvent = {
  type: "approval.requested",
  requestId: 1,
  title: "Run ls",
};
const appliedTypes = (value: Session) => (value as Applied).applied ?? [];

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  vi.mocked(applyHarnessEvents).mockImplementation(
    (value, events) =>
      ({
        ...value,
        applied: [...appliedTypes(value), ...events.map((e) => e.type)],
      }) as Session,
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it("creating a store schedules no timers and calls no listeners", () => {
  createLiveSessionStore([session("a")]);
  expect(vi.getTimerCount()).toBe(0);
  expect(syncDockBadge).not.toHaveBeenCalled();
});

it("set accepts a value or an updater, and updater calls compose", () => {
  const store = createLiveSessionStore([session("a")]);
  store.set([session("a"), session("b")]);
  expect(store.get().map((s) => s.id)).toEqual(["a", "b"]);
  store.set((prev) => [...prev, session("c")]);
  store.set((prev) => [...prev, session("d")]);
  expect(store.get().map((s) => s.id)).toEqual(["a", "b", "c", "d"]);
});

it("notifies once per new array, never for the same array, and unsubscribe stops calls", () => {
  const store = createLiveSessionStore([session("a")]);
  const listener = vi.fn();
  const unsubscribe = store.subscribe(listener);

  store.set(store.get());
  store.set((prev) => prev);
  expect(listener).not.toHaveBeenCalled();

  store.set([session("b")]);
  expect(listener).toHaveBeenCalledTimes(1);

  unsubscribe();
  store.set([session("c")]);
  expect(listener).toHaveBeenCalledTimes(1);
});

it("ref reads are fresh after an updater and writes update and notify", () => {
  const store = createLiveSessionStore([session("a")]);
  const listener = vi.fn();
  store.subscribe(listener);

  store.set((prev) => [...prev, session("b")]);
  expect(store.ref.current).toBe(store.get());

  store.ref.current = [session("c")];
  expect(store.get().map((s) => s.id)).toEqual(["c"]);
  expect(listener).toHaveBeenCalledTimes(2);
});

it("applies queued events for a session in order on flush and syncs the dock badge", () => {
  const store = createLiveSessionStore([session("a")]);
  store.enqueueHarnessEvent("a", text("1"));
  store.enqueueHarnessEvent("a", text("2"));
  expect(applyHarnessEvents).not.toHaveBeenCalled();

  vi.advanceTimersByTime(100);

  expect(applyHarnessEvents).toHaveBeenCalledTimes(1);
  expect(vi.mocked(applyHarnessEvents).mock.calls[0][1]).toEqual([
    text("1"),
    text("2"),
  ]);
  expect(store.get()[0]).toMatchObject({
    applied: ["message.delta", "message.delta"],
  });
  expect(syncDockBadge).toHaveBeenCalledWith(store.get());
});

it("approval events apply at once with the session's queued events, and other sessions keep theirs", () => {
  const store = createLiveSessionStore([session("a"), session("b")]);
  store.enqueueHarnessEvent("a", text("a1"));
  store.enqueueHarnessEvent("b", text("b1"));

  store.enqueueHarnessEvent("a", approval);

  expect(applyHarnessEvents).toHaveBeenCalledTimes(1);
  expect(vi.mocked(applyHarnessEvents).mock.calls[0][1]).toEqual([
    text("a1"),
    approval,
  ]);
  expect(store.get()[0]).toMatchObject({
    applied: ["message.delta", "approval.requested"],
  });

  vi.advanceTimersByTime(100);

  expect(applyHarnessEvents).toHaveBeenCalledTimes(2);
  expect(vi.mocked(applyHarnessEvents).mock.calls[1][1]).toEqual([text("b1")]);
});

it("the foreground probe picks the flush cadence: rAF when true, timeout when false", () => {
  const frames: FrameRequestCallback[] = [];
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
    frames.push(cb);
    return frames.length;
  });
  const store = createLiveSessionStore([session("a")]);

  const probe = vi.fn(() => true);
  store.setForegroundProbe(probe);
  store.enqueueHarnessEvent("a", text("1"));
  expect(probe).toHaveBeenCalledWith("a");
  expect(frames).toHaveLength(1);
  vi.advanceTimersByTime(200);
  expect(applyHarnessEvents).not.toHaveBeenCalled();
  frames[0](0);
  expect(applyHarnessEvents).toHaveBeenCalledTimes(1);

  store.setForegroundProbe(() => false);
  store.enqueueHarnessEvent("a", text("2"));
  expect(frames).toHaveLength(1);
  vi.advanceTimersByTime(99);
  expect(applyHarnessEvents).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(1);
  expect(applyHarnessEvents).toHaveBeenCalledTimes(2);
});

it("a foreground event promotes a pending background timer to the next frame", () => {
  const frames: FrameRequestCallback[] = [];
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
    frames.push(cb);
    return frames.length;
  });
  const store = createLiveSessionStore([session("a")]);

  store.enqueueHarnessEvent("a", text("1"));
  store.setForegroundProbe(() => true);
  store.enqueueHarnessEvent("a", text("2"));
  expect(frames).toHaveLength(1);

  vi.advanceTimersByTime(200);
  expect(applyHarnessEvents).not.toHaveBeenCalled();
  frames[0](0);
  expect(vi.mocked(applyHarnessEvents).mock.calls[0][1]).toEqual([
    text("1"),
    text("2"),
  ]);
});

it("dispose cancels a pending flush, and the store keeps working afterwards", () => {
  const store = createLiveSessionStore([session("a")]);
  store.enqueueHarnessEvent("a", text("1"));

  store.dispose();
  vi.advanceTimersByTime(200);
  expect(applyHarnessEvents).not.toHaveBeenCalled();
  expect(store.get()[0]).toEqual(session("a"));

  store.enqueueHarnessEvent("a", text("2"));
  vi.advanceTimersByTime(100);
  expect(vi.mocked(applyHarnessEvents).mock.calls[0][1]).toEqual([
    text("1"),
    text("2"),
  ]);

  store.set([session("b")]);
  expect(store.get().map((s) => s.id)).toEqual(["b"]);
});

it("turnGen keeps the same Map across reads and writes", () => {
  const store = createLiveSessionStore([session("a")]);
  const map = store.turnGen.current;
  store.turnGen.current.set("a", 1);
  expect(store.turnGen.current).toBe(map);
  expect(store.turnGen.current.get("a")).toBe(1);
});
