import { describe, expect, it } from "vitest";
import {
  buildCommitMessagePrompt,
  buildPrContentPrompt,
  parseCommitMessage,
  parsePrContent,
  stripAttribution,
} from "./gitText";

describe("stripAttribution", () => {
  it.each([
    "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>",
    "co-authored-by: someone <someone@example.com>",
    "Claude-Session: https://example.com/abc",
    "🤖 Generated with [Claude Code](https://claude.com/claude-code)",
    "Generated with Claude Code",
    "See https://claude.ai/code/session_123",
  ])("removes the attribution line %s", (line) => {
    expect(stripAttribution(`Adds x.\n\n${line}`)).toBe("Adds x.");
  });

  it("keeps normal lines that mention Claude only in passing", () => {
    expect(stripAttribution("- adds claude support")).toBe(
      "- adds claude support",
    );
  });

  it("collapses the blank lines left behind by a removed line", () => {
    expect(
      stripAttribution("- a\n\n🤖 Generated with Claude\n\n- b"),
    ).toBe("- a\n\n- b");
  });
});

describe("parsePrContent", () => {
  it("strips attribution from the PR body", () => {
    const raw = JSON.stringify({
      title: "Add x",
      body: "- wires x\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)",
    });

    expect(parsePrContent(raw)).toEqual({ title: "Add x", body: "- wires x" });
  });
});

describe("parseCommitMessage", () => {
  it("strips a co-author trailer from the commit body", () => {
    const raw = JSON.stringify({
      subject: "Add x",
      body: "- wires x\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>",
    });

    expect(parseCommitMessage(raw)).toEqual({
      subject: "Add x",
      body: "- wires x",
    });
  });

  it("strips a co-author trailer from a list-form commit body", () => {
    const raw = JSON.stringify({
      subject: "Add x",
      body: ["- wires x", "Co-Authored-By: Claude <noreply@anthropic.com>"],
    });

    expect(parseCommitMessage(raw)).toEqual({
      subject: "Add x",
      body: "- wires x",
    });
  });
});

describe("prompts", () => {
  const prInput = {
    baseBranch: "main",
    headBranch: "feature/x",
    commitSummary: "Add x",
    diffSummary: "1 file changed",
    diffPatch: "+const x = 1;",
  };

  it("asks for short bullets with no headings or testing section", () => {
    const prompt = buildPrContentPrompt(prInput);

    expect(prompt).not.toContain("## Testing");
    expect(prompt).not.toContain("## Summary");
    expect(prompt).toContain(
      "- body must be 2–6 short markdown bullet points saying what changed and why",
    );
    expect(prompt).toContain("- no headings, no testing section");
  });

  it.each([
    ["PR", () => buildPrContentPrompt(prInput)],
    [
      "commit",
      () =>
        buildCommitMessagePrompt({
          branch: "feature/x",
          stagedSummary: "M x.ts",
          stagedPatch: "+const x = 1;",
        }),
    ],
  ])("forbids attribution in the %s prompt", (_name, build) => {
    expect(build()).toContain(
      "- never add attribution, co-author trailers, emojis, or mentions of AI tools",
    );
  });
});
