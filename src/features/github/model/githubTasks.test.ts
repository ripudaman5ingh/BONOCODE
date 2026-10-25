import { describe, expect, it } from "vitest";
import {
  detailsCacheKey,
  formatRelativeTime,
  githubAvatarUrl,
  githubReviewDecisionLabel,
  githubReviewStateLabel,
  inboxPersonAvatarUrl,
  prDiffCacheKey,
} from "./githubTasks";

describe("githubAvatarUrl", () => {
  it("builds the GitHub avatar URL", () => {
    expect(githubAvatarUrl("maya")).toBe(
      "https://avatars.githubusercontent.com/maya?s=64",
    );
  });

  it("encodes bot logins", () => {
    expect(githubAvatarUrl("dependabot[bot]")).toBe(
      "https://avatars.githubusercontent.com/dependabot%5Bbot%5D?s=64",
    );
  });

  it("returns empty for a blank login", () => {
    expect(githubAvatarUrl("  ")).toBe("");
  });
});

describe("inboxPersonAvatarUrl", () => {
  it("prefers an explicit avatar", () => {
    expect(
      inboxPersonAvatarUrl(
        "github",
        "Ada",
        "https://avatars.githubusercontent.com/ada.png",
      ),
    ).toBe("https://avatars.githubusercontent.com/ada.png");
  });

  it("falls back to GitHub avatars for GitHub people", () => {
    expect(inboxPersonAvatarUrl("github", "maya")).toBe(
      "https://avatars.githubusercontent.com/maya?s=64",
    );
  });

});

describe("formatRelativeTime", () => {
  it("formats hours ago", () => {
    const now = Date.parse("2026-08-27T12:00:00Z");
    expect(formatRelativeTime("2026-08-27T10:00:00Z", now, "en")).toBe(
      "2 hours ago",
    );
  });

  it("returns empty for an unreadable timestamp", () => {
    expect(formatRelativeTime("not-a-date")).toBe("");
  });
});

describe("githubReviewDecisionLabel", () => {
  it("labels GitHub review rollups", () => {
    expect(githubReviewDecisionLabel("APPROVED")).toBe("Approved");
    expect(githubReviewDecisionLabel("changes_requested")).toBe(
      "Changes requested",
    );
    expect(githubReviewDecisionLabel("REVIEW_REQUIRED")).toBe(
      "Review required",
    );
    expect(githubReviewDecisionLabel("")).toBe("");
  });
});

describe("githubReviewStateLabel", () => {
  it("labels a submitted review", () => {
    expect(githubReviewStateLabel("APPROVED")).toBe("Approved");
    expect(githubReviewStateLabel("COMMENTED")).toBe("Commented");
    expect(githubReviewStateLabel("PENDING")).toBe("");
  });
});

describe("GitHub repository cache keys", () => {
  it("separates same-number items from different repositories", () => {
    expect(detailsCacheKey("maya/web", "issue", 10)).not.toBe(
      detailsCacheKey("acme/web", "issue", 10),
    );
    expect(prDiffCacheKey("maya/web", 10)).not.toBe(
      prDiffCacheKey("acme/web", 10),
    );
  });
});
