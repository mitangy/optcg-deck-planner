/** Scan a card face to look it up in the catalog.
 *
 * Built for a vendor booth: point the phone at a card in someone else's
 * binder and get the market price plus how many you still need. Nothing is
 * uploaded and nothing is stored — the image never leaves the device.
 * The one exception is the multi-card photo scan: after the user adds the
 * cards, small crops of each added card (never the photo) are shared to
 * improve the scanner, unless they switched that off (`share_scans`).
 */

import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog } from "@optcg/ui/popups";
import { api } from "./api";
import { meQueryKey } from "./auth/useMe";
import type { CatalogCardResult, ShoppingItem, User } from "./api";
import { CardCaptureLive, isLiveCaptureSupported } from "./CardCaptureLive";
import { CardThumb } from "./CardThumb";
import { MarketPrice } from "./MarketPrice";
import { matchCard } from "./cardScanMatch";
import { waitForModels } from "./modelsReady";
import { matchAllCards as defaultMatchAll, type MatchAllCards, type MultiScanItem } from "./cardScanMulti";
import { ScanAdded, ScanTray, type ScanTarget } from "./ScanTray";
import { uploadScanSamples } from "./scanSampleUpload";
import {
  buildTrayRows,
  dropUnknownCards,
  fixRow,
  setRowQty,
  trayAddPayload,
  trayReadyCount,
  traySamples,
  type TrayRow,
} from "./scanTrayModel";
import { MULTI_MAX_WORK_EDGE, loadImageForScan } from "./cardScanImage";
import { useScanData, type ScanDataState } from "./useScanData";
import { useImageDrop } from "./useImageDrop";
import {
  clearScanLog,
  formatScanLog,
  getScanLog,
  scanLog,
  subscribeScanLog,
} from "./scanLog";

type Phase =
  | { kind: "idle" }
  | { kind: "working"; label: string; progress: number }
  | { kind: "hit"; card: CatalogCardResult; note: string | null }
  | { kind: "miss"; message: string; candidate?: string };

export type ScanMulti = {
  /** Called after the scanned cards were added, so the page can refresh. */
  onAdded?: () => void;
  /** Replaces the detector (tests). */
  matcher?: MatchAllCards;
  /** Where the cards go: the collection (default) or the shopping list, marked as owned. */
  target?: ScanTarget;
};

/** Test-only: e2e sets this before load to stand in for the detector and the scan data. */
function testMatcher(): MatchAllCards | undefined {
  return (window as unknown as { __optcgTestMatchAll?: MatchAllCards }).__optcgTestMatchAll;
}

type Tray = { rows: TrayRow[]; found: number; items: MultiScanItem[] };

/** The catalog row whose card number is exactly `cardId`, or null. */
async function lookupExact(cardId: string, limit = 5): Promise<CatalogCardResult | null> {
  const rows = await api.searchCatalog({ q: cardId, limit });
  return rows.find((r) => r.card_id.toUpperCase() === cardId.toUpperCase()) ?? null;
}

function formatMb(bytes: number): string {
  return `${(bytes / 1048576).toFixed(0)} MB`;
}

/**
 * Explains and gates the one-time descriptor download.
 *
 * Matching runs entirely on the device, which is the point — the wifi at a
 * card show is exactly what breaks price checks — but it means the reference
 * data has to be fetched once first. Asking plainly, with the size shown,
 * beats either surprising the user with a large download or discovering the
 * data is missing mid-scan at the booth.
 */
function ScanDataGate({ state, onDownload }: { state: ScanDataState; onDownload: () => void }) {
  if (state.kind === "ready") return null;
  if (state.kind === "checking") return <p className="scan-note">Checking scan data…</p>;
  if (state.kind === "unavailable") {
    return <p className="scan-note scan-note-warn">Scan data unavailable: {state.message}</p>;
  }
  if (state.kind === "preparing") return <p className="scan-note">Preparing scan data…</p>;
  if (state.kind === "downloading") {
    const { bytesDone, bytesTotal, chunksDone, chunksTotal } = state.progress;
    const pct = bytesTotal ? Math.round((bytesDone / bytesTotal) * 100) : 0;
    return (
      <div className="scan-note">
        <p>
          Downloading scan data… {pct}% ({chunksDone}/{chunksTotal})
        </p>
        <progress value={bytesDone} max={bytesTotal} />
      </div>
    );
  }
  const remaining = state.totalBytes - state.cachedBytes;
  return (
    <div className="scan-note">
      <p>
        Scanning works offline, but needs a one-time {formatMb(state.totalBytes)} download
        {state.cachedBytes > 0 ? ` (${formatMb(remaining)} left)` : ""}. Best done on wifi before
        you head out.
      </p>
      <button type="button" onClick={onDownload}>
        Download scan data
      </button>
    </div>
  );
}

export function CardScanner({
  items,
  onClose,
  initialImage = null,
  showNeed = true,
  renderHitAction,
  multi,
}: {
  /** Current shopping rows, used to answer "do I still need this?". */
  items: ShoppingItem[];
  onClose: () => void;
  /** An image dropped on the page before the dialog opened. */
  initialImage?: Blob | null;
  /** Show the shopping "still need" line for a hit (off on the Collection page). */
  showNeed?: boolean;
  /** Extra control under a hit, e.g. the Collection page's Add / Owned stepper. */
  renderHitAction?: (card: CatalogCardResult) => ReactNode;
  /** Collection page: scan every card in a photo and review them before adding. */
  multi?: ScanMulti;
}) {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [manual, setManual] = useState("");
  const [dragging, setDragging] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const liveRef = useRef(true);
  // Computed once: getUserMedia support doesn't change mid-session.
  const [liveSupported] = useState(isLiveCaptureSupported);
  const scanData = useScanData(true);
  const [tray, setTray] = useState<Tray | null>(null);
  const [cards, setCards] = useState<ReadonlyMap<string, CatalogCardResult>>(new Map());
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [added, setAdded] = useState<number | null>(null);
  const qc = useQueryClient();
  const injected = multi ? (multi.matcher ?? testMatcher()) : undefined;
  const scanReady = scanData.state.kind === "ready" || !!injected;

  useEffect(() => {
    liveRef.current = true;
    return () => {
      liveRef.current = false;
    };
  }, []);

  const lookupCard = useCallback(async (cardId: string) => {
    const exact = await lookupExact(cardId, 1);
    if (exact) setPhase({ kind: "hit", card: exact, note: null });
    else setPhase({ kind: "miss", message: `No catalog card matches ${cardId}.` });
  }, []);

  const runScan = useCallback(
    async (file: Blob) => {
      if (!scanReady) {
        setPhase({ kind: "miss", message: "Scan data isn't ready yet." });
        return;
      }
      const candidates = scanData.state.kind === "ready" ? scanData.state.candidates : [];
      if (multi) {
        setTray(null);
        setAdded(null);
        setAddError(null);
        setPhase({ kind: "working", label: "Finding cards…", progress: 0 });
        scanLog("scan-multi:start", `type=${file.type || "?"} size=${file.size}`);
        try {
          const photo = await loadImageForScan(file, MULTI_MAX_WORK_EDGE);
          if (!injected) {
            // The learned detector loads in the background and takes a few
            // seconds the first time; scanning before then used OpenCV and
            // found almost nothing (#764).
            setPhase({ kind: "working", label: "Loading card finder…", progress: 0 });
            const t0 = Date.now();
            const loaded = await waitForModels(scanData.whenModelsReady());
            scanLog("scan-multi:models", `${loaded ? "ready" : "timed out"} after ${Date.now() - t0}ms`);
            if (!liveRef.current) return;
            setPhase({ kind: "working", label: "Finding cards…", progress: 0 });
          }
          const matchAll = injected ?? defaultMatchAll;
          const items = await matchAll(photo, candidates, (p) => {
            if (!liveRef.current) return;
            setPhase({
              kind: "working",
              label: `Identifying card ${Math.min(p.index + 1, p.total)} of ${p.total}…`,
              progress: p.total ? p.index / p.total : 0,
            });
          });
          if (!liveRef.current) return;
          if (items.length === 0) {
            setPhase({
              kind: "miss",
              message:
                "No cards found. Lay the cards flat on a plain background with good light, then try again.",
            });
            return;
          }
          setPhase({
            kind: "working",
            label: "Looking up prices…",
            progress: 1,
          });
          const ids = [
            ...new Set(buildTrayRows(items).flatMap((r) => (r.cardId ? [r.cardId] : []))),
          ];
          const found = await Promise.all(ids.map((id) => lookupExact(id).catch(() => null)));
          if (!liveRef.current) return;
          const known = new Map<string, CatalogCardResult>();
          found.forEach((c, i) => c && known.set(ids[i]!, c));
          setCards(known);
          const rows = dropUnknownCards(buildTrayRows(items), new Set(known.keys()));
          const only = rows.length === 1 && rows[0].cardId ? known.get(rows[0].cardId) : undefined;
          // Shopping: one copy of one card is a "do I need this?" check, so show the
          // card itself with its Add to shopping list control (#842) rather than a tray.
          if (multi.target === "shopping" && only && rows[0].qty === 1) {
            setPhase({
              kind: "hit",
              card: only,
              note: rows[0].confidence === "sure" ? null : "Close call — check this is the right card.",
            });
            return;
          }
          setTray({ rows, found: items.length, items });
          setPhase({ kind: "idle" });
        } catch (err) {
          scanLog("scan-multi:error", err);
          if (!liveRef.current) return;
          setPhase({
            kind: "miss",
            message: (err as Error).message || "Scan failed.",
          });
        }
        return;
      }
      setPhase({ kind: "working", label: "Matching card…", progress: 0 });
      scanLog("scan:start", `type=${file.type || "?"} size=${file.size}`);
      try {
        const photo = await loadImageForScan(file);
        const match = await matchCard(photo, candidates, (examined, total) => {
          if (!liveRef.current) return;
          setPhase({
            kind: "working",
            label: "Matching card…",
            progress: examined / total,
          });
        });
        if (!liveRef.current) return;
        if (!match) {
          setPhase({
            kind: "miss",
            message:
              "No match. Get closer to the card and avoid glare, or type the number below.",
          });
          return;
        }
        const rows = await api.searchCatalog({ q: match.cardId, limit: 1 });
        if (!liveRef.current) return;
        const card = rows.find((r) => r.card_id.toUpperCase() === match.cardId.toUpperCase());
        if (!card) {
          setPhase({
            kind: "miss",
            message: `Matched ${match.cardId}, which isn't in the catalog.`,
          });
          return;
        }
        // A real match scores far above everything else, so a thin margin is
        // worth surfacing rather than presenting as certain.
        const thin = match.inliers - match.runnerUp < 5;
        setPhase({
          kind: "hit",
          card,
          note: thin ? "Close call — check this is the right card." : null,
        });
      } catch (err) {
        scanLog("scan:error", err);
        if (!liveRef.current) return;
        setPhase({
          kind: "miss",
          message: (err as Error).message || "Scan failed.",
        });
      }
    },
    [scanData.state, scanData.whenModelsReady, scanReady, multi, injected],
  );

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

  const resetScan = () => {
    setTray(null);
    setAdded(null);
    setAddError(null);
    setPhase({ kind: "idle" });
  };

  const fixTrayRow = async (key: string, cardId: string): Promise<string | null> => {
    try {
      const card = await lookupExact(cardId.trim().toUpperCase());
      if (!card) return `No catalog card matches ${cardId.trim().toUpperCase()}.`;
      setCards((prev) => new Map(prev).set(card.card_id.toUpperCase(), card));
      setTray((t) => (t ? { ...t, rows: fixRow(t.rows, key, card.card_id) } : t));
      return null;
    } catch {
      return "Couldn't look that up. Try again.";
    }
  };

  const addTray = async () => {
    if (!tray || adding) return;
    const payload = trayAddPayload(tray.rows);
    if (payload.length === 0) return;
    const count = trayReadyCount(tray.rows);
    setAdding(true);
    setAddError(null);
    try {
      await api.addOwned(payload);
      // Fire-and-forget; skipped unless the user's sharing switch is on (#852).
      if (qc.getQueryData<User | null>(meQueryKey)?.share_scans === true) {
        void uploadScanSamples(traySamples(tray.rows, tray.items)).then(() =>
          qc.invalidateQueries({ queryKey: ["scan-samples"] }),
        );
      }
      if (!liveRef.current) return;
      setAdded(count);
      setTray(null);
      multi?.onAdded?.();
    } catch (err) {
      if (liveRef.current) setAddError((err as Error).message || "Couldn't add these cards.");
    } finally {
      if (liveRef.current) setAdding(false);
    }
  };

  const reviewing = !!multi && (tray !== null || added !== null);

  const need =
    phase.kind === "hit" ? items.find((i) => i.card_id === phase.card.card_id) : undefined;

  return (
    <Dialog
      open
      onClose={onClose}
      className="scan-backdrop"
      panelClassName={`scan-dialog${multi ? " multi" : ""}${reviewing ? " reviewing" : ""}`}
      label={multi ? "Scan cards" : "Scan a card"}
    >
      {/* Full-screen rather than embedded in the dialog card: a camera preview
          cramped into a small padded box gives a much worse view of the card than
          the device's own screen can offer, and doesn't read as a viewfinder. It is a
          dialog of its own on top of this one, so Escape steps back out of the camera
          first and a second Escape closes the scanner. */}
      {cameraOpen ? (
        <CardCaptureLive
          onCapture={(blob) => {
            setCameraOpen(false);
            void runScan(blob);
          }}
          onCancel={() => setCameraOpen(false)}
        />
      ) : null}
      <div className="scan-head">
        <h2>{multi ? "Scan cards" : "Scan a card"}</h2>
        <button type="button" className="ghost" onClick={onClose} aria-label="Close scanner">
          Close
        </button>
      </div>

      {!injected && <ScanDataGate state={scanData.state} onDownload={scanData.download} />}

      {reviewing && tray && (
        <ScanTray
          rows={tray.rows}
          found={tray.found}
          cards={cards}
          items={items}
          showNeed={showNeed}
          target={multi?.target}
          adding={adding}
          addError={addError}
          onQty={(key, qty) =>
            setTray((t) => (t ? { ...t, rows: setRowQty(t.rows, key, qty) } : t))
          }
          onFix={fixTrayRow}
          onAdd={() => void addTray()}
          onRescan={resetScan}
        />
      )}
      {reviewing && added !== null && (
        <ScanAdded count={added} target={multi?.target} onMore={resetScan} onClose={onClose} />
      )}

      {!reviewing && (
        <>
          <div className={`scan-drop${dragging ? " dragging" : ""}`}>
            <p className="scan-drop-hint">
              {multi
                ? "Photograph one card, several cards or a whole binder page. Drop a photo anywhere in this box, or"
                : "Drop a photo anywhere in this box, or"}
            </p>
            <div className="scan-actions">
              {liveSupported ? (
                <button type="button" onClick={() => setCameraOpen(true)} disabled={!scanReady}>
                  Scan with camera
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => cameraRef.current?.click()}
                  disabled={!scanReady}
                >
                  Take a photo
                </button>
              )}
              <button
                type="button"
                className="ghost"
                onClick={() => fileRef.current?.click()}
                disabled={!scanReady}
              >
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
                <CardThumb
                  src={phase.card.image_url}
                  cardId={phase.card.card_id}
                  alt={phase.card.name}
                />
                <div className="scan-hit-body">
                  <p className="scan-hit-name">{phase.card.name}</p>
                  <p className="scan-hit-meta">
                    {phase.card.card_id} · {phase.card.group_name}
                  </p>
                  <div className="scan-hit-price">
                    <MarketPrice price={phase.card.market_price} />
                  </div>
                  {showNeed && (
                    <p className={`scan-hit-need${need && need.still_need > 0 ? " wanted" : ""}`}>
                      {need
                        ? need.still_need > 0
                          ? `You still need ${need.still_need} — ${need.used_in.join(", ")}`
                          : `Covered — you own ${need.owned} of ${need.need}`
                        : "Not in any of your decks"}
                    </p>
                  )}
                  {renderHitAction?.(phase.card)}
                  {phase.note && <p className="scan-hit-warn">{phase.note}</p>}
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
        </>
      )}
    </Dialog>
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
