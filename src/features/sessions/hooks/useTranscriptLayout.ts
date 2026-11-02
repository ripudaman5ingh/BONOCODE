import {
  transcriptLayoutSetting,
  type TranscriptLayout,
} from "../../settings/model/appearance";

/** Transcript layout. Re-reads storage whenever saveTranscriptLayout() announces a change. */
export function useTranscriptLayout(): TranscriptLayout {
  return transcriptLayoutSetting.use();
}
