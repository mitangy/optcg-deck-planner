import { useEffect, useRef } from "react";
import { readDroppedImage } from "./cardScanImage";
import { describeDataTransfer, scanLog } from "./scanLog";

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
