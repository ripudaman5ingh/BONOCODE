import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  githubWorkItem,
  type GithubWorkItem,
} from "../../features/github/model/githubTasks";
import {
  consumeInboxSelfActivity,
  subscribeInboxSelfActivity,
} from "../../features/github/model/inboxSelfActivity";
import {
  linkedSessionSeenAt,
  markLinkedSessionUpdateSeen,
  subscribeLinkedSessionSeen,
} from "../../features/github/model/linkedSessionSeen";
import {
  linkedSessionUpdates,
  linkedWorkItemTargets,
  linkedWorkItemUpdateKey,
  type LinkedSessionUpdate,
  type LinkedWorkItemTarget,
} from "../../features/github/model/linkedSessionUpdates";
import {
  allowsProjectNotificationIndicator,
  loadNotificationPreferences,
  subscribeNotificationPreferences,
  type NotificationSubject,
} from "../../features/notifications/model/notificationPreferences";
import { inboxNotificationProject } from "../../features/notifications/model/notificationProjects";
import type { SessionSummary } from "../../features/sessions/data/sessionStore";

const POLL_MS = 60_000;
const MAX_CONCURRENT_LOOKUPS = 3;

async function fetchLinkedItems(
  cwd: string,
  targets: readonly LinkedWorkItemTarget[],
): Promise<Array<readonly [string, GithubWorkItem]>> {
  const results: Array<readonly [string, GithubWorkItem]> = [];
  let cursor = 0;
  const worker = async () => {
    while (cursor < targets.length) {
      const target = targets[cursor++];
      if (!target) return;
      try {
        const item = await githubWorkItem(
          cwd,
          target.item.repo,
          target.item.kind,
          target.item.number,
          { force: true },
        );
        if (Number.isFinite(Date.parse(item.updatedAt))) {
          results.push([target.key, item]);
        }
      } catch {
        // The next poll retries this item.
      }
    }
  };
  await Promise.all(
    Array.from(
      { length: Math.min(MAX_CONCURRENT_LOOKUPS, targets.length) },
      worker,
    ),
  );
  return results;
}

function mergeSnapshots(
  current: ReadonlyMap<string, GithubWorkItem>,
  snapshots: readonly (readonly [string, GithubWorkItem])[],
): ReadonlyMap<string, GithubWorkItem> {
  let next: Map<string, GithubWorkItem> | undefined;
  for (const [key, item] of snapshots) {
    if (current.get(key)?.updatedAt === item.updatedAt) continue;
    next ??= new Map(current);
    next.set(key, item);
  }
  return next ?? current;
}

/**
 * A revision this app just made (push, PR action, comment) is acknowledged on
 * every linked chat for that item, so it is not announced back to its author.
 */
function acknowledgeSelfAuthored(
  sessions: readonly SessionSummary[],
  key: string,
  item: GithubWorkItem,
) {
  const linked = sessions.filter(
    (session) =>
      session.linkedWorkItem &&
      linkedWorkItemUpdateKey(session.linkedWorkItem) === key,
  );
  const selfAuthored = linked
    .map((session) =>
      consumeInboxSelfActivity({
        provider: "github",
        kind: item.kind,
        number: item.number,
        repo: item.repo,
        projectPath: session.cwd,
      }),
    )
    .some(Boolean);
  if (!selfAuthored) return;
  const updatedAt = Date.parse(item.updatedAt);
  for (const session of linked) markLinkedSessionUpdateSeen(session.id, updatedAt);
}

function linkedNotificationSubject(item: GithubWorkItem): NotificationSubject {
  return {
    projectId: inboxNotificationProject({ ...item, provider: "github" }).id,
    category: item.kind === "pr" ? "pullRequests" : "issues",
    occurredAt: Date.parse(item.updatedAt),
  };
}

export type LinkedWorkItemActivity = {
  linkedSessionUpdateIds: ReadonlySet<string>;
  linkedSessionUpdates: ReadonlyMap<string, LinkedSessionUpdate>;
};

/** Polls the GitHub issues and pull requests that chats are linked to. */
export function useLinkedWorkItemActivity(
  cwd: string,
  sessions: readonly SessionSummary[],
): LinkedWorkItemActivity {
  const [workItems, setWorkItems] = useState<
    ReadonlyMap<string, GithubWorkItem>
  >(() => new Map());
  const [linkedSeenRevision, setLinkedSeenRevision] = useState(0);
  const [notificationRevision, setNotificationRevision] = useState(0);
  const sessionsRef = useRef(sessions);
  const knownUpdatedAt = useRef(new Map<string, string>());
  const targetKey = linkedWorkItemTargets(sessions)
    .map((target) => target.key)
    .join("\0");

  useLayoutEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  useEffect(
    () =>
      subscribeLinkedSessionSeen(() =>
        setLinkedSeenRevision((revision) => revision + 1),
      ),
    [],
  );

  useEffect(
    () =>
      subscribeNotificationPreferences(() =>
        setNotificationRevision((revision) => revision + 1),
      ),
    [],
  );

  useEffect(() => {
    let cancelled = false;
    let pulling = false;
    let pullAgain = false;
    const pull = async () => {
      if (pulling) {
        pullAgain = true;
        return;
      }
      pulling = true;
      try {
        const targets = linkedWorkItemTargets(sessionsRef.current);
        const snapshots = await fetchLinkedItems(cwd, targets);
        if (cancelled) return;
        // Only a revision that moved since the last look can be self-authored.
        const changed = snapshots.filter(
          ([key, item]) => knownUpdatedAt.current.get(key) !== item.updatedAt,
        );
        for (const [key, item] of snapshots) {
          knownUpdatedAt.current.set(key, item.updatedAt);
        }
        for (const [key, item] of changed) {
          acknowledgeSelfAuthored(sessionsRef.current, key, item);
        }
        if (snapshots.length > 0) {
          setWorkItems((current) => mergeSnapshots(current, snapshots));
        }
      } finally {
        pulling = false;
        if (!cancelled && pullAgain) {
          pullAgain = false;
          void pull();
        }
      }
    };
    void pull();
    const stopSelfActivity = subscribeInboxSelfActivity(() => void pull());
    const timer = window.setInterval(() => void pull(), POLL_MS);
    const onVisible = () => {
      if (!document.hidden) void pull();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      stopSelfActivity();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [cwd, targetKey]);

  const updates = useMemo(
    () => linkedSessionUpdates(sessions, workItems, linkedSessionSeenAt),
    [sessions, workItems, linkedSeenRevision],
  );
  const linkedIndicators = useMemo(() => {
    const preferences = loadNotificationPreferences();
    return new Set(
      [...updates]
        .filter(([, update]) =>
          allowsProjectNotificationIndicator(
            linkedNotificationSubject(update.item),
            preferences,
          ),
        )
        .map(([id]) => id),
    );
  }, [updates, notificationRevision]);
  return {
    linkedSessionUpdates: updates,
    linkedSessionUpdateIds: linkedIndicators,
  };
}
