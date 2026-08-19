/** Live camera capture with an on-screen card-shaped guide.
 *
 * Framing is what makes rectification reliable. Without a guide, a real
 * handheld photo of a card on a cluttered surface routinely defeats corner
 * detection — verified against real iPhone photos where a busy desk made
 * `findCardQuad` return nothing at all. Filling a known guide rectangle turns
 * that into a solved problem: the card occupies almost the whole frame, a
 * thin margin of background survives at the edges for detection to key off,
 * and the collector number becomes several times larger in the captured
 * pixels than in a free-form photo of the same scene.
 *
 * Requires `getUserMedia`, which itself requires a secure context — plain
 * `http://<lan-ip>` on a real phone does not qualify (see the phone-testing
 * skill). Callers must feature-detect with `isLiveCaptureSupported()` and
 * fall back to `<input capture>` when it's false, which has no such
 * requirement since it hands off to the native camera app instead of
 * streaming frames to JS.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { CARD_ASPECT } from "./cardRectify";
import { scanLog } from "./scanLog";

export function isLiveCaptureSupported(): boolean {
  return typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);
}

/** `torch` is a real, widely-shipped capability (Android Chrome) that TS's
 *  DOM lib does not model. */
type TorchCapabilities = MediaTrackCapabilities & { torch?: boolean };
type TorchConstraintSet = MediaTrackConstraintSet & { torch?: boolean };

type Props = {
  onCapture: (blob: Blob) => void;
  onCancel: () => void;
};

/**
 * Keep a thin ring of background around the guide when cropping.
 *
 * Cropping flush to the guide would hand the matcher a card with no border,
 * and `findCardQuad` separates the card from its surroundings by sampling
 * the image edge — with nothing but card there, it has nothing to key off.
 * A small margin keeps rectification working while still discarding the
 * table, fingers and neighbouring cards.
 */
const GUIDE_CROP_MARGIN = 0.06;

/**
 * Map the on-screen guide box into the video's own pixel coordinates.
 *
 * The preview is `object-fit: cover`, so the frame is scaled up to fill the
 * element and the overflow is cropped evenly on both axes — neither of which
 * is visible in element coordinates. Both have to be undone, or the crop
 * lands somewhere other than where the user framed the card.
 *
 * Falls back to the whole frame if the guide has not been laid out yet.
 */
export function guideCropInVideoSpace(
  video: HTMLVideoElement,
  guide: HTMLElement | null,
): { x: number; y: number; width: number; height: number } {
  const full = { x: 0, y: 0, width: video.videoWidth, height: video.videoHeight };
  const box = video.getBoundingClientRect();
  const g = guide?.getBoundingClientRect();
  if (!g || !g.width || !g.height || !box.width || !box.height) return full;

  const scale = Math.max(box.width / video.videoWidth, box.height / video.videoHeight);
  if (!Number.isFinite(scale) || scale <= 0) return full;
  const shownW = video.videoWidth * scale;
  const shownH = video.videoHeight * scale;
  const hiddenX = (shownW - box.width) / 2;
  const hiddenY = (shownH - box.height) / 2;

  const marginX = g.width * GUIDE_CROP_MARGIN;
  const marginY = g.height * GUIDE_CROP_MARGIN;
  const left = g.left - box.left - marginX;
  const top = g.top - box.top - marginY;

  const x = (left + hiddenX) / scale;
  const y = (top + hiddenY) / scale;
  const width = (g.width + marginX * 2) / scale;
  const height = (g.height + marginY * 2) / scale;

  // Clamp so a guide larger than the frame cannot ask for pixels that do not
  // exist, which would make drawImage silently produce a blank canvas.
  const cx = Math.max(0, Math.min(x, video.videoWidth));
  const cy = Math.max(0, Math.min(y, video.videoHeight));
  return {
    x: cx,
    y: cy,
    width: Math.max(1, Math.min(width, video.videoWidth - cx)),
    height: Math.max(1, Math.min(height, video.videoHeight - cy)),
  };
}

export function CardCaptureLive({ onCapture, onCancel }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const guideRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        scanLog("live:requesting-camera", "");
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            // Ask for plenty of resolution — the collector number is small
            // even inside the guide. cardScanOcr's own cap keeps whatever
            // comes back from becoming a memory problem.
            width: { ideal: 1920 },
            height: { ideal: 1920 },
          },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const track = stream.getVideoTracks()[0];
        trackRef.current = track ?? null;
        try {
          const caps = track?.getCapabilities?.() as TorchCapabilities | undefined;
          setTorchSupported(Boolean(caps?.torch));
        } catch {
          setTorchSupported(false);
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        const settings = track?.getSettings?.();
        scanLog("live:camera-ready", `${settings?.width ?? "?"}x${settings?.height ?? "?"}`);
        if (!cancelled) setReady(true);
      } catch (err) {
        scanLog("live:camera-error", err);
        if (cancelled) return;
        const name = (err as { name?: string } | null)?.name;
        setError(
          name === "NotAllowedError"
            ? "Camera access was denied. Allow it in your browser settings, or use Choose image."
            : name === "NotFoundError"
              ? "No camera found on this device."
              : "Couldn't start the camera. Use Choose image instead.",
        );
      }
    })();
    return () => {
      cancelled = true;
      // Release the camera on every exit path — cancel, capture, or unmount —
      // so it never keeps running (and the OS recording indicator lit)
      // after the user has left this view.
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  const toggleTorch = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const next = !torchOn;
    void track
      .applyConstraints({ advanced: [{ torch: next } as TorchConstraintSet] })
      .then(() => setTorchOn(next))
      .catch((err) => scanLog("live:torch-error", err));
  }, [torchOn]);

  const capture = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const crop = guideCropInVideoSpace(video, guideRef.current);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(crop.width);
    canvas.height = Math.round(crop.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(
      video,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      0,
      0,
      canvas.width,
      canvas.height,
    );
    scanLog("live:crop", `guide ${Math.round(crop.width)}x${Math.round(crop.height)} of ${video.videoWidth}x${video.videoHeight}`);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        scanLog("live:captured", `${canvas.width}x${canvas.height}`);
        onCapture(blob);
      },
      "image/jpeg",
      0.92,
    );
  }, [onCapture]);

  return (
    <div className="live-capture-overlay" role="dialog" aria-modal="true" aria-label="Scan a card">
      <video ref={videoRef} className="live-video" playsInline muted autoPlay />

      {ready && (
        <div className="live-guide-layer" aria-hidden="true">
          <div ref={guideRef} className="live-guide-box" style={{ aspectRatio: CARD_ASPECT }}>
            <span className="live-guide-corner tl" />
            <span className="live-guide-corner tr" />
            <span className="live-guide-corner bl" />
            <span className="live-guide-corner br" />
          </div>
        </div>
      )}
      {!ready && !error && <p className="live-status">Starting camera…</p>}
      {error && <p className="live-status live-error">{error}</p>}

      <div className="live-top-bar">
        <button type="button" className="live-cancel" onClick={onCancel}>
          Cancel
        </button>
        {torchSupported && (
          <button type="button" className="live-torch" onClick={toggleTorch}>
            {torchOn ? "Torch off" : "Torch on"}
          </button>
        )}
      </div>

      <div className="live-bottom-bar">
        <p className="live-hint">Fill the frame with the card, then tap Capture.</p>
        <button
          type="button"
          className="live-shutter"
          onClick={capture}
          disabled={!ready}
          aria-label="Capture"
        />
      </div>
    </div>
  );
}
