import { lastUserBlockId } from "../../sessions/hooks/useSessionHistory";
import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { newTab } from "../../workspace/model/layout";
import { forgetHarnessSession, isLiveHarness, latestTurnNeedsHarnessLogin, probeHarnessAvailability, refreshHarnessCatalogs } from "../../../integrations/harness";
import { supportsHarnessLogin } from "../../../integrations/harness/core/authSupport";
import { isPreparingHandoff, planComposerSwitch } from "../../sessions/model/handoff";
import { mergeModelSettings, preferredModelSettings, resolveModel, saveLastModelSettings, saveRecentModelChoice } from "../../sessions/model/models";
import { DEFAULT_PROVIDER_ACCOUNT_ID, type ProviderAccountProvider } from "../model/providerAccounts";
import { HARNESS_LABEL, formatSessionTitle, newSession, sessionDisplayTitle, type HarnessId, type PlanBuildTarget, type RuntimeMode, type Session } from "../../sessions/model/session";
import { dropContextWindow } from "../../sessions/model/contextUsage";
import { type useWorkspaceTabActions } from "../../workspace/hooks/useWorkspaceTabActions";
import { type LiveSessionStore } from "../../sessions/model/liveSessions";


export function withHarnessChoice(
  session: Session,
  harness: HarnessId,
  model: string,
  modelSettings: Record<string, string>,
): Session {
  return {
    ...session,
    harness,
    model,
    modelSettings,
    title:
      session.blocks.length === 0
        ? HARNESS_LABEL[harness]
        : formatSessionTitle(
            harness,
            sessionDisplayTitle(session.title, session.harness),
          ),
    ...(session.model === model
      ? {}
      : { context: dropContextWindow(session.context) }),
    ...(session.harness === harness
      ? {}
      : { providerSessionId: undefined, providerAccountId: undefined }),
  };
}

export function withPlanBuildTarget(
  session: Session,
  target: PlanBuildTarget,
): Session {
  const resolved = resolveModel(target.harness, target.model);
  const modelSettings = mergeModelSettings(resolved, target.modelSettings);
  const plan = planComposerSwitch(session, target.harness);
  const next = withHarnessChoice(
    session,
    target.harness,
    resolved.id,
    modelSettings,
  );

  if (plan.kind === "arm") {
    return { ...next, pendingSwitch: plan.pending };
  }
  if (plan.kind === "revert") {
    return {
      ...next,
      pendingSwitch: undefined,
      ...(plan.restoreProviderSessionId
        ? { providerSessionId: plan.restoreProviderSessionId }
        : { providerSessionId: undefined }),
      ...(plan.restoreProviderAccountId
        ? { providerAccountId: plan.restoreProviderAccountId }
        : { providerAccountId: undefined }),
    };
  }
  if (plan.kind === "empty") {
    return { ...next, pendingSwitch: undefined };
  }
  return next;
}

export function providerSignInRequestKey(session: Session): string {
  const lastBlockId = session.blocks[session.blocks.length - 1]?.id;
  return `${session.id}:${lastUserBlockId(session) ?? lastBlockId ?? "auth"}`;
}

export function sameSettings(
  a: Record<string, string> | undefined,
  b: Record<string, string> | undefined,
): boolean {
  const left = a ?? {};
  const right = b ?? {};
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) {
    if (left[key] !== right[key]) return false;
  }
  return true;
}

export type UseProviderControlsDeps = {
  sessions: Session[];
  active: Session | undefined;
  sessionsRef: LiveSessionStore["ref"];
  setSessions: LiveSessionStore["set"];
  appendTab: ReturnType<typeof useWorkspaceTabActions>["appendTab"];
  setActiveTabId: Dispatch<SetStateAction<string>>;
  setComposerFocused: Dispatch<SetStateAction<boolean>>;
};

export function useProviderControls(deps: UseProviderControlsDeps) {
  const {
    sessions,
    active,
    sessionsRef,
    setSessions,
    appendTab,
    setActiveTabId,
    setComposerFocused,
  } = deps;
  const [providerSignInRequest, setProviderSignInRequest] = useState<{
    key: string;
    sessionId: string;
    harness: HarnessId;
  } | null>(null);

  const seenProviderSignInRequestsRef = useRef<Set<string> | null>(null);

  const seenProviderSignInRequests =
    seenProviderSignInRequestsRef.current ??
    (seenProviderSignInRequestsRef.current = new Set(
      sessions.flatMap((session) => {
        if (
          !supportsHarnessLogin(session.harness) ||
          !latestTurnNeedsHarnessLogin(session.blocks)
        ) {
          return [];
        }
        return [providerSignInRequestKey(session)];
      }),
    ));

  useEffect(() => {
    void probeHarnessAvailability();
    // Only the harnesses already in this window. Probing every installed CLI
    // at boot left unused agents (especially Pi) running in the background.
    const harnesses = [
      ...new Set(sessionsRef.current.map((session) => session.harness)),
    ];
    void refreshHarnessCatalogs(harnesses).then(() => {
      setSessions((prev) =>
        prev.map((session) => {
          if (!isLiveHarness(session.harness)) return session;
          const resolved = resolveModel(session.harness, session.model);
          const modelSettings = mergeModelSettings(
            resolved,
            session.modelSettings,
          );
          if (
            resolved.id === session.model &&
            sameSettings(modelSettings, session.modelSettings)
          ) {
            return session;
          }
          return { ...session, model: resolved.id, modelSettings };
        }),
      );
    });
  }, []);

  /** Probe the active session's harness for its live model catalog whenever
   * the active harness changes. Catalogs load lazily (probing spawns a CLI
   * process) and the boot refresh runs before restored sessions land, so a
   * fresh session would otherwise show only the built-in fallback model
   * until the picker happened to be opened. Idempotent: refreshHarnessCatalogs
   * dedupes via hasLiveCatalog and its inflight map. */
  const activeHarness = active?.harness;

  useEffect(() => {
    if (!activeHarness || !isLiveHarness(activeHarness)) return;
    void refreshHarnessCatalogs([activeHarness]);
  }, [activeHarness]);

  const usageProviders = useMemo(() => {
    if (
      active?.harness === "claude" ||
      active?.harness === "codex" ||
      active?.harness === "opencode"
    ) {
      return [active.harness];
    }
    return [];
  }, [active?.harness]);

  const usageSession = useMemo(() => {
    if (!active) return undefined;
    return {
      id: active.id,
      harness: active.harness,
      model: active.model,
      authRequired: latestTurnNeedsHarnessLogin(active.blocks),
      providerAccountId:
        active.providerAccountId ??
        (active.blocks.some((block) => block.role === "user")
          ? DEFAULT_PROVIDER_ACCOUNT_ID
          : undefined),
    };
  }, [active?.id, active?.harness, active?.model, active?.blocks, active?.providerAccountId]);

  const activeProviderSignInRequest = useMemo(() => {
    if (
      !active ||
      !supportsHarnessLogin(active.harness) ||
      !latestTurnNeedsHarnessLogin(active.blocks)
    ) {
      return null;
    }
    return {
      key: providerSignInRequestKey(active),
      sessionId: active.id,
      harness: active.harness,
    };
  }, [active]);

  useEffect(() => {
    if (!activeProviderSignInRequest) return;
    if (seenProviderSignInRequests.has(activeProviderSignInRequest.key)) {
      return;
    }
    seenProviderSignInRequests.add(activeProviderSignInRequest.key);
    setProviderSignInRequest(activeProviderSignInRequest);
  }, [activeProviderSignInRequest, seenProviderSignInRequests]);

  useEffect(() => {
    if (
      providerSignInRequest &&
      active?.id !== providerSignInRequest.sessionId
    ) {
      setProviderSignInRequest(null);
    }
  }, [active?.id, providerSignInRequest]);

  const [harnessUpdateHeight, setHarnessUpdateHeight] = useState(0);

  const onSelectProviderAccount = useCallback(
    (provider: ProviderAccountProvider, accountId: string) => {
      if (!active || active.harness !== provider) return;
      const currentId = active.providerAccountId ?? DEFAULT_PROVIDER_ACCOUNT_ID;
      if (currentId === accountId) return;

      if (active.blocks.length === 0 && !active.busy) {
        setSessions((current) =>
          current.map((session) =>
            session.id === active.id
              ? { ...session, providerAccountId: accountId }
              : session,
          ),
        );
        return;
      }

      // Provider thread ids are account-owned. Keep the current conversation
      // pinned to its account and open a clean one for the selected profile.
      const session = {
        ...newSession(
          active.harness,
          active.cwd,
          active.model,
          active.runtimeMode,
          active.modelSettings,
        ),
        providerAccountId: accountId,
      };
      const tab = newTab(session.id);
      setSessions((current) => [...current, session]);
      appendTab(tab, active.cwd);
      setActiveTabId(tab.id);
      setComposerFocused(true);
    },
    [active, appendTab],
  );

  const onModelChange = useCallback(
    (sessionId: string, harness: HarnessId, model: string) => {
      const current = sessionsRef.current.find((s) => s.id === sessionId);
      if (!current) return;
      if (isPreparingHandoff(current)) return;
      const resolved = resolveModel(harness, model);
      saveRecentModelChoice(resolved.harness, resolved.id);
      if (current.modelSettings) {
        saveLastModelSettings(current.modelSettings, "fill");
      }
      const modelSettings = preferredModelSettings(
        resolved,
        current.modelSettings,
      );
      const plan = planComposerSwitch(current, harness);
      if (plan.kind === "empty") {
        void forgetHarnessSession(plan.forget, sessionId);
      }
      setSessions((prev) =>
        prev.map((s) => {
          if (s.id !== sessionId) return s;
          const next = withHarnessChoice(
            s,
            harness,
            resolved.id,
            modelSettings,
          );
          if (plan.kind === "arm") {
            return { ...next, pendingSwitch: plan.pending };
          }
          if (plan.kind === "revert") {
            return {
              ...next,
              pendingSwitch: undefined,
              ...(plan.restoreProviderSessionId
                ? { providerSessionId: plan.restoreProviderSessionId }
                : { providerSessionId: undefined }),
              ...(plan.restoreProviderAccountId
                ? { providerAccountId: plan.restoreProviderAccountId }
                : { providerAccountId: undefined }),
            };
          }
          if (plan.kind === "empty") {
            return { ...next, pendingSwitch: undefined };
          }
          return next;
        }),
      );
    },
    [],
  );

  const onModelSettingsChange = useCallback(
    (sessionId: string, modelSettings: Record<string, string>) => {
      saveLastModelSettings(modelSettings);
      setSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, modelSettings } : s)),
      );
    },
    [],
  );

  const onRuntimeModeChange = useCallback(
    (sessionId: string, runtimeMode: RuntimeMode) => {
      setSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, runtimeMode } : s)),
      );
    },
    [],
  );

  return { providerSignInRequest, setProviderSignInRequest, usageProviders, usageSession, harnessUpdateHeight, setHarnessUpdateHeight, onSelectProviderAccount, onModelChange, onModelSettingsChange, onRuntimeModeChange };
}
