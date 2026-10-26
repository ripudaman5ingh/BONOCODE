import {
  type SubmissionOutcome,
  type SubmissionAcceptance,
  submitAfterProjectSync,
} from "../../../app/model/submissionAcceptance";
import { type CiRepairRequest } from "../../source-control/model/ciRepair";
import { flushSync } from "react-dom";
import {
  useRef,
  useCallback,
  useEffect,
  useState,
  type RefObject,
} from "react";
import {
  createWorktree,
  temporaryWorktreeBranchName,
  namedWorktreeBranch,
  renameWorktreeBranch,
} from "../../source-control/model/worktrees";
import { displayAttachments, prepareAttachments } from "../model/attachments";
import { notifyGitChanged } from "../../../platform/tauri/fs";
import { invalidateProjectFiles } from "../../files/model/fileIndex";
import {
  isLiveHarness,
  canSteerHarness,
  appendSteerUser,
  steerHarnessTurn,
  cancelHarnessTurn,
  stopStreaming,
  appendUser,
  generateHarnessTitle,
  forgetHarnessSession,
  canRewindHarnessLastTurn,
  generateHarnessBranchName,
  pickTextHarness,
  type HarnessEvent,
  rewindHarnessLastTurn,
  sendHarnessTurn,
  stopHarnessSession,
  promoteLastAssistantToPlan,
  canCompactHarnessContext,
  applyHarnessEvent,
  compactHarnessContext,
} from "../../../integrations/harness";
import {
  type HandoffComposerCard,
  isPreparingHandoff,
  handoffTurnCard,
  pendingHandoff,
  appendPreparingHandoff,
  shouldAskOutgoingAgent,
  chooseHandoffBrief,
  completeHandoff,
  userMessagesAfterHandoff,
  wrapHandoffPrompt,
  consumeHandoff,
  sessionThroughTurn,
  HANDOFF_TITLE,
  buildHandoffComposerCard,
  buildDeterministicHandoff,
  sessionChildHarnesses,
} from "../model/handoff";
import { requestOutgoingHandoff } from "../model/handoffTurn";
import { isEditTool } from "../../../integrations/harness/core/preview";
import {
  createEditedResendCoordinator,
  createEditedResendAttempt,
} from "../model/editLastTurn";
import {
  notifyReviewChanged,
  beginSessionTurn,
  flushSessionCheckpoint,
  prepareSessionCheckpoint,
  captureSessionCheckpoint,
} from "../model/checkpoint";
import { notifyDirsChanged } from "../../files/model/fileTree";
import {
  nudgeWatchedFiles,
  invalidateWatchedFiles,
} from "../../files/model/fileWatch";
import {
  saveRecentModelChoice,
  saveLastModelSettings,
  mergeModelSettings,
  resolveModel,
} from "../model/models";
import {
  planTurnKey,
  buildPlanPrompt,
  planTurnPrompt,
  isProviderFailureText,
} from "../model/plan";
import {
  isEqualOrInside,
  pathKey,
  resolveWorkspacePath,
} from "../../../shared/lib/paths";
import {
  synchronizeProjectLocation,
} from "../../projects/model/projectLocation";
import { looksLikeProject } from "../../projects/model/recents";
import { shouldGenerateSessionTitle } from "../model/sessionTitle";
import {
  supportsProviderAccounts,
  selectedProviderAccountId,
  providerAccountExists,
} from "../../providers/model/providerAccounts";
import {
  type ComposerTurnOptions,
  type SecondOpinionMeta,
  type PlanBuildTarget,
  type Attachment,
  type Session,
  type PlanStatus,
  type UsageLimit,
  sessionWorkCwd,
  canReplaceSessionTitle,
  HARNESS_LABEL,
  titleFromPrompt,
  formatSessionTitle,
  type ModelTarget,
  type Block,
  newSession,
  sessionDisplayTitle,
  HARNESS_TITLE,
} from "../model/session";
import {
  queuedMessageForSubmit,
  dequeueQueuedMessage,
  canDispatchQueuedHead,
} from "../model/messageQueue";
import {
  usageLimitResumeDue,
  USAGE_LIMIT_RESUME_GRACE_MS,
} from "../model/usageLimit";
import {
  fetchClaudeRateLimits,
  fetchCodexRateLimits,
} from "../../providers/model/rateLimitsFetch";
import { exhaustedWindowResetAt } from "../../providers/model/rateLimits";
import { syncDockBadge } from "../../notifications/model/dockBadge";
import {
  announceSessionFinished,
} from "../../notifications/model/notifications";
import { preparePrompt } from "../model/promptPreparation";
import { isNativeCommandPrompt } from "../../skills/model/skills";
import {
  SECOND_OPINION_TITLE,
  harnessForTurn,
  buildSecondOpinionRequest,
  turnUserRequest,
  turnEditedFiles,
} from "../model/secondOpinion";
import { resolveLinkedWorkItem } from "../model/sessionWorkItem";
import {
  type FollowUpBehavior,
  loadFollowUpBehavior,
} from "../../settings/model/settings";
import { CONTINUE_PROMPT, canAutoContinue } from "../model/inFlight";

type SubmitOptions = ComposerTurnOptions & {
  ciRepair?: CiRepairRequest;
  /** Saved alongside the user turn; does not replace the submitted prompt. */
  ciContext?: string;
  secondOpinion?: SecondOpinionMeta;
  followUpBehavior?: FollowUpBehavior;
  handoffCard?: HandoffComposerCard;
  queuedMessageId?: string;
  planBlockId?: string;
  buildTarget?: PlanBuildTarget;
  /** Settles once with how the turn ended. CI repair tracking waits on it. */
  onSettled?: (outcome: SubmissionOutcome) => void;
  /** Internal guard for the retry after resolving a renamed project. */
  projectLocationReady?: boolean;
};

type Submit = (
  sessionId: string,
  text: string,
  attachments?: Attachment[],
  options?: SubmitOptions,
) => SubmissionAcceptance;

function withPlanStatus(
  session: Session,
  blockId: string,
  status: PlanStatus,
): Session {
  return {
    ...session,
    blocks: session.blocks.map((block) =>
      block.id === blockId && block.role === "plan"
        ? {
            ...block,
            plan: { ...(block.plan ?? { status: "ready" }), status },
          }
        : block,
    ),
  };
}

function lastAssistantTextInTurn(session: Session): string {
  for (let index = session.blocks.length - 1; index >= 0; index -= 1) {
    const block = session.blocks[index];
    if (block.role === "user") return "";
    if (block.role === "assistant" && block.text.trim()) return block.text;
  }
  return "";
}

function userTurnCards(secondOpinion: SecondOpinionMeta | undefined) {
  if (!secondOpinion) return undefined;
  return { secondOpinion };
}

function trackSessionEdits(
  sessionId: string,
  cwd: string,
  event: HarnessEvent,
) {
  if (event.type !== "tool.started" && event.type !== "tool.updated") return;
  if (!isEditTool(event.kind, event.title, event.preview)) return;
  const paths = [
    ...(event.paths ?? []),
    ...(event.preview?.path ? [event.preview.path] : []),
  ].filter((path, index, all) => all.indexOf(path) === index);
  if (paths.length === 0 || cwd === "~") return;
  const completed =
    event.type === "tool.updated" &&
    (event.status === "completed" || event.status === "success");
  if (!completed) {
    void prepareSessionCheckpoint(sessionId, cwd, paths).catch(() => undefined);
    return;
  }
  void captureSessionCheckpoint(sessionId, cwd, paths)
    .catch(() => undefined)
    .then(() => notifyReviewChanged(sessionId));
}

function nudgeWorkspace(cwd?: string) {
  invalidateProjectFiles(cwd);
  notifyDirsChanged();
}

function nudgeOpenEditors(event: HarnessEvent, cwd: string) {
  if (event.type !== "tool.updated") return;
  const completed = event.status === "completed" || event.status === "success";

  const kind = event.kind?.trim().toLowerCase();
  if (kind === "execute" || event.preview?.kind === "shell") {
    if (!completed) return;
    nudgeWatchedFiles();
    window.setTimeout(() => nudgeWatchedFiles(), 150);
    notifyGitChanged();
    nudgeWorkspace(cwd);
    window.setTimeout(() => nudgeWorkspace(cwd), 150);
    return;
  }

  if (!isEditTool(event.kind, event.title, event.preview)) return;
  const resolved = [
    ...(event.paths ?? []),
    ...(event.preview?.path ? [event.preview.path] : []),
  ]
    .map((path) => resolveWorkspacePath(path, cwd) ?? path)
    .filter((path, index, paths) => paths.indexOf(path) === index);
  if (completed) {
    // A successful edit is authoritative. Reload it even if a startup race or
    // coarse filesystem timestamp makes the mtime appear unchanged.
    invalidateWatchedFiles(resolved.length > 0 ? resolved : undefined);
  } else if (resolved.length > 0) {
    nudgeWatchedFiles(resolved);
  }
  if (completed) {
    window.setTimeout(
      () => nudgeWatchedFiles(resolved.length > 0 ? resolved : undefined),
      150,
    );
    notifyGitChanged();
    nudgeWorkspace(cwd);
  }
}

type TurnControllerDeps = {
  activeSessionId: string | undefined;
  applyProjectLocationChange: (from: string, to: string) => Promise<void>;
  dismissNoticesForContinuedSession: (sessionId: string) => void;
  enqueueHarnessEvent: (sessionId: string, event: HarnessEvent) => void;
  flushHarnessEvents: () => void;
  openSessionBeside: (
    sourceId: string,
    session: Session,
    cwd: string,
    focusComposer?: boolean,
  ) => void;
  removingSessionIds: RefObject<Set<string>>;
  removingWorktreePaths: RefObject<Set<string>>;
  sessions: Session[];
  sessionsRef: { current: Session[] };
  setSessions: (update: Session[] | ((prev: Session[]) => Session[])) => void;
  switchingWorktrees: RefObject<Map<string, string>>;
  turnGen: { current: Map<string, number> };
  withPlanBuildTarget: (session: Session, target: PlanBuildTarget) => Session;
};

export function useTurnController(deps: TurnControllerDeps) {
  const {
    activeSessionId,
    applyProjectLocationChange,
    dismissNoticesForContinuedSession,
    enqueueHarnessEvent,
    flushHarnessEvents,
    openSessionBeside,
    removingSessionIds,
    removingWorktreePaths,
    sessions,
    sessionsRef,
    setSessions,
    switchingWorktrees,
    turnGen,
    withPlanBuildTarget,
  } = deps;

  const queueDispatchingRef = useRef(new Set<string>());
  const usageResumingRef = useRef(new Set<string>());
  const usageResetLookups = useRef(new WeakSet<UsageLimit>());
  const editedResends = useRef(createEditedResendCoordinator()).current;
  const projectLocationSyncs = useRef(
    new Map<string, ReturnType<typeof synchronizeProjectLocation>>(),
  );
  const submitAfterProjectSyncRef = useRef<Submit>(() => false);
  const activeSessionIdRef = useRef(activeSessionId);
  activeSessionIdRef.current = activeSessionId;

  const submitSession = useCallback(
    (
      sessionId: string,
      text: string,
      attachments: Attachment[] = [],
      options?: SubmitOptions,
    ): SubmissionAcceptance => {
      if (editedResends.isActive(sessionId)) return false;
      if (
        removingSessionIds.current.has(sessionId) ||
        switchingWorktrees.current.has(sessionId)
      )
        return false;
      const storedCurrent = sessionsRef.current.find((s) => s.id === sessionId);
      if (
        options?.ciRepair &&
        storedCurrent &&
        (storedCurrent.busy ||
          storedCurrent.pendingSwitch ||
          isPreparingHandoff(storedCurrent))
      )
        return false;
      if (
        !storedCurrent ||
        storedCurrent.worktreeRemoved ||
        [...removingWorktreePaths.current].some((path) =>
          isEqualOrInside(sessionWorkCwd(storedCurrent), path),
        )
      )
        return false;
      const draftBlock = options?.draftBlockId
        ? storedCurrent.blocks.find(
            (block) =>
              block.id === options.draftBlockId &&
              block.role === "user" &&
              block.draft,
          )
        : undefined;
      if (options?.draftBlockId && !draftBlock) return false;
      const draftCleared = draftBlock
        ? {
            ...storedCurrent,
            blocks: storedCurrent.blocks.filter(
              (block) => block.id !== draftBlock.id,
            ),
          }
        : storedCurrent;
      let current = options?.buildTarget
        ? withPlanBuildTarget(draftCleared, options.buildTarget)
        : draftCleared;
      const editedResend = options?.resendEdited
        ? createEditedResendAttempt(current, options.onResendRejected)
        : undefined;
      if (options?.resendEdited && !editedResend) return false;
      const editedProviderTurnId = editedResend?.providerTurnId;
      if (editedResend) {
        current = { ...current, blocks: editedResend.blocks };
      }
      const intent = options?.intent ?? "default";
      const approvedPlan = options?.planBlockId
        ? current.blocks.find(
            (block) =>
              block.id === options.planBlockId && block.role === "plan",
          )
        : undefined;
      if (intent === "build" && !approvedPlan?.text.trim()) return false;
      if (options?.queuedMessageId) {
        const mode =
          options.followUpBehavior === "steer" ? "steer" : "dispatch";
        if (!queuedMessageForSubmit(current, options.queuedMessageId, mode)) {
          return false;
        }
      }
      const handoffCard =
        options && "handoffCard" in options
          ? options.handoffCard
          : current.handoffCard;
      if (!text.trim() && attachments.length === 0 && !handoffCard) {
        return false;
      }
      if (isPreparingHandoff(current)) return false;
      saveRecentModelChoice(current.harness, current.model);
      const initialWorkCwd = sessionWorkCwd(current);
      const createDraftWorktree =
        !current.worktreeCwd && current.workspaceMode === "worktree";
      const accountProvider = supportsProviderAccounts(current.harness)
        ? current.harness
        : undefined;
      const providerAccountId = accountProvider
        ? (current.providerAccountId ??
          selectedProviderAccountId(accountProvider, current.cwd))
        : undefined;
      if (
        accountProvider &&
        providerAccountId &&
        !providerAccountExists(accountProvider, providerAccountId)
      ) {
        enqueueHarnessEvent(sessionId, {
          type: "session.error",
          message:
            "This conversation uses a removed provider account. Switch accounts from the usage control to start a new conversation.",
        });
        flushHarnessEvents();
        return false;
      }
      const submittedText = intent === "build" ? "Build approved plan" : text;
      const rawCommand = isNativeCommandPrompt(submittedText, current.harness);
      const ciContext = options?.ciRepair?.prompt ?? options?.ciContext;
      const harnessText =
        options?.ciRepair?.prompt ??
        (rawCommand ? submittedText : submittedText.trim());

      const pendingSwitch =
        current.pendingSwitch && current.pendingSwitch.from !== current.harness
          ? current.pendingSwitch
          : null;

      if (current.busy && !pendingSwitch) {
        const followUpBehavior =
          current.worktreePreparing || intent === "plan"
            ? "queue"
            : // The agent has yielded and only background work is left, which
              // may never end (a dev server). Queuing would park the message
              // behind it, so hand it to the agent now.
              current.backgroundTasks?.length
              ? "steer"
              : (options?.followUpBehavior ?? loadFollowUpBehavior());
        if (followUpBehavior === "queue") {
          setSessions((prev) =>
            prev.map((s) =>
              s.id === sessionId
                ? {
                    ...s,
                    handoffCard: rawCommand ? s.handoffCard : undefined,
                    queuedMessages: [
                      ...(s.queuedMessages ?? []),
                      {
                        id: crypto.randomUUID(),
                        text,
                        attachments,
                        handoffCard,
                        intent,
                      },
                    ],
                    queueStatus:
                      s.queueStatus === "paused" ? "paused" : "active",
                  }
                : s,
            ),
          );
          dismissNoticesForContinuedSession(sessionId);
          return true;
        }
        if (
          !isLiveHarness(current.harness) ||
          !canSteerHarness(current.harness)
        ) {
          // Harnesses that cannot steer (fx) used to drop the message on the
          // floor here, so a follow-up sent mid-turn just vanished. Say so.
          enqueueHarnessEvent(sessionId, {
            type: "status",
            text: `${current.harness} cannot take a follow-up mid-turn — wait for this turn to finish, or stop it first.`,
          });
          flushHarnessEvents();
          return false;
        }
        dismissNoticesForContinuedSession(sessionId);
        const visible = displayAttachments(attachments);
        const nextSessions = sessionsRef.current.map((s) => {
          if (s.id !== sessionId) return s;
          let next: Session = {
            ...s,
            handoffCard: rawCommand ? s.handoffCard : undefined,
          };
          if (options?.queuedMessageId) {
            next = dequeueQueuedMessage(next, options.queuedMessageId);
          }
          return appendSteerUser(next, submittedText, visible);
        });
        sessionsRef.current = nextSessions;
        setSessions(nextSessions);
        void (async () => {
          try {
            const prepared = await prepareAttachments(attachments);
            const prompt = await preparePrompt(harnessText, {
              harness: current.harness,
              sessionId,
              cwd: initialWorkCwd,
            });
            await steerHarnessTurn({
              harness: current.harness,
              sessionId,
              cwd: initialWorkCwd,
              model: current.model,
              modelSettings: current.modelSettings,
              text: prompt,
              attachments: prepared,
            });
          } catch (error: unknown) {
            const message =
              error instanceof Error
                ? error.message
                : `${current.harness} could not steer the active turn`;
            enqueueHarnessEvent(sessionId, {
              type: "session.error",
              message,
            });
            flushHarnessEvents();
          }
        })();
        return true;
      }

      if (
        !options?.projectLocationReady &&
        looksLikeProject(current.cwd) &&
        !current.worktreeCwd
      ) {
        const key = pathKey(current.cwd);
        let sync = projectLocationSyncs.current.get(key);
        if (!sync) {
          sync = synchronizeProjectLocation(current.cwd);
          projectLocationSyncs.current.set(key, sync);
          void sync.then(
            () => projectLocationSyncs.current.delete(key),
            () => projectLocationSyncs.current.delete(key),
          );
        }
        return submitAfterProjectSync({
          cwd: current.cwd,
          sync,
          applyLocationChange: applyProjectLocationChange,
          submit: async () => {
            const accepted = await submitAfterProjectSyncRef.current(
              sessionId,
              text,
              attachments,
              { ...options, projectLocationReady: true },
            );
            if (!accepted) {
              editedResend?.reject();
              options?.onSettled?.({
                status: "failed",
                text: "",
                error:
                  "The chat became unavailable before the request could start. Try again when it is ready.",
              });
            }
            return accepted;
          },
          onError: (error: unknown) => {
            const message =
              error instanceof Error
                ? error.message
                : "The project folder could not be opened.";
            enqueueHarnessEvent(sessionId, {
              type: "session.error",
              message,
            });
            flushHarnessEvents();
            editedResend?.reject();
            options?.onSettled?.({
              status: "failed",
              text: "",
              error: message,
            });
          },
        });
      }

      const gen = (turnGen.current.get(sessionId) ?? 0) + 1;
      turnGen.current.set(sessionId, gen);
      const isFirstTurn = current.blocks.length === 0;
      const placeholderTitle =
        canReplaceSessionTitle(
          current.title,
          current.harness,
          HARNESS_LABEL[current.harness],
        ) || !!draftBlock;
      const titleSeed =
        isFirstTurn &&
        placeholderTitle
          ? titleFromPrompt(submittedText, current.harness, attachments)
          : current.title;
      const visible = displayAttachments(attachments);
      const card =
        options?.secondOpinion ??
        (handoffCard ? handoffTurnCard(handoffCard) : undefined);
      const visibleText =
        card?.kind === "handoff"
          ? submittedText
          : card
            ? SECOND_OPINION_TITLE
            : submittedText;
      const cards = {
        ...(rawCommand ? undefined : userTurnCards(card)),
        ...(ciContext ? { ciContext } : {}),
        ...(intent === "plan" ? { intent } : {}),
      };
      const live = isLiveHarness(current.harness);
      const queuedHandoff =
        live && !pendingSwitch ? pendingHandoff(current) : null;

      if (pendingSwitch && current.busy) {
        void cancelHarnessTurn(pendingSwitch.from, sessionId);
      }

      dismissNoticesForContinuedSession(sessionId);
      const commitSubmittedTurn = () => {
        setSessions((prev) =>
          prev.map((s) => {
            if (s.id !== sessionId) return s;
            const draftRemoved = draftBlock
              ? {
                  ...s,
                  blocks: s.blocks.filter(
                    (block) => block.id !== draftBlock.id,
                  ),
                }
              : s;
            const selected = options?.buildTarget
              ? withPlanBuildTarget(draftRemoved, options.buildTarget)
              : draftRemoved;
            const titled = isFirstTurn ? titleSeed : selected.title;
            let next: Session = {
              ...selected,
              providerAccountId,
              usageLimit: undefined,
              worktreePreparing: createDraftWorktree
                ? true
                : selected.worktreePreparing,
              handoffCard:
                rawCommand || options?.ciRepair ? s.handoffCard : undefined,
            };
            if (editedResend) {
              next = editedResend.replace(next);
            }
            if (approvedPlan && intent === "build") {
              next = {
                ...next,
                blocks: next.blocks.map((block) =>
                  block.id === approvedPlan.id && block.role === "plan"
                    ? {
                        ...block,
                        plan: {
                          ...(block.plan ?? { status: "ready" as const }),
                          status: "building" as const,
                          approvedText: block.text,
                        },
                      }
                    : block,
                ),
              };
            }
            if (options?.queuedMessageId) {
              next = dequeueQueuedMessage(next, options.queuedMessageId);
            }
            if (!live) {
              return {
                ...next,
                title: titled,
                pendingSwitch: undefined,
                busy: false,
                blocks: [
                  ...next.blocks,
                  {
                    id: crypto.randomUUID(),
                    role: "user",
                    text: visibleText,
                    ...(visible.length > 0 ? { attachments: visible } : {}),
                    ...cards,
                  },
                  {
                    id: crypto.randomUUID(),
                    role: "system",
                    text: `${next.harness} is not connected yet — install and sign in to that provider, then retry.`,
                    notice: "error",
                  },
                ],
              };
            }
            if (pendingSwitch) {
              const sealed = stopStreaming({
                ...next,
                title: titled,
                pendingSwitch: undefined,
              });
              return appendUser(
                appendPreparingHandoff(
                  sealed,
                  pendingSwitch.from,
                  next.harness,
                ),
                visibleText,
                visible,
                cards,
              );
            }
            return appendUser(
              { ...next, title: titled },
              visibleText,
              visible,
              cards,
            );
          }),
        );
      };
      if (!options?.resendEdited) {
        flushSync(commitSubmittedTurn);
      }

      const launchTitleGeneration = (workCwd: string) => {
        if (
          !live ||
          !shouldGenerateSessionTitle(isFirstTurn, placeholderTitle)
        ) {
          return;
        }
        const titleMessage =
          harnessText || attachments.map((file) => file.name).join(", ");
        void generateHarnessTitle(current.harness, {
          sessionId,
          cwd: workCwd,
          message: titleMessage,
          providerAccountId,
        })
          .then(async (generated) => {
            const linkedWorkItem = await resolveLinkedWorkItem(
              titleMessage,
              workCwd,
              generated?.workItem ?? null,
            );
            if (!generated && !linkedWorkItem) return;
            setSessions((prev) =>
              prev.map((s) => {
                if (s.id !== sessionId) return s;
                let next = s;
                if (
                  generated &&
                  canReplaceSessionTitle(s.title, s.harness, titleSeed)
                ) {
                  next = {
                    ...next,
                    title: formatSessionTitle(s.harness, generated.title),
                  };
                }
                if (linkedWorkItem && !next.linkedWorkItem) {
                  next = { ...next, linkedWorkItem };
                }
                return next;
              }),
            );
          })
          .catch(() => undefined);
      };

      if (!live) {
        if (pendingSwitch) {
          void forgetHarnessSession(pendingSwitch.from, sessionId);
        }
        editedResend?.reject();
        options?.onSettled?.({
          status: "failed",
          text: "",
          error: "Harness is not connected",
        });
        return true;
      }
      if (editedResend && canRewindHarnessLastTurn(current.harness)) {
        editedResends.start(sessionId);
        const locked = sessionsRef.current.map((session) =>
          session.id === sessionId ? { ...session, busy: true } : session,
        );
        sessionsRef.current = locked;
        syncDockBadge(locked);
        setSessions(locked);
      }


      let turnText = "";
      let turnOutcome: SubmissionOutcome = {
        status: "failed",
        text: "",
        error: "Turn did not complete",
      };
      void (async () => {
        let workCwd = initialWorkCwd;
        if (createDraftWorktree) {
          const tree = await createWorktree(
            current.cwd,
            temporaryWorktreeBranchName(),
            current.worktreeBase || "HEAD",
            false,
          );
          workCwd = tree.path;
          setSessions((prev) =>
            prev.map((session) =>
              session.id === sessionId
                ? {
                    ...session,
                    worktreeCwd: tree.path,
                    branch: tree.branch ?? undefined,
                    workspaceMode: undefined,
                    worktreeBase: undefined,
                    worktreePreparing: undefined,
                  }
                : session,
            ),
          );
          notifyReviewChanged(sessionId);

          const branchMessage =
            harnessText || attachments.map((file) => file.name).join(", ");
          void generateHarnessBranchName(
            pickTextHarness(current.harness),
            workCwd,
            branchMessage,
          )
            .then(async (fragment) => {
              const branch = fragment ? namedWorktreeBranch(fragment) : null;
              if (!branch) return;
              const renamed = await renameWorktreeBranch(
                current.cwd,
                tree.path,
                branch,
              );
              setSessions((prev) =>
                prev.map((session) =>
                  session.id === sessionId &&
                  pathKey(sessionWorkCwd(session)) === pathKey(tree.path)
                    ? { ...session, branch: renamed.branch ?? undefined }
                    : session,
                ),
              );
            })
            .catch(() => undefined);
        }
        launchTitleGeneration(workCwd);
        if (turnGen.current.get(sessionId) !== gen) return;
        let wrap = handoffCard
          ? {
              from: handoffCard.from,
              to: current.harness,
              text: handoffCard.brief,
            }
          : queuedHandoff;
        if (pendingSwitch) {
          let agentText = "";
          if (
            shouldAskOutgoingAgent(current) &&
            isLiveHarness(pendingSwitch.from)
          ) {
            try {
              agentText = await requestOutgoingHandoff({
                harness: pendingSwitch.from,
                sessionId,
                cwd: workCwd,
                model: pendingSwitch.fromModel,
                modelSettings: pendingSwitch.fromSettings,
                providerAccountId: pendingSwitch.fromProviderAccountId,
                userRequest: text,
              });
            } catch {
              agentText = "";
            }
          }
          if (turnGen.current.get(sessionId) !== gen) return;
          const latest = sessionsRef.current.find((s) => s.id === sessionId);
          const brief = chooseHandoffBrief(agentText, latest ?? current, text);
          await forgetHarnessSession(pendingSwitch.from, sessionId);
          if (turnGen.current.get(sessionId) !== gen) return;
          wrap = { from: pendingSwitch.from, to: current.harness, text: brief };
        }

        const revealHandoff = (brief: string) => {
          setSessions((prev) =>
            prev.map((s) => {
              if (s.id !== sessionId || !isPreparingHandoff(s)) return s;
              return { ...completeHandoff(s, brief), busy: true };
            }),
          );
        };

        const planEventKey = planTurnKey(gen);
        let nativePlanSeen = false;
        let providerFailureSeen = false;
        const routePlanEvent = (event: HarnessEvent): HarnessEvent | null => {
          if (event.type === "session.error") providerFailureSeen = true;
          if (intent !== "plan") return event;
          if (event.type === "plan") {
            nativePlanSeen = true;
            return {
              ...event,
              key: planEventKey,
            };
          }
          return event;
        };

        const pendingEditedEvents: HarnessEvent[] = [];
        const applyTurnEvent = (event: HarnessEvent) => {
          if (options?.onSettled && event.type === "message.delta")
            turnText = (turnText + event.text).slice(-20_000);
          if (options?.onSettled && event.type === "message.completed")
            turnText += "\n";
          if (event.type === "session.error")
            turnOutcome.error = event.message;
          if (
            wrap &&
            (event.type === "session.started" ||
              event.type === "session.providerBound")
          ) {
            revealHandoff(wrap.text);
          }
          nudgeOpenEditors(event, workCwd);
          trackSessionEdits(sessionId, workCwd, event);
          const routed = routePlanEvent(event);
          if (routed) enqueueHarnessEvent(sessionId, routed);
        };
        const routeTurnEvent = (event: HarnessEvent) => {
          if (turnGen.current.get(sessionId) !== gen) return;
          if (editedResend && !editedResend.isAccepted()) {
            pendingEditedEvents.push(event);
            return;
          }
          applyTurnEvent(event);
        };
        const acceptEditedResend = () => {
          if (!editedResend || editedResend.isAccepted()) return;
          flushSync(commitSubmittedTurn);
          editedResend.markAccepted();
          for (const event of pendingEditedEvents) applyTurnEvent(event);
          pendingEditedEvents.length = 0;
        };
        const recoverEditedResend = () => {
          if (!editedResend || editedResend.isAccepted()) return;
          pendingEditedEvents.length = 0;
          const previous = sessionsRef.current.find(
            (session) => session.id === sessionId,
          );
          const recovered = previous
            ? editedResend.recoverAfterFailure(previous)
            : undefined;
          flushSync(() => {
            setSessions((prev) =>
              prev.map((session) =>
                session.id === sessionId && recovered ? recovered : session,
              ),
            );
          });
        };

        await beginSessionTurn(sessionId, workCwd).catch(() => undefined);
        if (turnGen.current.get(sessionId) !== gen) return;
        let buildSucceeded = false;
        try {
          const prepared = await prepareAttachments(attachments);
          const prompt =
            intent === "build" && approvedPlan
              ? buildPlanPrompt(approvedPlan.text)
              : await preparePrompt(harnessText, {
                  harness: current.harness,
                  sessionId,
                  cwd: workCwd,
                });
          const turnPrompt =
            intent === "plan" && !rawCommand ? planTurnPrompt(prompt) : prompt;
          const earlier = queuedHandoff
            ? userMessagesAfterHandoff(current)
            : [];
          if (editedResend && canRewindHarnessLastTurn(current.harness)) {
            try {
              await rewindHarnessLastTurn({
                harness: current.harness,
                sessionId,
                cwd: workCwd,
                model: current.model,
                modelSettings: current.modelSettings,
                runtimeMode: current.runtimeMode,
                ...(editedProviderTurnId
                  ? { providerTurnId: editedProviderTurnId }
                  : {}),
                onEvent: (event) => {
                  if (turnGen.current.get(sessionId) !== gen) return;
                  enqueueHarnessEvent(sessionId, event);
                },
              });
            } catch (error) {
              flushHarnessEvents();
              editedResend.reject();
              throw error;
            }
            editedResend.markProviderRewound();
            flushHarnessEvents();
            if (turnGen.current.get(sessionId) !== gen) {
              const latest = sessionsRef.current.find(
                (session) => session.id === sessionId,
              );
              if (
                !latest ||
                (!latest.busy &&
                  latest.providerSessionId === current.providerSessionId)
              ) {
                await forgetHarnessSession(current.harness, sessionId);
                if (latest) {
                  setSessions((prev) =>
                    prev.map((session) =>
                      session.id === sessionId &&
                      session.providerSessionId === current.providerSessionId
                        ? { ...session, providerSessionId: undefined }
                        : session,
                    ),
                  );
                }
              }
              recoverEditedResend();
              return;
            }
          }
          const sendTurn = (text: string, turnAttachments = prepared) =>
            sendHarnessTurn({
              harness: current.harness,
              sessionId,
              cwd: workCwd,
              model: current.model,
              modelSettings: current.modelSettings,
              providerAccountId,
              runtimeMode: current.runtimeMode,
              intent,
              text,
              attachments: turnAttachments,
              ...(editedResend ? { onAccepted: acceptEditedResend } : {}),
              onEvent: routeTurnEvent,
            });
          const sendText =
            wrap && !rawCommand
              ? wrapHandoffPrompt(
                  wrap.text,
                  wrap.from,
                  turnPrompt.trim() || CONTINUE_PROMPT,
                  earlier,
                )
              : turnPrompt;
          await sendTurn(sendText);
          acceptEditedResend();
          if (turnGen.current.get(sessionId) !== gen) return;
          if (wrap) {
            setSessions((prev) =>
              prev.map((s) => {
                if (s.id !== sessionId) return s;
                const ready = isPreparingHandoff(s)
                  ? completeHandoff(s, wrap.text)
                  : s;
                // A command owns its arguments; deliver the recap with the next chat prompt.
                return rawCommand ? ready : consumeHandoff(ready);
              }),
            );
          }
          buildSucceeded = true;
        } catch (error: unknown) {
          recoverEditedResend();
          if (turnGen.current.get(sessionId) !== gen) return;
          if (wrap) revealHandoff(wrap.text);
          const message =
            error instanceof Error
              ? error.message
              : String(error) || `${current.harness} adapter failed`;
          turnOutcome.error = message;
          if (!providerFailureSeen) {
            enqueueHarnessEvent(sessionId, {
              type: "session.error",
              message,
            });
          }
          providerFailureSeen = true;
        } finally {
          if (turnGen.current.get(sessionId) !== gen) return;
          flushHarnessEvents();
          turnOutcome = {
            status:
              providerFailureSeen ||
              isProviderFailureText(turnText) ||
              !buildSucceeded
                ? "failed"
                : "completed",
            text: turnText.trim(),
            ...(providerFailureSeen ? { error: turnOutcome.error } : {}),
          };
          // A failed provider can leave its process alive with a dead event
          // stream or poisoned turn state. Park it now; the next prompt will
          // reconnect and resume through a fresh transport.
          if (providerFailureSeen) {
            await stopHarnessSession(current.harness, sessionId).catch(
              () => undefined,
            );
          }
          await flushSessionCheckpoint(sessionId);
          setSessions((prev) =>
            prev.map((s) => {
              if (s.id !== sessionId) return s;
              const stopped = stopStreaming(s);
              const providerFailed =
                providerFailureSeen ||
                isProviderFailureText(lastAssistantTextInTurn(stopped));
              const finalized =
                intent === "plan" && !nativePlanSeen && !providerFailed
                  ? promoteLastAssistantToPlan(stopped, planEventKey)
                  : stopped;
              return approvedPlan && intent === "build"
                ? withPlanStatus(
                    finalized,
                    approvedPlan.id,
                    buildSucceeded && !providerFailed ? "built" : "ready",
                  )
                : finalized;
            }),
          );
          // Next tick: the flush above has rendered by then, so the banner
          // quotes the reply's final text rather than the previous batch.
          window.setTimeout(() => {
            const finished = sessionsRef.current.find(
              (s) => s.id === sessionId,
            );
            const visible = sessionId === activeSessionIdRef.current;
            if (finished) void announceSessionFinished(finished, visible);
          }, 0);
          notifyReviewChanged(sessionId);
          notifyGitChanged();
          nudgeWorkspace(workCwd);
          nudgeWatchedFiles();
          window.setTimeout(() => nudgeWatchedFiles(), 150);
        }
      })()
        .catch((error: unknown) => {
          const message =
            error instanceof Error ? error.message : String(error);
          turnOutcome = { status: "failed", text: turnText, error: message };
          if (turnGen.current.get(sessionId) === gen) {
            enqueueHarnessEvent(sessionId, {
              type: "session.error",
              message,
            });
            flushHarnessEvents();
            setSessions((prev) =>
              prev.map((session) =>
                session.id === sessionId
                  ? { ...stopStreaming(session), worktreePreparing: undefined }
                  : session,
              ),
            );
          }
        })
        .finally(() => {
          editedResend?.reject();
          if (editedResend) editedResends.finish(sessionId);
          options?.onSettled?.(
            turnGen.current.get(sessionId) !== gen
              ? { status: "cancelled", text: turnText }
              : turnOutcome,
          );
        });
      return true;
    },
    [
      applyProjectLocationChange,
      dismissNoticesForContinuedSession,
      enqueueHarnessEvent,
      flushHarnessEvents,
    ],
  );
  submitAfterProjectSyncRef.current = submitSession;
  // Interactive callers use the immediate result to clear their composer. The
  // queued-launch receiver uses submitSession to await the actual acceptance.
  const onSubmit = useCallback(
    (...args: Parameters<Submit>): boolean => {
      const result = submitSession(...args);
      if (typeof result === "boolean") return result;
      // Deferred errors have already been displayed by submitAfterProjectSync.
      void result.catch(() => undefined);
      return true;
    },
    [submitSession],
  );

  const onUpdatePlan = useCallback(
    (sessionId: string, blockId: string, text: string) => {
      setSessions((prev) =>
        prev.map((session) => {
          if (session.id !== sessionId || session.busy) return session;
          return {
            ...session,
            blocks: session.blocks.map((block) => {
              if (
                block.id !== blockId ||
                block.role !== "plan" ||
                block.plan?.status === "streaming" ||
                block.plan?.status === "building" ||
                block.plan?.status === "built"
              ) {
                return block;
              }
              const originalText = block.plan?.originalText ?? block.text;
              return {
                ...block,
                text,
                plan: {
                  ...(block.plan ?? { status: "ready" as const }),
                  status: "ready" as const,
                  originalText,
                  edited: text !== originalText,
                },
              };
            }),
          };
        }),
      );
    },
    [],
  );

  const onBuildPlan = useCallback(
    (sessionId: string, blockId: string, target?: PlanBuildTarget) => {
      const session = sessionsRef.current.find(
        (entry) => entry.id === sessionId,
      );
      const block = session?.blocks.find((entry) => entry.id === blockId);
      if (
        !session ||
        session.busy ||
        block?.role !== "plan" ||
        !block.text.trim() ||
        block.plan?.status === "streaming" ||
        block.plan?.status === "building" ||
        block.plan?.status === "built"
      ) {
        return;
      }
      if (target && session.modelSettings) {
        saveLastModelSettings(session.modelSettings, "fill");
      }
      onSubmit(sessionId, "Build approved plan", [], {
        intent: "build",
        planBlockId: blockId,
        buildTarget: target,
      });
    },
    [onSubmit],
  );

  useEffect(() => {
    const timers: number[] = [];
    const scheduled = new Set<string>();
    for (const session of sessions) {
      const queued = session.queuedMessages ?? [];
      if (session.busy || queued.length === 0) continue;

      if (session.queueStatus === "resuming") {
        setSessions((prev) =>
          prev.map((entry) =>
            entry.id === session.id
              ? { ...entry, queueStatus: "active" }
              : entry,
          ),
        );
        continue;
      }
      if (
        !canDispatchQueuedHead(session) ||
        queueDispatchingRef.current.has(session.id)
      ) {
        continue;
      }

      const next = queued[0];
      if (!next) continue;
      queueDispatchingRef.current.add(session.id);
      scheduled.add(session.id);
      timers.push(
        window.setTimeout(() => {
          queueDispatchingRef.current.delete(session.id);
          const latest = sessionsRef.current.find(
            (entry) => entry.id === session.id,
          );
          const head = latest?.queuedMessages?.[0];
          if (
            !latest ||
            !head ||
            head.id !== next.id ||
            !canDispatchQueuedHead(latest)
          ) {
            return;
          }
          onSubmit(session.id, head.text, head.attachments, {
            queuedMessageId: head.id,
            handoffCard: head.handoffCard,
            intent: head.intent,
          });
        }, 0),
      );
    }
    return () => {
      for (const timer of timers) window.clearTimeout(timer);
      for (const id of scheduled) queueDispatchingRef.current.delete(id);
    };
  }, [onSubmit, sessions]);

  const onDeleteQueuedMessage = useCallback(
    (sessionId: string, messageId: string) => {
      setSessions((prev) =>
        prev.map((session) =>
          session.id === sessionId
            ? dequeueQueuedMessage(session, messageId)
            : session,
        ),
      );
    },
    [],
  );

  const onQueuedMessageEditingChange = useCallback(
    (sessionId: string, messageId?: string) => {
      setSessions((prev) =>
        prev.map((session) =>
          session.id === sessionId
            ? { ...session, editingQueuedMessageId: messageId }
            : session,
        ),
      );
    },
    [],
  );

  const onEditQueuedMessage = useCallback(
    (sessionId: string, messageId: string, text: string) => {
      setSessions((prev) =>
        prev.map((session) =>
          session.id === sessionId
            ? {
                ...session,
                queuedMessages: session.queuedMessages?.map((message) =>
                  message.id === messageId ? { ...message, text } : message,
                ),
                editingQueuedMessageId: undefined,
              }
            : session,
        ),
      );
    },
    [],
  );

  const onSteerQueuedMessage = useCallback(
    (sessionId: string, messageId: string) => {
      const session = sessionsRef.current.find(
        (entry) => entry.id === sessionId,
      );
      const message = session
        ? queuedMessageForSubmit(session, messageId, "steer")
        : undefined;
      if (!session || !message) return;
      onSubmit(sessionId, message.text, message.attachments, {
        followUpBehavior: "steer",
        queuedMessageId: message.id,
        handoffCard: message.handoffCard,
        intent: message.intent,
      });
    },
    [onSubmit, enqueueHarnessEvent, flushHarnessEvents],
  );

  const onResumeQueue = useCallback(
    (sessionId: string) => {
      const session = sessionsRef.current.find(
        (entry) => entry.id === sessionId,
      );
      if (
        !session ||
        session.busy ||
        session.queueStatus !== "paused" ||
        !session.queuedMessages?.length
      ) {
        return;
      }
      setSessions((prev) =>
        prev.map((entry) =>
          entry.id === sessionId
            ? { ...entry, queueStatus: "resuming" }
            : entry,
        ),
      );
      onSubmit(sessionId, CONTINUE_PROMPT, [], {
        followUpBehavior: "steer",
      });
    },
    [onSubmit],
  );

  const onUsageLimitDismiss = useCallback((sessionId: string) => {
    setSessions((prev) =>
      prev.map((session) =>
        session.id === sessionId && session.usageLimit
          ? { ...session, usageLimit: undefined }
          : session,
      ),
    );
  }, []);

  const onUsageLimitResumeAtReset = useCallback(
    (sessionId: string, enabled: boolean) => {
      setSessions((prev) =>
        prev.map((session) =>
          session.id === sessionId && session.usageLimit
            ? {
                ...session,
                usageLimit: { ...session.usageLimit, resumeAtReset: enabled },
              }
            : session,
        ),
      );
    },
    [],
  );

  const onUsageLimitResume = useCallback(
    (sessionId: string) => {
      const session = sessionsRef.current.find(
        (entry) => entry.id === sessionId,
      );
      if (!session?.usageLimit || session.busy) return;
      onUsageLimitDismiss(sessionId);
      onSubmit(sessionId, CONTINUE_PROMPT);
    },
    [onSubmit, onUsageLimitDismiss],
  );

  const [usageLimitTick, setUsageLimitTick] = useState(0);
  useEffect(() => {
    const now = Date.now();
    const timers: number[] = [];
    const scheduled = new Set<string>();
    let nextCheck = Number.POSITIVE_INFINITY;
    for (const session of sessions) {
      const limit = session.usageLimit;
      if (!limit?.resumeAtReset || limit.resetsAt == null) continue;
      if (!usageLimitResumeDue(session, now)) {
        nextCheck = Math.min(
          nextCheck,
          limit.resetsAt + USAGE_LIMIT_RESUME_GRACE_MS - now,
        );
        continue;
      }
      if (usageResumingRef.current.has(session.id)) continue;
      usageResumingRef.current.add(session.id);
      scheduled.add(session.id);
      timers.push(
        window.setTimeout(() => {
          usageResumingRef.current.delete(session.id);
          const latest = sessionsRef.current.find(
            (entry) => entry.id === session.id,
          );
          if (latest && usageLimitResumeDue(latest, Date.now())) {
            onUsageLimitResume(session.id);
          }
        }, 0),
      );
    }
    if (Number.isFinite(nextCheck)) {
      // Re-check every minute at most: timers drift while the machine sleeps.
      timers.push(
        window.setTimeout(
          () => setUsageLimitTick((tick) => tick + 1),
          Math.max(1_000, Math.min(nextCheck, 60_000)),
        ),
      );
    }
    return () => {
      for (const timer of timers) window.clearTimeout(timer);
      for (const id of scheduled) usageResumingRef.current.delete(id);
    };
  }, [onUsageLimitResume, sessions, usageLimitTick]);

  // The stream does not always say when the limit resets; ask the provider.
  useEffect(() => {
    for (const session of sessions) {
      const limit = session.usageLimit;
      if (!limit || limit.resetsAt != null) continue;
      if (usageResetLookups.current.has(limit)) continue;
      const fetchLimits =
        session.harness === "claude"
          ? fetchClaudeRateLimits
          : session.harness === "codex"
            ? fetchCodexRateLimits
            : undefined;
      if (!fetchLimits) continue;
      usageResetLookups.current.add(limit);
      void fetchLimits(session.providerAccountId).then((limits) => {
        const resetsAt = exhaustedWindowResetAt(limits);
        if (resetsAt == null) return;
        setSessions((prev) =>
          prev.map((entry) =>
            entry.id === session.id && entry.usageLimit === limit
              ? { ...entry, usageLimit: { ...limit, resetsAt } }
              : entry,
          ),
        );
      });
    }
  }, [sessions]);

  const onSecondOpinion = useCallback(
    (sourceId: string, target: ModelTarget, turn: Block[]) => {
      const source = sessionsRef.current.find(
        (session) => session.id === sourceId,
      );
      if (!source || source.worktreeRemoved) return;
      const { harness, model, modelSettings } = target;
      const cwd = sessionWorkCwd(source);
      const from = harnessForTurn(source.blocks, turn, source.harness);
      const request = buildSecondOpinionRequest({
        from,
        to: harness,
        turn,
        cwd,
      });
      const session = {
        ...newSession(harness, source.cwd, model, source.runtimeMode),
        worktreeCwd: source.worktreeCwd,
        branch: source.branch,
        modelSettings: mergeModelSettings(
          resolveModel(harness, model),
          modelSettings,
        ),
        title: formatSessionTitle(harness, SECOND_OPINION_TITLE),
      };
      openSessionBeside(sourceId, session, source.cwd);
      onSubmit(session.id, request.prompt, [], request.options);
    },
    [onSubmit, openSessionBeside],
  );

  const onHandoff = useCallback(
    (sourceId: string, target: ModelTarget, turn: Block[]) => {
      const source = sessionsRef.current.find(
        (session) => session.id === sourceId,
      );
      if (!source || source.worktreeRemoved) return;
      const { harness, model, modelSettings } = target;
      const cwd = sessionWorkCwd(source);
      const from = harnessForTurn(source.blocks, turn, source.harness);
      const sliced = sessionThroughTurn(source, turn);
      const userRequest = turnUserRequest(turn);
      const files = turnEditedFiles(sliced.blocks, cwd);
      const display = sessionDisplayTitle(source.title, source.harness);
      const session = {
        ...newSession(harness, source.cwd, model, source.runtimeMode),
        worktreeCwd: source.worktreeCwd,
        branch: source.branch,
        modelSettings: mergeModelSettings(
          resolveModel(harness, model),
          modelSettings,
        ),
        title: formatSessionTitle(
          harness,
          display === "New session" ? HANDOFF_TITLE : display,
        ),
        handoffCard: buildHandoffComposerCard({
          from,
          to: harness,
          brief: buildDeterministicHandoff(sliced),
          userRequest,
          files,
        }),
      };
      openSessionBeside(sourceId, session, source.cwd, true);
    },
    [openSessionBeside],
  );

  const autoContinueKey = sessions
    .filter(
      (session) => canAutoContinue(session) && isLiveHarness(session.harness),
    )
    .map((session) => session.id)
    .join("\n");

  useEffect(() => {
    if (!autoContinueKey) return;
    const ids = autoContinueKey.split("\n");
    // Delay past React StrictMode's dev remount so Continue is not claimed
    // against a discarded tree (sessionStorage also survives Vite reloads).
    const timer = window.setTimeout(() => {
      for (const id of ids) {
        const session = sessionsRef.current.find((entry) => entry.id === id);
        if (
          !session ||
          !canAutoContinue(session) ||
          !isLiveHarness(session.harness)
        ) {
          continue;
        }
        onSubmit(id, CONTINUE_PROMPT);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [autoContinueKey, onSubmit]);

  const onCompactContext = useCallback(
    (sessionId: string) => {
      const current = sessionsRef.current.find(
        (session) => session.id === sessionId,
      );
      if (!current || current.busy || current.worktreeRemoved) return false;
      if (!canCompactHarnessContext(current.harness)) {
        const unsupported = sessionsRef.current.map((session) =>
          session.id === sessionId
            ? applyHarnessEvent(session, {
                type: "status",
                text: `${HARNESS_TITLE[current.harness]} does not support manual context compaction.`,
              })
            : session,
        );
        sessionsRef.current = unsupported;
        syncDockBadge(unsupported);
        setSessions(unsupported);
        return true;
      }

      const gen = (turnGen.current.get(sessionId) ?? 0) + 1;
      turnGen.current.set(sessionId, gen);
      const workCwd = sessionWorkCwd(current);
      const started = sessionsRef.current.map((session) =>
        session.id === sessionId
          ? applyHarnessEvent(
              { ...session, busy: true },
              { type: "status", text: "Compacting context…" },
            )
          : session,
      );
      sessionsRef.current = started;
      syncDockBadge(started);
      setSessions(started);

      void (async () => {
        try {
          await compactHarnessContext({
            harness: current.harness,
            sessionId,
            cwd: workCwd,
            model: current.model,
            modelSettings: current.modelSettings,
            providerAccountId: supportsProviderAccounts(current.harness)
              ? (current.providerAccountId ??
                selectedProviderAccountId(current.harness, current.cwd))
              : undefined,
            runtimeMode: current.runtimeMode,
            onEvent: (event) => {
              if (turnGen.current.get(sessionId) !== gen) return;
              enqueueHarnessEvent(sessionId, event);
            },
          });
          if (turnGen.current.get(sessionId) !== gen) return;
          enqueueHarnessEvent(sessionId, {
            type: "status",
            text: "Compacted context",
          });
        } catch (error: unknown) {
          if (turnGen.current.get(sessionId) !== gen) return;
          enqueueHarnessEvent(sessionId, {
            type: "session.error",
            message:
              error instanceof Error
                ? error.message
                : `${current.harness} could not compact this context`,
          });
        } finally {
          if (turnGen.current.get(sessionId) !== gen) return;
          flushHarnessEvents();
          const finished = sessionsRef.current.map((session) =>
            session.id === sessionId ? { ...session, busy: false } : session,
          );
          sessionsRef.current = finished;
          syncDockBadge(finished);
          setSessions(finished);
        }
      })();
      return true;
    },
    [enqueueHarnessEvent, flushHarnessEvents],
  );

  const onStop = useCallback(
    (sessionId: string) => {
      const session = sessionsRef.current.find((s) => s.id === sessionId);
      turnGen.current.set(sessionId, (turnGen.current.get(sessionId) ?? 0) + 1);
      flushHarnessEvents();
      if (session) {
        for (const id of sessionChildHarnesses(session)) {
          void cancelHarnessTurn(id, sessionId);
        }
      }
      setSessions((prev) =>
        prev.map((s) => {
          if (s.id !== sessionId) return s;
          const stopped = stopStreaming(s);
          const completed = isPreparingHandoff(stopped)
            ? completeHandoff(stopped, buildDeterministicHandoff(stopped))
            : stopped;
          const ready = { ...completed, worktreePreparing: undefined };
          return ready.queuedMessages?.length
            ? { ...ready, queueStatus: "paused" }
            : ready;
        }),
      );
      if (session) {
        notifyReviewChanged(sessionId);
        nudgeWorkspace(sessionWorkCwd(session));
        notifyGitChanged();
        nudgeWatchedFiles();
        window.setTimeout(() => nudgeWatchedFiles(), 150);
      } else {
        notifyReviewChanged(sessionId);
      }
    },
    [flushHarnessEvents],
  );

  return {
    onSubmit,
    onUpdatePlan,
    onBuildPlan,
    onDeleteQueuedMessage,
    onQueuedMessageEditingChange,
    onEditQueuedMessage,
    onSteerQueuedMessage,
    onResumeQueue,
    onUsageLimitDismiss,
    onUsageLimitResumeAtReset,
    onUsageLimitResume,
    onSecondOpinion,
    onHandoff,
    onCompactContext,
    onStop,
  };
}
