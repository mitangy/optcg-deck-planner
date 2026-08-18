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

export function CardCaptureLive({ onCapture, onCancel }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
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
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
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
    <div className="live-capture">
      <div className="live-video-wrap">
        <video ref={videoRef} className="live-video" playsInline muted autoPlay />
        {ready && (
          <div className="live-guide-layer" aria-hidden="true">
            <div className="live-guide-box" style={{ aspectRatio: CARD_ASPECT }}>
              <span className="live-guide-corner tl" />
              <span className="live-guide-corner tr" />
              <span className="live-guide-corner bl" />
              <span className="live-guide-corner br" />
            </div>
          </div>
        )}
        {!ready && !error && <p className="live-status">Starting camera…</p>}
        {error && <p className="live-status live-error">{error}</p>}
      </div>
      <p className="live-hint">Fill the frame with the card, then tap Capture.</p>
      <div className="live-controls">
        <button type="button" className="ghost" onClick={onCancel}>
          Cancel
        </button>
        {torchSupported && (
          <button type="button" className="ghost" onClick={toggleTorch}>
            {torchOn ? "Torch off" : "Torch on"}
          </button>
        )}
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
