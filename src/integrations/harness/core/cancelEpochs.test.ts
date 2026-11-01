import { describe, expect, it } from "vitest";
import { createCancelEpochs } from "./cancelEpochs";

describe("createCancelEpochs", () => {
  it("does not cancel a send that starts after a cancel with nothing in flight", () => {
    const epochs = createCancelEpochs();
    epochs.cancel("s1");
    expect(epochs.watch("s1")()).toBe(false);
  });

  it("cancels a send that was watching when cancel arrives", () => {
    const epochs = createCancelEpochs();
    const cancelled = epochs.watch("s1");
    epochs.cancel("s1");
    expect(cancelled()).toBe(true);
  });

  it("keeps sessions independent", () => {
    const epochs = createCancelEpochs();
    const other = epochs.watch("s2");
    const cancelled = epochs.watch("s1");
    epochs.cancel("s1");
    expect(cancelled()).toBe(true);
    expect(other()).toBe(false);
  });

  it("clear forgets earlier cancels", () => {
    const epochs = createCancelEpochs();
    epochs.cancel("s1");
    epochs.clear();
    expect(epochs.watch("s1")()).toBe(false);
  });
});
