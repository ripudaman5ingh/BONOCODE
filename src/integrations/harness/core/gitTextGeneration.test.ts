import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  gitRangeContext,
  gitStagedContext,
} from "../../../platform/tauri/fs";
import {
  generateBranchNameWith,
  generateCommitMessageWith,
  generatePrContentWith,
} from "./gitTextGeneration";
import type { TextPromptInput } from "./registry";

vi.mock("../../../platform/tauri/fs", () => ({
  gitStagedContext: vi.fn(),
  gitRangeContext: vi.fn(),
}));

const staged = {
  branch: "feature/x",
  summary: "M change.ts",
  patch: "+const x = 1;",
};

const range = {
  base: "main",
  head: "feature/x",
  commitSummary: "Add x\n\nWires x into the panel",
  diffSummary: "1 file changed",
  diffPatch: "+const x = 1;",
};

beforeEach(() => {
  vi.mocked(gitStagedContext).mockResolvedValue(staged);
  vi.mocked(gitRangeContext).mockResolvedValue(range);
  vi.spyOn(console, "debug").mockImplementation(() => undefined);
});

describe("generateCommitMessageWith", () => {
  it("parses the agent reply and formats it as a commit message", async () => {
    const run = vi.fn(
      async (_input: TextPromptInput) =>
        '{"subject":"Add x to the panel.","body":"Keeps the panel in sync."}',
    );

    await expect(generateCommitMessageWith(run, "/repo")).resolves.toBe(
      "Add x to the panel\n\nKeeps the panel in sync.",
    );
    expect(run).toHaveBeenCalledOnce();
    expect(run.mock.calls[0]?.[0]).toMatchObject({
      cwd: "/repo",
      timeoutMs: 90_000,
    });
  });

  it("throws the no-text error when the agent returns nothing", async () => {
    const run = vi.fn(async () => "   ");

    await expect(generateCommitMessageWith(run, "/repo")).rejects.toThrow(
      "Could not generate a commit message. The agent returned no text.",
    );
  });

  it("aborts before running the agent when the signal is already aborted", async () => {
    const run = vi.fn(async () => "{}");
    const controller = new AbortController();
    controller.abort();

    await expect(
      generateCommitMessageWith(run, "/repo", controller.signal),
    ).rejects.toThrow();
    expect(run).not.toHaveBeenCalled();
  });
});

describe("generatePrContentWith", () => {
  it("uses the parsed title and body when the reply is valid", async () => {
    const run = vi.fn(
      async () => '{"title":"Add x","body":"## Summary\\n- wires x"}',
    );

    await expect(generatePrContentWith(run, "/repo")).resolves.toEqual({
      title: "Add x",
      body: "## Summary\n- wires x",
      base: "main",
      head: "feature/x",
    });
  });

  it("falls back to the commit summary when parsing fails", async () => {
    const run = vi.fn(async () => "not json at all");

    await expect(generatePrContentWith(run, "/repo")).resolves.toEqual({
      title: "Add x",
      body: "Add x\n\nWires x into the panel",
      base: "main",
      head: "feature/x",
    });
  });

  it("falls back to the commit summary when the agent call throws", async () => {
    const run = vi.fn(async () => {
      throw new Error("timed out");
    });

    await expect(generatePrContentWith(run, "/repo")).resolves.toMatchObject({
      title: "Add x",
    });
  });
});

describe("generateBranchNameWith", () => {
  it("returns the parsed branch name", async () => {
    const run = vi.fn(async () => '{"branch":"feature/add-x"}');

    await expect(
      generateBranchNameWith(run, "/repo", "Add x"),
    ).resolves.toBe("feature/add-x");
  });

  it("returns null when the agent call fails", async () => {
    const run = vi.fn(async () => {
      throw new Error("agent exited");
    });

    await expect(
      generateBranchNameWith(run, "/repo", "Add x"),
    ).resolves.toBeNull();
  });
});
