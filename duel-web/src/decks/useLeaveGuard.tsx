import { useEffect, useRef, useState } from "react";

/** The in-app link a click was heading to, or null for clicks the guard leaves alone (new tab, external, same page). */
export function internalLinkTarget(e: MouseEvent, origin: string, current: string): string | null {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return null;
  const el = e.target instanceof Element ? e.target.closest("a[href]") : null;
  if (!(el instanceof HTMLAnchorElement)) return null;
  if (el.hasAttribute("download") || (el.target && el.target !== "_self")) return null;
  const url = new URL(el.href, origin);
  if (url.origin !== origin) return null;
  const to = url.pathname + url.search + url.hash;
  return to === current ? null : to;
}

/**
 * While `dirty`, asks before the page is left: the browser's own prompt for reload/close, and `pending` (the
 * in-app link that was clicked) for the page to show its Save / Discard / Keep editing dialog (#481).
 * BrowserRouter has no useBlocker, so in-app links are caught by a capture-phase click listener.
 */
export function useLeaveGuard(dirty: boolean): { pending: string | null; clear: () => void } {
  const [pending, setPending] = useState<string | null>(null);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    const onClick = (e: MouseEvent) => {
      if (!dirtyRef.current) return;
      const to = internalLinkTarget(e, window.location.origin, window.location.pathname + window.location.search + window.location.hash);
      if (!to) return;
      e.preventDefault();
      e.stopPropagation();
      setPending(to);
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty]);

  return { pending, clear: () => setPending(null) };
}
