/** Diagnostic trail for the card scanner.
 *
 * Drag-and-drop fails in ways that leave no trace: if the browser refuses the
 * drop during negotiation, no handler runs at all. Recording each stage makes
 * the difference between "the drop never arrived" and "the drop arrived but
 * carried nothing" visible instead of inferred.
 */

export type ScanLogEntry = {
  /** Milliseconds since the log was first written to. */
  at: number;
  stage: string;
  detail: string;
};

const MAX_ENTRIES = 60;

const entries: ScanLogEntry[] = [];
const listeners = new Set<() => void>();
let origin = 0;

/** Record one step. Also mirrored to the console for devtools users. */
export function scanLog(stage: string, detail: unknown = ""): void {
  if (!origin) origin = Date.now();
  const text =
    typeof detail === "string"
      ? detail
      : detail instanceof Error
        ? `${detail.name}: ${detail.message}`
        : (() => {
            try {
              return JSON.stringify(detail);
            } catch {
              return String(detail);
            }
          })();
  entries.push({ at: Date.now() - origin, stage, detail: text });
  if (entries.length > MAX_ENTRIES) entries.shift();
  // eslint-disable-next-line no-console
  console.info(`[scan] ${stage}${text ? ` — ${text}` : ""}`);
  for (const fn of listeners) fn();
}

export function getScanLog(): readonly ScanLogEntry[] {
  return entries;
}

export function clearScanLog(): void {
  entries.length = 0;
  origin = 0;
  for (const fn of listeners) fn();
}

export function subscribeScanLog(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Flatten the trail for copy-paste into a bug report. */
export function formatScanLog(): string {
  return entries.map((e) => `+${e.at}ms  ${e.stage}${e.detail ? ` — ${e.detail}` : ""}`).join("\n");
}

/** Summarise a DataTransfer without touching data the browser may withhold. */
export function describeDataTransfer(dt: DataTransfer | null): string {
  if (!dt) return "no dataTransfer";
  const parts: string[] = [];
  try {
    parts.push(`types=[${Array.from(dt.types).join(",")}]`);
  } catch {
    parts.push("types=<unreadable>");
  }
  try {
    parts.push(`files=${dt.files?.length ?? 0}`);
    const f = dt.files?.[0];
    if (f) parts.push(`first={name:${f.name},type:${f.type || "?"},size:${f.size}}`);
  } catch {
    parts.push("files=<unreadable>");
  }
  try {
    parts.push(`effectAllowed=${dt.effectAllowed}`, `dropEffect=${dt.dropEffect}`);
  } catch {
    /* some browsers restrict these outside a drag */
  }
  return parts.join(" ");
}
