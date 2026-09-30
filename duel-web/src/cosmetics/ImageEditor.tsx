/**
 * Modal editor shown after picking a playmat / card back: rotate, flip, zoom
 * and drag the image under a fixed-aspect crop frame. "Apply" hands back a
 * Blob already cropped to that aspect, so the slot's encoder is a no-op crop.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  INITIAL_EDIT,
  MAX_ZOOM,
  clampPan,
  coverScale,
  type EditState,
} from "./cropTransform";

type Props = {
  file: File;
  /** Crop frame width / height. */
  aspect: number;
  title: string;
  /** Longest-side pixel cap for the cropped result handed back. */
  outputWidth: number;
  onCancel: () => void;
  onApply: (blob: Blob) => void;
};

function draw(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  st: EditState,
  w: number,
  h: number,
  pxScale: number,
) {
  const s =
    coverScale(img.naturalWidth, img.naturalHeight, st.rot, w, h) * st.zoom;
  ctx.clearRect(0, 0, w * pxScale, h * pxScale);
  ctx.save();
  ctx.scale(pxScale, pxScale);
  ctx.imageSmoothingQuality = "high";
  ctx.translate(w / 2 + st.panX, h / 2 + st.panY);
  // Flips are screen-space, so apply them outside the rotation.
  ctx.scale(st.flipH ? -1 : 1, st.flipV ? -1 : 1);
  ctx.rotate((st.rot * Math.PI) / 2);
  ctx.scale(s, s);
  ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
  ctx.restore();
}

export function ImageEditor({
  file,
  aspect,
  title,
  outputWidth,
  onCancel,
  onApply,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [st, setSt] = useState<EditState>(INITIAL_EDIT);
  const [frame, setFrame] = useState({ w: 0, h: 0 });
  const drag = useRef<{
    x: number;
    y: number;
    panX: number;
    panY: number;
  } | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    const el = new Image();
    // StrictMode runs this effect twice; the first run's URL is revoked, so
    // its load/error events must not reach state.
    let alive = true;
    el.onload = () => alive && setImg(el);
    el.onerror = () =>
      alive && setError("That file could not be read as an image.");
    el.src = url;
    return () => {
      alive = false;
      URL.revokeObjectURL(url);
    };
  }, [file]);

  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const measure = () => setFrame({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const change = useCallback(
    (patch: Partial<EditState>) => {
      if (!img || !frame.w) return;
      setSt((prev) => {
        const next = { ...prev, ...patch };
        return {
          ...next,
          ...clampPan(
            next.panX,
            next.panY,
            img.naturalWidth,
            img.naturalHeight,
            next.rot,
            next.zoom,
            frame.w,
            frame.h,
          ),
        };
      });
    },
    [img, frame.w, frame.h],
  );

  // Re-clamp when the frame resizes (pan is in frame pixels).
  useEffect(() => change({}), [change]);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !img || !frame.w) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = Math.round(frame.w * dpr);
    c.height = Math.round(frame.h * dpr);
    const ctx = c.getContext("2d");
    if (ctx) draw(ctx, img, st, frame.w, frame.h, dpr);
  }, [img, st, frame]);

  function apply() {
    if (!img || !frame.w) return;
    const width = Math.max(1, Math.round(outputWidth));
    const height = Math.max(1, Math.round(width / aspect));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setError("Canvas is unavailable in this browser.");
      return;
    }
    const k = width / frame.w;
    // Pan is stored in preview pixels; draw() scales it via pxScale.
    draw(ctx, img, st, frame.w, frame.h, k);
    canvas.toBlob(
      (b) => (b ? onApply(b) : setError("Could not encode the image.")),
      "image/png",
    );
  }

  const cx = img ? `${img.naturalWidth}×${img.naturalHeight}` : "";

  return (
    <div
      className="img-editor-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="img-editor">
        <h2 className="panel-title">{title}</h2>
        <div
          ref={frameRef}
          className="img-editor-frame"
          style={{ aspectRatio: String(aspect) }}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            drag.current = {
              x: e.clientX,
              y: e.clientY,
              panX: st.panX,
              panY: st.panY,
            };
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d) return;
            change({
              panX: d.panX + e.clientX - d.x,
              panY: d.panY + e.clientY - d.y,
            });
          }}
          onPointerUp={() => (drag.current = null)}
          onPointerCancel={() => (drag.current = null)}
        >
          <canvas ref={canvasRef} className="img-editor-canvas" />
        </div>
        <p className="field-hint">
          Drag to reposition · zoom to crop tighter{cx ? ` · source ${cx}` : ""}
        </p>
        <div className="btn-row">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={!img}
            onClick={() => change({ rot: (st.rot + 3) % 4 })}
          >
            ⟲ Rotate left
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={!img}
            onClick={() => change({ rot: (st.rot + 1) % 4 })}
          >
            ⟳ Rotate right
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={!img}
            onClick={() => change({ flipH: !st.flipH })}
          >
            ⇋ Flip horizontal
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={!img}
            onClick={() => change({ flipV: !st.flipV })}
          >
            ⇅ Flip vertical
          </button>
        </div>
        <div className="field">
          <label htmlFor="img-editor-zoom">
            Zoom · {Math.round(st.zoom * 100)}%
          </label>
          <input
            id="img-editor-zoom"
            type="range"
            className="range"
            min={1}
            max={MAX_ZOOM}
            step={0.01}
            disabled={!img}
            value={st.zoom}
            onChange={(e) => change({ zoom: Number(e.target.value) })}
          />
        </div>
        {error ? <p className="error-text">{error}</p> : null}
        <div className="btn-row img-editor-actions">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setSt(INITIAL_EDIT)}
          >
            Reset
          </button>
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!img}
            onClick={apply}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
