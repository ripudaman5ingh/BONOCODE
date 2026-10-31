// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createPersistThrottle } from "./persistThrottle";

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

it("keeps flushing while schedule() is called every frame", () => {
  const flush = vi.fn();
  const throttle = createPersistThrottle(650, flush);
  for (let elapsed = 0; elapsed < 2000; elapsed += 16) {
    throttle.schedule();
    vi.advanceTimersByTime(16);
  }
  expect(flush).toHaveBeenCalledTimes(3);
});

it("flushes once, 650 ms after a single schedule()", () => {
  const flush = vi.fn();
  const throttle = createPersistThrottle(650, flush);
  throttle.schedule();
  vi.advanceTimersByTime(649);
  expect(flush).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(flush).toHaveBeenCalledTimes(1);
});

it("cancel() drops the pending flush and schedule() works again afterwards", () => {
  const flush = vi.fn();
  const throttle = createPersistThrottle(650, flush);
  throttle.schedule();
  throttle.cancel();
  vi.advanceTimersByTime(1000);
  expect(flush).not.toHaveBeenCalled();
  throttle.schedule();
  vi.advanceTimersByTime(650);
  expect(flush).toHaveBeenCalledTimes(1);
});
