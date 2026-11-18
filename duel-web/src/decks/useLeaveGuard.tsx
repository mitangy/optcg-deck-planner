import { useEffect, useRef, useState } from "react";

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

export const LEAVE_BACK = "history:back";

const GUARD_KEY = "leaveGuard";
const isGuardEntry = () => Boolean((window.history.state as Record<string, unknown> | null)?.[GUARD_KEY]);

export function useLeaveGuard(dirty: boolean): {
  pending: string | null;
  clear: () => void;
  go: (to: string, navigate: (to: string) => void) => void;
} {
  const [pending, setPending] = useState<string | null>(null);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const onSentinel = useRef(false);

  const arm = () => {
    if (onSentinel.current) return;
    window.history.pushState({ ...(window.history.state ?? {}), [GUARD_KEY]: true }, "");
    onSentinel.current = true;
  };

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
    const onPopState = () => {
      if (onSentinel.current && !isGuardEntry()) {
        onSentinel.current = false;
        setPending(LEAVE_BACK);
      }
    };
    arm();
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("popstate", onPopState);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("popstate", onPopState);
      document.removeEventListener("click", onClick, true);
      if (!dirtyRef.current && onSentinel.current) {
        onSentinel.current = false;
        if (isGuardEntry()) window.history.back();
      }
    };
  }, [dirty]);

  const clear = () => {
    setPending(null);
    if (dirtyRef.current) arm();
  };

  const go = (to: string, navigate: (to: string) => void) => {
    setPending(null);
    const finish = () => (to === LEAVE_BACK ? window.history.back() : navigate(to));
    if (onSentinel.current && isGuardEntry()) {
      // Pop the sentinel first so the trip adds (link) or follows (Back) real entries only.
      onSentinel.current = false;
      window.addEventListener("popstate", finish, { once: true });
      window.history.back();
    } else {
      onSentinel.current = false;
      finish();
    }
  };

  return { pending, clear, go };
}
