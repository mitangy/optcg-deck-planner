
import { api } from "../../api";
import { scanLog } from "./scanLog";
import type { ScanSample } from "../ui/scanTrayModel";

export const SAMPLE_UPLOAD_CHUNK = 40;

export async function uploadScanSamples(samples: ScanSample[]): Promise<void> {
  for (let i = 0; i < samples.length; i += SAMPLE_UPLOAD_CHUNK) {
    try {
      await api.uploadScanSamples(samples.slice(i, i + SAMPLE_UPLOAD_CHUNK));
    } catch (err) {
      scanLog("scan-share:error", err);
      return;
    }
  }
}
