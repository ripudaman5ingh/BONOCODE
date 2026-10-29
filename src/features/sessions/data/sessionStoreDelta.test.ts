import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }));

async function loadStore() {
  vi.resetModules();
  return import("./sessionStore");
}

type TestBlock = { id: string; role: string; text: string; draft?: boolean };

function block(id: string, role: string, text: string): TestBlock {
  return { id, role, text };
}

function session(id: string, blocks: TestBlock[], title = "Chat") {
  return {
    id,
    cwd: "/tmp/project",
    harness: "cursor" as const,
    model: "",
    modelSettings: {},
    runtimeMode: "supervised" as const,
    title,
    blocks,
    busy: false,
  };
}

function summaryFor(id: string, title: string) {
  return {
    id,
    cwd: "/tmp/project",
    harness: "cursor",
    model: "",
    runtimeMode: "supervised",
    title,
    createdAt: 1,
    updatedAt: 2,
  };
}

function respond(command: string, args: { session?: { id: string; title: string } }) {
  if (command === "session_upsert" || command === "session_upsert_blocks") {
    return Promise.resolve(
      summaryFor(args.session?.id ?? "", args.session?.title ?? ""),
    );
  }
  return Promise.resolve(undefined);
}

/** Every save command the store sent, in order. */
function writeCalls() {
  return mocks.invoke.mock.calls.filter(
    ([command]) =>
      command === "session_upsert" || command === "session_upsert_blocks",
  );
}

function lastWrite() {
  const calls = writeCalls();
  return calls[calls.length - 1];
}

afterEach(() => {
  mocks.invoke.mockReset();
});

describe("session delta saves", () => {
  it("sends only the appended block once the DB holds the first save", async () => {
    mocks.invoke.mockImplementation(respond);
    const { upsertSession } = await loadStore();
    const user = block("u", "user", "hello");
    const assistant = block("a", "assistant", "hi");

    await upsertSession(session("s1", [user]));
    expect(lastWrite()[0]).toBe("session_upsert");

    await upsertSession(session("s1", [user, assistant]));

    const [command, args] = lastWrite();
    expect(command).toBe("session_upsert_blocks");
    expect(args.order).toEqual(["u", "a"]);
    expect(args.changed).toEqual([{ id: "a", block: assistant }]);
    expect(args.session).not.toHaveProperty("blocks");
    expect(args.session.id).toBe("s1");
  });

  it("sends a title-only change without any blocks", async () => {
    mocks.invoke.mockImplementation(respond);
    const { upsertSession } = await loadStore();
    const user = block("u", "user", "hello");
    const assistant = block("a", "assistant", "hi");
    await upsertSession(session("s1", [user, assistant]));

    await upsertSession(session("s1", [user, assistant], "Renamed"));

    const [command, args] = lastWrite();
    expect(command).toBe("session_upsert_blocks");
    expect(args.changed).toEqual([]);
    expect(args.order).toEqual(["u", "a"]);
    expect(args.session.title).toBe("Renamed");
  });

  it("omits a removed block from the order without sending it", async () => {
    mocks.invoke.mockImplementation(respond);
    const { upsertSession } = await loadStore();
    const user = block("u", "user", "hello");
    const assistant = block("a", "assistant", "hi");
    await upsertSession(session("s1", [user, assistant]));

    await upsertSession(session("s1", [user]));

    const [command, args] = lastWrite();
    expect(command).toBe("session_upsert_blocks");
    expect(args.order).toEqual(["u"]);
    expect(args.changed).toEqual([]);
  });

  it("falls back to a full write on needs-full-write, then goes back to deltas", async () => {
    mocks.invoke.mockImplementation(respond);
    const { upsertSession } = await loadStore();
    const user = block("u", "user", "hello");
    const assistant = block("a", "assistant", "hi");
    const tool = block("t", "tool", "ran");
    await upsertSession(session("s1", [user]));

    mocks.invoke.mockRejectedValueOnce("needs full write");
    await upsertSession(session("s1", [user, assistant]));

    const fallback = writeCalls().slice(-2);
    expect(fallback.map(([command]) => command)).toEqual([
      "session_upsert_blocks",
      "session_upsert",
    ]);
    expect(fallback[1][1].session.blocks).toEqual([user, assistant]);

    await upsertSession(session("s1", [user, assistant, tool]));
    const [command, args] = lastWrite();
    expect(command).toBe("session_upsert_blocks");
    expect(args.changed).toEqual([{ id: "t", block: tool }]);
  });

  it("rethrows other rejections and makes the next save a full write", async () => {
    mocks.invoke.mockImplementation(respond);
    const { upsertSession } = await loadStore();
    const user = block("u", "user", "hello");
    const assistant = block("a", "assistant", "hi");
    await upsertSession(session("s1", [user]));

    mocks.invoke.mockRejectedValueOnce(new Error("disk is full"));
    await expect(
      upsertSession(session("s1", [user, assistant])),
    ).rejects.toThrow("disk is full");

    await upsertSession(session("s1", [user, assistant]));
    expect(lastWrite()[0]).toBe("session_upsert");
    expect(lastWrite()[1].session.blocks).toHaveLength(2);
  });

  it("uses a full write for duplicate ids and for all-new block objects", async () => {
    mocks.invoke.mockImplementation(respond);
    const { upsertSession } = await loadStore();
    const user = block("u", "user", "hello");
    const assistant = block("a", "assistant", "hi");
    await upsertSession(session("s1", [user, assistant]));

    await upsertSession(
      session("s1", [user, block("u", "user", "duplicate")]),
    );
    expect(lastWrite()[0]).toBe("session_upsert");

    await upsertSession(
      session("s1", [block("u", "user", "hello"), block("a", "assistant", "hi")]),
    );
    expect(lastWrite()[0]).toBe("session_upsert");
  });

  it("leaves out a block that sanitizes to null", async () => {
    mocks.invoke.mockImplementation(respond);
    const { upsertSession } = await loadStore();
    const user = block("u", "user", "hello");
    await upsertSession(session("s1", [user]));

    await upsertSession(
      session("s1", [user, block("img", "image", "")]),
    );

    const [command, args] = lastWrite();
    expect(command).toBe("session_upsert_blocks");
    expect(args.order).toEqual(["u"]);
    expect(args.changed).toEqual([]);
  });

  it("makes the first save after getSession a full write", async () => {
    const user = block("u", "user", "hello");
    mocks.invoke.mockImplementation((command: string, args: unknown) => {
      if (command === "session_get") {
        return Promise.resolve({
          id: "s1",
          cwd: "/tmp/project",
          harness: "cursor",
          model: "",
          modelSettings: {},
          runtimeMode: "supervised",
          title: "Chat",
          blocks: [user],
          createdAt: 1,
          updatedAt: 2,
        });
      }
      return respond(command, args as { session?: { id: string; title: string } });
    });
    const { getSession, upsertSession } = await loadStore();
    await upsertSession(session("s1", [user]));

    const loaded = await getSession("s1");
    expect(loaded).not.toBeNull();
    await upsertSession(loaded!);

    expect(lastWrite()[0]).toBe("session_upsert");
  });

  it("makes the next save after a discarded draft a full write", async () => {
    mocks.invoke.mockImplementation(respond);
    const { discardDraftSessionRecord, upsertSession } = await loadStore();
    const user = block("u", "user", "hello");
    await upsertSession(session("s1", [user]));

    await discardDraftSessionRecord("s1");
    await upsertSession(session("s1", [user]));

    expect(lastWrite()[0]).toBe("session_upsert");
  });
});
