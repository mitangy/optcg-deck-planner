/** Scan a card face to look it up in the catalog.
 *
 * Built for a vendor booth: point the phone at a card in someone else's
 * binder and get the market price plus how many you still need. Nothing is
 * uploaded and nothing is stored — the image never leaves the device.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import type { CatalogCardResult, ShoppingItem } from "./api";
import { CardCaptureLive, isLiveCaptureSupported } from "./CardCaptureLive";
import { CardThumb } from "./CardThumb";
import { MarketPrice } from "./MarketPrice";
import { resolveScanWithCatalog } from "./cardScanLookup";
import type { ScanConfidence } from "./cardScan";
import { isScanEngineReady, readDroppedImage, recognizeCardText } from "./cardScanOcr";
import type { ScanProgress } from "./cardScanOcr";
import {
  clearScanLog,
  describeDataTransfer,
  formatScanLog,
  getScanLog,
  scanLog,
  subscribeScanLog,
} from "./scanLog";

type Phase =
  | { kind: "idle" }
  | { kind: "working"; label: string; progress: number }
  | { kind: "hit"; card: CatalogCardResult; confidence: ScanConfidence }
  | { kind: "miss"; message: string; candidate?: string };

const CONFIDENCE_NOTE: Record<ScanConfidence, string | null> = {
  exact: null,
  repaired: "Read corrected — check the card matches.",
  fuzzy: "Low confidence — confirm this is the right card.",
};

function progressLabel(p: ScanProgress): string {
  return p.stage === "loading-engine" ? "Loading scanner…" : "Reading card…";
}

/**
 * Accept an image dropped anywhere on the window.
 *
 * Window-level rather than on an element: a drop released a few pixels off a
 * small target used to do nothing at all, and worse, an unhandled drop makes
 * the browser navigate away to the image and tear down the app. Listening
 * globally means there is no dead zone and no way to lose the page.
 */
export function useImageDrop({
  enabled,
  onImage,
  onReject,
  onDragStateChange,
}: {
  enabled: boolean;
  onImage: (blob: Blob) => void;
  onReject?: (reason: "empty" | "not-image" | "remote-blocked") => void;
  onDragStateChange?: (dragging: boolean) => void;
}) {
  const handlers = useRef({ onImage, onReject, onDragStateChange });
  handlers.current = { onImage, onReject, onDragStateChange };

  useEffect(() => {
    if (!enabled) return;
    scanLog("drop-listeners:attached", `on ${location.pathname}`);
    let depth = 0;
    let overLogged = false;
    const onDragEnter = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
      depth += 1;
      if (depth === 1) scanLog("dragenter", describeDataTransfer(e.dataTransfer));
      handlers.current.onDragStateChange?.(true);
    };
    const onDragLeave = () => {
      depth = Math.max(0, depth - 1);
      if (depth === 0) {
        overLogged = false;
        scanLog("dragleave", "drag left the window");
        handlers.current.onDragStateChange?.(false);
      }
    };
    // A drop only fires if dragover's default is prevented AND the drag is
    // told it may copy. Without an explicit dropEffect an OS file drag from
    // Finder/Explorer negotiates to "none", the cursor shows the no-entry
    // badge, and the drop event never fires at all.
    const onDragOver = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
      // Fires continuously; one sample is enough to show the negotiated effect.
      if (!overLogged) {
        overLogged = true;
        scanLog("dragover", describeDataTransfer(e.dataTransfer));
      }
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      depth = 0;
      overLogged = false;
      handlers.current.onDragStateChange?.(false);
      scanLog("drop", describeDataTransfer(e.dataTransfer));
      if (!e.dataTransfer) {
        handlers.current.onReject?.("empty");
        return;
      }
      void readDroppedImage(e.dataTransfer)
        .then((result) => {
          if (result.ok) {
            scanLog("drop:accepted", `type=${result.blob.type || "?"} size=${result.blob.size}`);
            handlers.current.onImage(result.blob);
          } else {
            scanLog("drop:rejected", result.reason);
            handlers.current.onReject?.(result.reason);
          }
        })
        .catch((err) => {
          scanLog("drop:error", err);
          handlers.current.onReject?.("empty");
        });
    };
    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);
    return () => {
      scanLog("drop-listeners:detached", "");
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDrop);
    };
  }, [enabled]);
}

export function CardScanner({
  items,
  onClose,
  initialImage = null,
}: {
  /** Current shopping rows, used to answer "do I still need this?". */
  items: ShoppingItem[];
  onClose: () => void;
  /** An image dropped on the page before the dialog opened. */
  initialImage?: Blob | null;
}) {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [manual, setManual] = useState("");
  const [dragging, setDragging] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const liveRef = useRef(true);
  // Computed once: getUserMedia support doesn't change mid-session.
  const [liveSupported] = useState(isLiveCaptureSupported);

  useEffect(() => {
    liveRef.current = true;
    return () => {
      liveRef.current = false;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Step back out of the camera first; Escape again closes the dialog.
      if (cameraOpen) setCameraOpen(false);
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    dialogRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, cameraOpen]);

  const lookupCard = useCallback(async (cardId: string) => {
    const rows = await api.searchCatalog({ q: cardId, limit: 1 });
    const exact = rows.find((r) => r.card_id.toUpperCase() === cardId.toUpperCase());
    if (exact) setPhase({ kind: "hit", card: exact, confidence: "exact" });
    else setPhase({ kind: "miss", message: `No catalog card matches ${cardId}.` });
  }, []);

  const runScan = useCallback(async (file: Blob) => {
    setPhase({
      kind: "working",
      label: isScanEngineReady() ? "Reading card…" : "Loading scanner…",
      progress: 0,
    });
    scanLog("scan:start", `type=${file.type || "?"} size=${file.size}`);
    try {
      const text = await recognizeCardText(file, (p) => {
        if (!liveRef.current) return;
        setPhase({ kind: "working", label: progressLabel(p), progress: p.progress });
      });
      scanLog("scan:ocr", `${text.trim().length} chars: ${JSON.stringify(text.trim().slice(-90))}`);
      const outcome = await resolveScanWithCatalog(text, (q) =>
        api.searchCatalog({ q, limit: 100 }),
      );
      if (!liveRef.current) return;
      if (outcome.ok) {
        scanLog(
          "scan:hit",
          `${outcome.card.card_id} (${outcome.confidence}, ${outcome.queries} queries)`,
        );
        setPhase({ kind: "hit", card: outcome.card, confidence: outcome.confidence });
        return;
      }
      scanLog("scan:miss", `${outcome.reason}${outcome.candidate ? ` candidate=${outcome.candidate}` : ""}`);
      const message =
        outcome.reason === "no-card-id"
          ? "Couldn't find a card number. Get the bottom-right corner in frame, or type it below."
          : outcome.reason === "not-in-catalog"
            ? `Read ${outcome.candidate}, which isn't in the catalog.`
            : "Read was ambiguous — try again with less glare, or type the number below.";
      setPhase({ kind: "miss", message, candidate: outcome.candidate });
    } catch (err) {
      scanLog("scan:error", err);
      if (!liveRef.current) return;
      setPhase({ kind: "miss", message: (err as Error).message || "Scan failed." });
    }
  }, []);

  const onPick = (file: File | undefined) => {
    if (file) void runScan(file);
  };

  // Every failure says something: silence made a failed drop indistinguishable
  // from a broken feature.
  const rejectDrop = useCallback((reason: "empty" | "not-image" | "remote-blocked") => {
    setPhase({
      kind: "miss",
      message:
        reason === "not-image"
          ? "That file isn't an image. Drop a photo of the card instead."
          : reason === "remote-blocked"
            ? "That site blocked reading the image. Save it first, then drop the file."
            : "Nothing to scan in that drop. Try a photo file, or use Choose image.",
    });
  }, []);

  useImageDrop({
    enabled: true,
    onImage: (blob) => void runScan(blob),
    onReject: rejectDrop,
    onDragStateChange: setDragging,
  });

  // Scan an image that was dropped on the page before this dialog existed.
  const initialRef = useRef<Blob | null>(null);
  useEffect(() => {
    if (!initialImage || initialRef.current === initialImage) return;
    initialRef.current = initialImage;
    void runScan(initialImage);
  }, [initialImage, runScan]);

  const need = phase.kind === "hit" ? items.find((i) => i.card_id === phase.card.card_id) : undefined;

  // Full-screen rather than embedded in the dialog card: a camera preview
  // cramped into a small padded box gives a much worse view of the card than
  // the device's own screen can offer, and doesn't read as a viewfinder.
  if (cameraOpen) {
    return (
      <CardCaptureLive
        onCapture={(blob) => {
          setCameraOpen(false);
          void runScan(blob);
        }}
        onCancel={() => setCameraOpen(false)}
      />
    );
  }

  return (
    <div className="scan-backdrop" role="presentation" onClick={onClose}>
      <div
        className="scan-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Scan a card"
        tabIndex={-1}
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="scan-head">
          <h2>Scan a card</h2>
          <button type="button" className="ghost" onClick={onClose} aria-label="Close scanner">
            Close
          </button>
        </div>

        <div className={`scan-drop${dragging ? " dragging" : ""}`}>
          <p className="scan-drop-hint">Drop a photo anywhere in this box, or</p>
          <div className="scan-actions">
            {liveSupported ? (
              <button type="button" onClick={() => setCameraOpen(true)}>
                Scan with camera
              </button>
            ) : (
              <button type="button" onClick={() => cameraRef.current?.click()}>
                Take a photo
              </button>
            )}
            <button type="button" className="ghost" onClick={() => fileRef.current?.click()}>
              Choose image
            </button>
          </div>
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={(e) => {
              onPick(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => {
              onPick(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </div>

        {/* Fixed-height status region so the dialog never resizes mid-scan. */}
        <div className="scan-status" aria-live="polite">
          {phase.kind === "working" && (
            <>
              <p className="scan-status-label">{phase.label}</p>
              <div className="scan-bar">
                <div
                  className="scan-bar-fill"
                  style={{ width: `${Math.round(phase.progress * 100)}%` }}
                />
              </div>
            </>
          )}
          {phase.kind === "miss" && <p className="scan-miss">{phase.message}</p>}
          {phase.kind === "hit" && (
            <div className="scan-hit">
              <CardThumb src={phase.card.image_url} alt={phase.card.name} />
              <div className="scan-hit-body">
                <p className="scan-hit-name">{phase.card.name}</p>
                <p className="scan-hit-meta">
                  {phase.card.card_id} · {phase.card.group_name}
                </p>
                <div className="scan-hit-price">
                  <MarketPrice price={phase.card.market_price} />
                </div>
                <p className={`scan-hit-need${need && need.still_need > 0 ? " wanted" : ""}`}>
                  {need
                    ? need.still_need > 0
                      ? `You still need ${need.still_need} — ${need.used_in.join(", ")}`
                      : `Covered — you own ${need.owned} of ${need.need}`
                    : "Not in any of your decks"}
                </p>
                {CONFIDENCE_NOTE[phase.confidence] && (
                  <p className="scan-hit-warn">{CONFIDENCE_NOTE[phase.confidence]}</p>
                )}
                <a href={phase.card.tcgplayer_url} target="_blank" rel="noreferrer">
                  View on TCGPlayer
                </a>
              </div>
            </div>
          )}
        </div>

        <ScanDiagnostics />

        <form
          className="scan-manual"
          onSubmit={(e) => {
            e.preventDefault();
            const id = manual.trim().toUpperCase();
            if (id) void lookupCard(id);
          }}
        >
          <label htmlFor="scan-manual-input">Or type the card number</label>
          <div className="scan-manual-row">
            <input
              id="scan-manual-input"
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder="OP15-053"
              autoComplete="off"
              autoCapitalize="characters"
            />
            <button type="submit" disabled={!manual.trim()}>
              Look up
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * Collapsible trail of the last drag/scan attempt.
 *
 * Lives in the dialog rather than devtools only: the failure we are chasing
 * happens during a drag, when opening devtools is awkward, and the useful
 * signal is whether `drop` fired at all.
 */
function ScanDiagnostics() {
  const [, force] = useState(0);
  const [copied, setCopied] = useState(false);
  useEffect(() => subscribeScanLog(() => force((n) => n + 1)), []);
  const entries = getScanLog();
  const sawDrop = entries.some((e) => e.stage === "drop");
  const sawDrag = entries.some((e) => e.stage === "dragenter");

  return (
    <details className="scan-diag">
      <summary>
        Diagnostics{entries.length ? ` (${entries.length})` : ""}
        {sawDrag && !sawDrop ? " — drag seen, no drop" : ""}
      </summary>
      <div className="scan-diag-body">
        {entries.length === 0 ? (
          <p className="scan-diag-empty">
            Nothing recorded yet. Drag a file over the window to trace it.
          </p>
        ) : (
          <ol className="scan-diag-list">
            {entries.map((e, i) => (
              <li key={i}>
                <code>
                  +{e.at}ms {e.stage}
                </code>
                {e.detail ? <span className="scan-diag-detail"> {e.detail}</span> : null}
              </li>
            ))}
          </ol>
        )}
        <div className="scan-diag-actions">
          <button
            type="button"
            className="ghost"
            onClick={() => {
              void navigator.clipboard?.writeText(formatScanLog()).then(
                () => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                },
                () => setCopied(false),
              );
            }}
          >
            {copied ? "Copied" : "Copy log"}
          </button>
          <button type="button" className="ghost" onClick={() => clearScanLog()}>
            Clear
          </button>
        </div>
      </div>
    </details>
  );
}
