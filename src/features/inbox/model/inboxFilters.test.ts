import { beforeEach, describe, expect, it } from "vitest";
import {
  applyInboxFilters,
  DEFAULT_INBOX_FILTERS,
  filterInboxByKind,
  filterInboxByProject,
  filterInboxByStatus,
  filterInboxByTime,
  hasActiveInboxFilters,
  inboxFetchState,
  pruneInboxFilters,
  loadInboxConnections,
  resolveInboxSource,
  saveInboxConnections,
} from "./inboxFilters";
import type { InboxItem } from "../../github/model/githubTasks";

function item(
  overrides: Partial<InboxItem> & Pick<InboxItem, "number" | "updatedAt">,
): InboxItem {
  return {
    kind: "issue",
    title: "Item",
    url: "https://github.com/acme/web/issues/1",
    state: "open",
    labels: [],
    assignees: [],
    draft: false,
    repo: "acme/web",
    projectPath: "/tmp/web",
    provider: "github",
    ...overrides,
  };
}

describe("filterInboxByProject", () => {
  it("hides selected projects", () => {
    const rows = [
      item({
        number: 1,
        updatedAt: "2026-08-27T10:00:00Z",
        projectPath: "/tmp/web",
      }),
      item({
        number: 2,
        updatedAt: "2026-08-27T10:00:00Z",
        projectPath: "/tmp/docs",
      }),
    ];
    expect(
      filterInboxByProject(rows, ["/tmp/web/"]).map((row) => row.number),
    ).toEqual([2]);
  });

});

describe("filterInboxByKind", () => {
  it("hides selected kinds", () => {
    const rows = [
      item({ number: 1, kind: "issue", updatedAt: "2026-08-27T10:00:00Z" }),
      item({ number: 2, kind: "pr", updatedAt: "2026-08-27T10:00:00Z" }),
    ];
    expect(filterInboxByKind(rows, ["pr"]).map((row) => row.number)).toEqual([
      1,
    ]);
    expect(
      filterInboxByKind(rows, ["issue"]).map((row) => row.number),
    ).toEqual([2]);
  });
});

describe("filterInboxByStatus", () => {
  const rows = [
    item({ number: 1, updatedAt: "2026-08-27T10:00:00Z", state: "open" }),
    item({
      number: 2,
      kind: "pr",
      updatedAt: "2026-08-27T10:00:00Z",
      state: "open",
      draft: true,
    }),
    item({ number: 3, updatedAt: "2026-08-27T10:00:00Z", state: "closed" }),
    item({
      number: 4,
      kind: "pr",
      updatedAt: "2026-08-27T10:00:00Z",
      state: "merged",
    }),
  ];

  it("keeps every item when no status is selected", () => {
    expect(
      filterInboxByStatus(rows, DEFAULT_INBOX_FILTERS.status).map(
        (row) => row.number,
      ),
    ).toEqual([1, 2, 3, 4]);
  });

  it("matches any selected status", () => {
    expect(
      filterInboxByStatus(rows, {
        open: true,
        draft: false,
        closed: true,
        merged: false,
      }).map((row) => row.number),
    ).toEqual([1, 3]);
  });
});

describe("filterInboxByTime", () => {
  const now = new Date("2026-08-27T15:00:00").getTime();

  it("keeps items updated today", () => {
    const rows = [
      item({
        number: 1,
        updatedAt: new Date("2026-08-27T10:00:00").toISOString(),
      }),
      item({
        number: 2,
        updatedAt: new Date("2026-08-20T10:00:00").toISOString(),
      }),
    ];
    expect(
      filterInboxByTime(rows, "today", now).map((row) => row.number),
    ).toEqual([1]);
  });
});

describe("applyInboxFilters", () => {
  it("combines project, kind, and search filters", () => {
    const rows = [
      item({
        number: 1,
        title: "Fix checkout",
        kind: "pr",
        projectPath: "/tmp/web",
        updatedAt: "2026-08-27T10:00:00Z",
      }),
      item({
        number: 2,
        title: "Fix checkout",
        kind: "issue",
        projectPath: "/tmp/docs",
        updatedAt: "2026-08-27T10:00:00Z",
      }),
    ];
    expect(
      applyInboxFilters(
        rows,
        { ...DEFAULT_INBOX_FILTERS, hiddenProjects: ["/tmp/docs"] },
        "checkout",
      ).map((row) => row.number),
    ).toEqual([1]);
  });

});

describe("hasActiveInboxFilters", () => {
  it("is false for defaults", () => {
    expect(hasActiveInboxFilters(DEFAULT_INBOX_FILTERS)).toBe(false);
  });

  it("is true when a project is hidden", () => {
    expect(
      hasActiveInboxFilters({
        ...DEFAULT_INBOX_FILTERS,
        hiddenProjects: ["/tmp/web"],
      }),
    ).toBe(true);
  });

});

describe("inboxFetchState", () => {
  it("fetches everything while no status is selected", () => {
    expect(inboxFetchState(DEFAULT_INBOX_FILTERS)).toBe("all");
  });

  it("narrows to open once only open or draft is selected", () => {
    expect(
      inboxFetchState({
        ...DEFAULT_INBOX_FILTERS,
        status: { ...DEFAULT_INBOX_FILTERS.status, open: true },
      }),
    ).toBe("open");
    expect(
      inboxFetchState({
        ...DEFAULT_INBOX_FILTERS,
        status: { ...DEFAULT_INBOX_FILTERS.status, draft: true },
      }),
    ).toBe("open");
  });

  it("widens to all when closed or merged is selected", () => {
    expect(
      inboxFetchState({
        ...DEFAULT_INBOX_FILTERS,
        status: { ...DEFAULT_INBOX_FILTERS.status, closed: true },
      }),
    ).toBe("all");
    expect(
      inboxFetchState({
        ...DEFAULT_INBOX_FILTERS,
        status: { ...DEFAULT_INBOX_FILTERS.status, open: true, merged: true },
      }),
    ).toBe("all");
  });
});

describe("pruneInboxFilters", () => {
  it("drops hidden projects that are no longer in the rail", () => {
    const pruned = pruneInboxFilters(
      { ...DEFAULT_INBOX_FILTERS, hiddenProjects: ["/tmp/web", "/tmp/gone"] },
      ["/tmp/web"],
    );
    expect(pruned.hiddenProjects).toEqual(["/tmp/web"]);
  });
});

describe("resolveInboxSource", () => {
  it("keeps GitHub as an internal fallback when every source is disconnected", () => {
    expect(
      resolveInboxSource("github", {
        github: false,
      }),
    ).toBe("github");
  });

  it("leaves a still-visible selection alone", () => {
    expect(
      resolveInboxSource("github", {
        github: true,
      }),
    ).toBe("github");
  });
});

function mockLocalStorage() {
  const data = new Map<string, string>();
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
    clear: () => {
      data.clear();
    },
    key: (index: number) => [...data.keys()][index] ?? null,
    get length() {
      return data.size;
    },
  };
  Object.defineProperty(globalThis, "localStorage", {
    value: storage,
    configurable: true,
  });
}

describe("inbox connection cache", () => {
  const KEY = "bonocode.inboxConnections";
  beforeEach(mockLocalStorage);

  it("round-trips the last known connect state", () => {
    saveInboxConnections({ github: false });
    expect(loadInboxConnections()).toEqual({ github: false });
  });

  it("reads unknown when nothing is stored", () => {
    expect(loadInboxConnections()).toEqual({ github: null });
  });

  it("reads unknown rather than trusting a malformed value", () => {
    localStorage.setItem(KEY, "not json");
    expect(loadInboxConnections()).toEqual({ github: null });
    localStorage.setItem(KEY, '{"github":"yes"}');
    expect(loadInboxConnections()).toEqual({ github: null });
  });
});
