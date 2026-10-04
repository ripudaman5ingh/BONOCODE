// @vitest-environment happy-dom
// Writes the benchmark fixture spec: a large chat plus two small ones, open as three
// tabs. Skipped unless BENCH_FIXTURE_SPEC is set; run scripts/bench/make-fixture.mjs.
import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  appendUser,
  applyHarnessEvents,
  stopStreaming,
} from "../../../integrations/harness/core/apply";
import type { HarnessEvent } from "../../../integrations/harness/core/types";
import { newTab } from "../../workspace/model/layout";
import { collectWorkspaceSnapshot } from "../../workspace/model/workspaceSnapshot";
import { newSession, type Session, type ToolPreviewLine } from "../model/session";
import { sanitizeSessionForPersist } from "./sessionStore";

const SPEC = process.env.BENCH_FIXTURE_SPEC;
const PROJECT = process.env.BENCH_FIXTURE_PROJECT ?? "";
const MESSAGES = Number(process.env.BENCH_FIXTURE_MESSAGES ?? "500");
const BLOCKS_PER_TURN = 6;

const WORDS = [
  "the", "harness", "session", "reducer", "transcript", "agent", "diff", "worktree",
  "composer", "event", "stream", "provider", "render", "cache", "layout", "pane",
  "token", "commit", "branch", "test", "update", "handler", "state", "queue",
];

function words(seed: number, count: number): string {
  const out: string[] = [];
  for (let i = 0; i < count; i++) out.push(WORDS[(seed * 7 + i * 13) % WORDS.length]);
  return out.join(" ");
}

function sentence(seed: number, count: number): string {
  const text = words(seed, count);
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}

function fileName(turn: number): string {
  return `module${turn % 40}.ts`;
}

function codeLines(turn: number, count: number): string[] {
  const lines: string[] = [];
  for (let i = 0; i < count; i++) {
    lines.push(`export function ${WORDS[(turn + i) % WORDS.length]}${i}(input: number) { return input * ${i + 1}; }`);
  }
  return lines;
}

function diffLines(turn: number): ToolPreviewLine[] {
  const code = codeLines(turn, 12);
  return [
    ...code.slice(0, 4).map((text, i) => ({ number: 10 + i, kind: "context" as const, text })),
    ...code.slice(4, 7).map((text) => ({ kind: "del" as const, text })),
    ...code.slice(4, 9).map((text, i) => ({ number: 14 + i, kind: "add" as const, text: text.replace("input", "value") })),
    ...code.slice(9, 12).map((text, i) => ({ number: 19 + i, kind: "context" as const, text })),
  ];
}

function testOutput(turn: number): string {
  const lines = [`> vitest run src/${fileName(turn)}`, ""];
  for (let i = 0; i < 12; i++) lines.push(` ✓ ${words(turn + i, 4)} (${(i * 3) % 17 + 1} ms)`);
  lines.push("", ` Test Files  1 passed (1)`, `      Tests  12 passed (12)`);
  return lines.join("\n");
}

function assistantText(turn: number): string {
  const parts = [sentence(turn, 18), "", `- ${sentence(turn + 1, 8)}`, `- ${sentence(turn + 2, 10)}`, `- ${sentence(turn + 3, 7)}`];
  if (turn % 3 === 0) parts.push("", "```ts", ...codeLines(turn, 6), "```");
  parts.push("", sentence(turn + 4, 24));
  return parts.join("\n");
}

function turnEvents(turn: number): HarnessEvent[] {
  const file = `src/${fileName(turn)}`;
  const path = `${PROJECT}/${file}`;
  return [
    { type: "turn.started", providerTurnId: `turn-${turn}` },
    { type: "message.delta", text: sentence(turn, 20) },
    { type: "message.completed" },
    {
      type: "tool.started",
      callId: `read-${turn}`,
      title: `Read ${file}`,
      kind: "read",
      preview: {
        kind: "read",
        path,
        fileName: fileName(turn),
        startLine: 1,
        lines: codeLines(turn, 20).map((text, i) => ({ number: i + 1, kind: "context", text })),
      },
    },
    { type: "tool.updated", callId: `read-${turn}`, status: "completed" },
    {
      type: "tool.started",
      callId: `edit-${turn}`,
      title: `Edit ${file}`,
      kind: "edit",
      preview: {
        kind: "write",
        path,
        fileName: fileName(turn),
        startLine: 10,
        additions: 5,
        deletions: 3,
        lines: diffLines(turn),
      },
    },
    { type: "tool.updated", callId: `edit-${turn}`, status: "completed" },
    {
      type: "tool.started",
      callId: `shell-${turn}`,
      title: "npm test",
      kind: "execute",
      preview: { kind: "shell", title: "npm test", output: testOutput(turn) },
    },
    { type: "tool.updated", callId: `shell-${turn}`, status: "completed" },
    { type: "message.delta", text: assistantText(turn) },
    { type: "message.completed" },
  ];
}

function buildChat(title: string, turns: number, seed: number): Session {
  let session: Session = { ...newSession("claude", PROJECT), title };
  for (let t = 0; t < turns; t++) {
    session = appendUser(session, sentence(seed + t, 14));
    session = applyHarnessEvents(session, turnEvents(seed + t));
    session = stopStreaming(session);
  }
  return session;
}

describe.runIf(Boolean(SPEC))("benchmark fixture", () => {
  it("writes the fixture spec", () => {
    expect(PROJECT).not.toBe("");
    const big = buildChat("Bench: large chat", Math.ceil(MESSAGES / BLOCKS_PER_TURN), 0);
    const smallA = buildChat("Bench: small chat A", 5, 1000);
    const smallB = buildChat("Bench: small chat B", 5, 2000);
    const sessions = [big, smallA, smallB];
    const tabs = sessions.map((session) => newTab(session.id));
    const workspace = collectWorkspaceSnapshot(tabs, sessions, tabs[0].id, PROJECT, new Map());
    const spec = { sessions: sessions.map(sanitizeSessionForPersist), workspace };
    expect(spec.sessions[0].blocks.length).toBeGreaterThanOrEqual(MESSAGES);
    expect(workspace.tabs).toHaveLength(3);
    writeFileSync(SPEC as string, JSON.stringify(spec));
  });
});
