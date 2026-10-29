import { describe, expect, it } from "vitest";
import { buildReviewCommentPrompt } from "./reviewToAgent";

const footer =
  "Make the change in this project, then summarize what you changed. Don't reply on GitHub.";

describe("buildReviewCommentPrompt", () => {
  it("names the file and line", () => {
    expect(
      buildReviewCommentPrompt({
        repo: "acme/web",
        number: 42,
        path: "src/app.ts",
        line: 17,
        comments: [
          { author: "ana", body: "Rename this." },
          { author: "ben", body: "Agreed." },
        ],
      }),
    ).toBe(
      [
        "Address this review comment on acme/web PR #42.",
        "File: src/app.ts:17",
        "",
        "ana: Rename this.",
        "ben: Agreed.",
        "",
        footer,
      ].join("\n"),
    );
  });

  it("omits the line when it is null", () => {
    const prompt = buildReviewCommentPrompt({
      repo: "acme/web",
      number: 7,
      path: "README.md",
      line: null,
      comments: [{ author: "ana", body: "Typo." }],
    });
    expect(prompt).toContain("\nFile: README.md\n");
    expect(prompt).not.toContain("README.md:");
  });

  it("omits the file line when there is no path", () => {
    const prompt = buildReviewCommentPrompt({
      repo: "acme/web",
      number: 7,
      path: "  ",
      line: 3,
      comments: [{ author: "ana", body: "General note." }],
    });
    expect(prompt).not.toContain("File:");
    expect(prompt).toBe(
      [
        "Address this review comment on acme/web PR #7.",
        "",
        "ana: General note.",
        "",
        footer,
      ].join("\n"),
    );
  });

  it("clips long comment bodies and the whole prompt", () => {
    const long = "x".repeat(5000);
    const body = buildReviewCommentPrompt({
      repo: "acme/web",
      number: 1,
      path: "",
      line: null,
      comments: [{ author: "ana", body: long }],
    });
    const line = body.split("\n")[2];
    expect(line).toBe(`ana: ${"x".repeat(1999)}…`);

    const many = buildReviewCommentPrompt({
      repo: "acme/web",
      number: 1,
      path: "",
      line: null,
      comments: Array.from({ length: 6 }, (_, index) => ({
        author: `user${index}`,
        body: long,
      })),
    });
    expect(many.length).toBe(8000);
    expect(many.endsWith("…")).toBe(true);
  });
});
