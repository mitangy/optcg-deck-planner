/**
 * The game review of a finished recording (#967), made in a Web Worker once the timeline is built, in slices:
 * progress and the grades so far arrive as they are made. A finished review is kept per match (reviewCache.ts).
 */
import { useEffect, useState } from "react";
import { REGISTRY_HASH, RULES_VERSION, type MatchReplay } from "@optcg/rules/replay/replayTimeline";
import { clearLegacyReviewCacheOnce, readCachedReview, reviewCacheKey, writeCachedReview } from "./reviewCache";
import type { ReviewMessage, ReviewRequest } from "./reviewProtocol";
import type { GameReview } from "./reviewModel";

export type ReviewState = {
  /** "off": not a finished game, or the timeline is not built yet. */
  status: "off" | "running" | "done" | "failed";
  /** 0 to 1. */
  progress: number;
  /** The grades so far while running, all of them once done. */
  review: GameReview | null;
};

const OFF: ReviewState = { status: "off", progress: 0, review: null };

export function useGameReview(matchId: string, replay: MatchReplay, enabled: boolean): ReviewState {
  const [state, setState] = useState<ReviewState>(OFF);

  useEffect(() => {
    if (!enabled) {
      setState(OFF);
      return;
    }
    const key = reviewCacheKey(matchId, RULES_VERSION, REGISTRY_HASH);
    clearLegacyReviewCacheOnce();
    let cancelled = false;
    let worker: Worker | null = null;
    setState({ status: "running", progress: 0, review: null });
    // The cache read is async: the strip shows "running" meanwhile, then a hit swaps in the kept review.
    void readCachedReview(key).then((cached) => {
      if (cancelled) return;
      if (cached) {
        setState({ status: "done", progress: 1, review: cached });
        return;
      }
      worker = startWorker(key);
    });
    return () => {
      cancelled = true;
      worker?.terminate();
    };

    function startWorker(key: string): Worker | null {
      if (typeof Worker === "undefined") {
        setState({ status: "failed", progress: 0, review: null });
        return null;
      }
      let worker: Worker;
      try {
        worker = new Worker(new URL("./reviewWorker.ts", import.meta.url), { type: "module" });
      } catch {
        setState({ status: "failed", progress: 0, review: null });
        return null;
      }
      worker.onmessage = (e: MessageEvent<ReviewMessage>) => {
        const m = e.data;
        if (m.type === "progress") setState({ status: "running", progress: m.progress, review: m.review });
        else if (m.type === "done") {
          void writeCachedReview(key, m.review);
          setState({ status: "done", progress: 1, review: m.review });
          worker.terminate();
        } else {
          setState((s) => ({ status: "failed", progress: s.progress, review: s.review }));
          worker.terminate();
        }
      };
      worker.onerror = () => {
        setState((s) => ({ status: "failed", progress: s.progress, review: s.review }));
        worker.terminate();
      };
      worker.postMessage({ type: "start", replay } satisfies ReviewRequest);
      return worker;
    }
  }, [matchId, replay, enabled]);

  // The frame before the effect runs already says "running", so the strip never flashes in.
  return enabled && state.status === "off" ? { status: "running", progress: 0, review: null } : state;
}
