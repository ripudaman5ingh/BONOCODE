import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sent: string[] = [];
const spawned: string[][] = [];
const spawnCwds: string[] = [];
let onLine: ((line: string) => void) | undefined;

vi.mock("../../core/child", () => ({
  resolveClaudeBinary: async () => ({ path: "/fake/claude" }),
  spawnChild: async (
    _id: string,
    _path: string,
    args: string[],
    cwd: string,
  ) => {
    spawned.push(args);
    spawnCwds.push(cwd);
  },
  killChild: async () => undefined,
  unwatchChild: () => undefined,
  watchChild: (_id: string, line: (l: string) => void) => {
    onLine = line;
  },
  writeChild: async (_id: string, line: string) => {
    sent.push(line);
  },
}));

const { sendClaudeTurn, stopClaudeSession, __claudeTestReset } = await import(
  "./claude"
);
const { buildClaudeSpawnArgs } = await import("./claudeProtocol");
const { saveProjectNotesFolder } = await import(
  "../../../../features/projects/model/projectNotesFolder"
);

function mockBrowserStorage() {
  const data = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    value: {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => data.set(key, value),
    },
    configurable: true,
  });
  Object.defineProperty(globalThis, "window", {
    value: { dispatchEvent: () => true },
    configurable: true,
  });
}

function emit(rec: Record<string, unknown>) {
  onLine!(JSON.stringify(rec));
}

async function waitFor(pred: () => boolean, label: string) {
  for (let i = 0; i < 200; i++) {
    if (pred()) return;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error(`timed out waiting for ${label}`);
}

function settingsOf(args: string[]): Record<string, unknown> {
  return JSON.parse(args[args.indexOf("--settings") + 1]) as Record<
    string,
    unknown
  >;
}

function send(cwd: string, projectCwd?: string) {
  return sendClaudeTurn({
    sessionId: "s1",
    cwd,
    projectCwd,
    model: "claude:claude-sonnet-5",
    modelSettings: {},
    runtimeMode: "supervised",
    text: "hello",
    attachments: [],
    onEvent: () => undefined,
  });
}

async function finishTurn(turn: Promise<void>, expectedUsers: number) {
  emit({ type: "system", subtype: "init", session_id: "sess_1" });
  emit({
    type: "control_response",
    response: { subtype: "success", request_id: "monocode_1" },
  });
  await waitFor(
    () =>
      sent.filter((line) => (JSON.parse(line) as { type?: string }).type === "user")
        .length >= expectedUsers,
    "user prompt",
  );
  emit({ type: "result", subtype: "success", session_id: "sess_1" });
  await turn;
}

beforeEach(() => {
  mockBrowserStorage();
  sent.length = 0;
  spawned.length = 0;
  spawnCwds.length = 0;
  onLine = undefined;
  __claudeTestReset();
});

afterEach(async () => {
  await stopClaudeSession("s1");
  __claudeTestReset();
});

describe("claude notes folder launch", () => {
  it("passes the project's folder to an interactive session in a worktree", async () => {
    saveProjectNotesFolder("/work/alpha", "/vault/Notes");
    const turn = send("/work/alpha-wt/feature", "/work/alpha");
    await waitFor(() => spawned.length === 1, "spawn");
    expect(spawnCwds[0]).toBe("/work/alpha-wt/feature");
    expect(settingsOf(spawned[0]).permissions).toEqual({
      additionalDirectories: ["/vault/Notes"],
    });
    await finishTurn(turn, 1);
  });

  it("leaves the settings alone when no folder is linked", async () => {
    const turn = send("/work/alpha", "/work/alpha");
    await waitFor(() => spawned.length === 1, "spawn");
    expect(settingsOf(spawned[0])).not.toHaveProperty("permissions");
    await finishTurn(turn, 1);
  });

  it("restarts the agent on its next turn after a folder is linked", async () => {
    await (async () => {
      const first = send("/work/alpha", "/work/alpha");
      await waitFor(() => spawned.length === 1, "first spawn");
      await finishTurn(first, 1);
    })();
    saveProjectNotesFolder("/work/alpha", "/vault/Notes");
    const second = send("/work/alpha", "/work/alpha");
    await waitFor(() => spawned.length === 2, "restart");
    expect(settingsOf(spawned[1]).permissions).toEqual({
      additionalDirectories: ["/vault/Notes"],
    });
    expect(spawned[1]).toContain("--resume");
    await finishTurn(second, 2);
  });

  it("never gives an isolated helper spawn the folder", () => {
    saveProjectNotesFolder("/work/alpha", "/vault/Notes");
    const args = buildClaudeSpawnArgs({ isolated: true, sessionId: "h1" });
    expect(settingsOf(args)).toEqual({ disableAllHooks: true });
  });
});
