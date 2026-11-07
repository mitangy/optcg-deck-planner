import { useEffect, useState } from "react";

/** Matches the shopping mobile breakpoint in styles.css (`max-width: 800px`). */
export function useNarrowLayout() {
  const [narrow, setNarrow] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 800px)").matches : false,
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 800px)");
    const onChange = () => setNarrow(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return narrow;
}
