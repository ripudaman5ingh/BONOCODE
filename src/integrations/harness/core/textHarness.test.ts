import { afterEach, describe, expect, it, vi } from "vitest";
import type { HarnessId } from "../../../features/sessions/model/session";
import { setHarnessAvailability, type HarnessAvailability } from "./availabilityState";
import { pickTextHarness } from "./textHarness";
import { registerHarness, type HarnessAdapter } from "./registry";
import type { SendTurnInput, SteerTurnInput } from "./types";

function stub(id: HarnessId, extra: Partial<HarnessAdapter> = {}): HarnessAdapter {
  return {
    id,
    live: true,
    async sendTurn(_input: SendTurnInput) {},
    async steerTurn(_input: SteerTurnInput) {},
    async cancelTurn() {},
    respondApproval() {},
    async stopSession() {},
    async forgetSession() {},
    bindSession() {},
    ...extra,
  };
}

function available(...ids: HarnessId[]): void {
  const all = Object.fromEntries(
    ["claude", "codex", "cursor", "grok", "opencode", "pi", "omp", "fx", "hermes", "antigravity"].map(
      (id) => [id, ids.includes(id as HarnessId)],
    ),
  ) as HarnessAvailability;
  setHarnessAvailability(all);
}

afterEach(() => {
  available();
  vi.restoreAllMocks();
});

describe("pickTextHarness", () => {
  it("keeps a text-capable preferred harness over other available ones", () => {
    registerHarness(stub("claude", { runTextPrompt: vi.fn() }));
    registerHarness(stub("pi", { runTextPrompt: vi.fn() }));
    available("claude", "pi");

    expect(pickTextHarness("pi")).toBe("pi");
  });

  it("falls back to the first available text-capable harness", () => {
    registerHarness(stub("claude", { runTextPrompt: vi.fn() }));
    registerHarness(stub("pi", { runTextPrompt: vi.fn() }));
    registerHarness(stub("codex"));
    available("claude", "pi", "codex");

    expect(pickTextHarness("codex")).toBe("claude");
  });

  it("skips available harnesses that cannot run text prompts", () => {
    registerHarness(stub("cursor"));
    registerHarness(stub("pi", { runTextPrompt: vi.fn() }));
    available("cursor", "pi");

    expect(pickTextHarness("cursor")).toBe("pi");
  });

  it("returns the preferred harness when none is available, so the caller reports it", () => {
    registerHarness(stub("pi", { runTextPrompt: vi.fn() }));

    expect(pickTextHarness("pi")).toBe("pi");
    expect(pickTextHarness()).toBe("claude");
  });
});
