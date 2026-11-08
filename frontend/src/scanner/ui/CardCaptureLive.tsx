/** Live camera capture of the full frame.
 *
 * The photo is the whole camera frame, uncropped, so a photo of several cards
 * keeps every card. The preview is letterboxed (`object-fit: contain`), so
 * what you see is exactly what gets captured.
 *
 * Requires `getUserMedia`, which itself requires a secure context — plain
 * `http://<lan-ip>` on a real phone does not qualify (see the phone-testing
 * skill). Callers must feature-detect with `isLiveCaptureSupported()` and
 * fall back to `<input capture>` when it's false, which has no such
 * requirement since it hands off to the native camera app instead of
 * streaming frames to JS.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Dialog } from "@optcg/ui/popups";
import { scanLog } from "../runtime/scanLog";

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
 * The full-screen viewfinder, a dialog of its own: it mounts only while open, so closing it (cancel,
 * Escape, capture, or the scanner under it going away) unmounts `LiveCapture` and stops the camera.
 * Escape closes just this one; a stray tap on the picture must not, so only Escape does.
 */
export function CardCaptureLive({ onCapture, onCancel }: Props) {
  return (
    <Dialog open onClose={onCancel} className="live-capture-overlay" label="Scan with camera" closeOnOutsideClick={false}>
      <LiveCapture onCapture={onCapture} onCancel={onCancel} />
    </Dialog>
  );
}

function LiveCapture({ onCapture, onCancel }: Props) {
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
            // Ask for plenty of resolution: with several cards in one frame,
            // each card's own detail is only a fraction of the pixels.
            // cardScanImage caps the working size, so a large capture costs
            // nothing downstream.
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
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    scanLog("live:crop", `full frame ${video.videoWidth}x${video.videoHeight}`);
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
    <>
      <video ref={videoRef} className="live-video" playsInline muted autoPlay />

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
        <p className="live-hint">Point the camera at your cards, then tap Capture.</p>
        <button
          type="button"
          className="live-shutter"
          onClick={capture}
          disabled={!ready}
          aria-label="Capture"
        />
      </div>
    </>
  );
}
