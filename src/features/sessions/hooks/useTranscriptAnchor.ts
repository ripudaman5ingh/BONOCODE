import { transcriptAnchorSetting } from "../../settings/model/appearance";

/** Prompt-to-top anchoring. Re-reads storage whenever saveTranscriptAnchor() announces a change. */
export function useTranscriptAnchor(): boolean {
  return transcriptAnchorSetting.use();
}
