/** Sharing the confirmed scan crops (#852): chunked, fire-and-forget upload. */

import { api } from "./api";
import { scanLog } from "./scanLog";
import type { ScanSample } from "./scanTrayModel";

/** The API accepts at most this many crops per request. */
export const SAMPLE_UPLOAD_CHUNK = 40;

/** Never throws: a failed upload only goes to the scan log and must not touch the add flow. */
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
