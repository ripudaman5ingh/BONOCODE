import type { ComponentProps } from "react";
import type { LinkedWorkItemPanelState } from "../../features/github/hooks/useLinkedWorkItemPanels";
import { lazySurface } from "../../shared/ui/lazySurface";

const LinkedWorkItemPanel = lazySurface(async () => {
  const module = await import("../../features/github/ui/WorkItemDetail");
  return { default: module.LinkedWorkItemPanel };
});

type PanelProps = ComponentProps<typeof LinkedWorkItemPanel>;

type Props = {
  panels: ReadonlyMap<string, LinkedWorkItemPanelState>;
  /** The panel that belongs to the focused chat; only it can be visible. */
  activeSessionId: string | undefined;
  /** False while search or settings covers the workspace, or the Changes dock has the floor. */
  visible: boolean;
  repairSessions: PanelProps["repairSessions"];
  onRepairChecks: PanelProps["onRepairChecks"];
  onClose: (sessionId: string) => void;
  onOpenSession: (sessionId: string) => void | Promise<void>;
  onSendToChat: (sessionId: string, text: string) => Promise<void>;
};

/** Every open issue or PR panel stays mounted; one at most is shown. */
export function LinkedWorkItemPanels({
  panels,
  activeSessionId,
  visible,
  repairSessions,
  onRepairChecks,
  onClose,
  onOpenSession,
  onSendToChat,
}: Props) {
  return [...panels.values()].map((panel) => (
    <LinkedWorkItemPanel
      key={panel.sessionId}
      repairSessions={repairSessions}
      onRepairChecks={onRepairChecks}
      onOpenSession={(sessionId) => {
        onClose(panel.sessionId);
        return onOpenSession(sessionId);
      }}
      onSendToChat={(text) => onSendToChat(panel.sessionId, text)}
      target={panel.item}
      cwd={panel.cwd}
      visible={visible && activeSessionId === panel.sessionId}
      onClose={() => onClose(panel.sessionId)}
    />
  ));
}
