import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { SiteFooter } from "@optcg/site-legal";
import { LogPoseProvider } from "@optcg/analyst-client";
import { getApiBaseUrl } from "./config";
import { LeaveGameDialog } from "./LeaveGameDialog";
import { defaultLogPosePage, logPoseChromeFor, openDeckFor, openNewDeckFor, SOURCE_HOOKS, useBoardBrief } from "./logPose";
import { APP_ROUTES } from "./routes";
import { useDuelSettings } from "./settings";
import { FeedbackHost } from "./FeedbackHost";
import { ReportHost } from "./reports/ReportHost";
import { openFeedback } from "./feedbackDialog";
import { RouteMeta } from "./seo/RouteMeta";
import { FOOTER_EXTERNAL_LINKS, FOOTER_LINKS, showsSiteFooter } from "./siteFooter";
import { applyTextSize } from "./textSize";
import { applyPopupSize } from "./board/popupSize";
import { applyTheme, LIGHT_QUERY } from "./theme";
import { useMediaQuery } from "@optcg/ui/hooks";

export function App() {
  const { reduceMotion, theme, colorMode, textSize, popupSize, previewPopupSize } = useDuelSettings();
  // Re-applies when the device switches light / dark while on "Match my device".
  const deviceLight = useMediaQuery(LIGHT_QUERY);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  // A player out of Log Pose credit can use it on their own Claude plan: that link is made in Settings.
  const ownClaude = useMemo(() => ({ onSelect: () => navigate("/settings#log-pose") }), [navigate]);
  // A deck Log Pose builds opens the create-deck page; it never takes the player off a live board by itself (#726).
  const pathRef = useRef(pathname);
  pathRef.current = pathname;
  const [leaving, setLeaving] = useState<(() => void) | null>(null);
  const sources = useMemo(
    () => ({ ...SOURCE_HOOKS, openDeck: openDeckFor((to) => navigate(to)), openNewDeck: openNewDeckFor((to, o) => navigate(to, o), () => pathRef.current, (go) => setLeaving(() => go)) }),
    [navigate],
  );
  // Before paint, so switching theme (or loading it from the account) never
  // flashes the old palette.
  useLayoutEffect(() => applyTheme(theme, colorMode), [theme, colorMode, deviceLight]);
  useLayoutEffect(() => applyTextSize(textSize), [textSize]);
  useLayoutEffect(() => applyPopupSize(popupSize), [popupSize]);
  useLayoutEffect(() => applyPopupSize(previewPopupSize, document.documentElement, "previewPopupSize"), [previewPopupSize]);
  // CSS mirrors its prefers-reduced-motion rules under [data-motion="reduce"].
  useEffect(() => {
    if (reduceMotion) document.documentElement.dataset.motion = "reduce";
    else delete document.documentElement.dataset.motion;
  }, [reduceMotion]);
  const logPosePage = useMemo(() => defaultLogPosePage(pathname), [pathname]);
  const chrome = logPoseChromeFor(pathname, useBoardBrief());

  return (
    <LogPoseProvider apiBase={getApiBaseUrl()} hidden={chrome.hidden} launcher={chrome.launcher} defaultPage={logPosePage} sources={sources} ownClaude={ownClaude}>
      <RouteMeta />
      {/* One stable fallback for every lazy route: it only reserves the viewport, so nothing jumps when the page lands. */}
      <Suspense fallback={<div className="route-fallback" aria-busy="true" />}>
        <Routes>
          {APP_ROUTES.map((r) => (
            <Route key={r.path} path={r.path} element={r.element} />
          ))}
        </Routes>
      </Suspense>
      {showsSiteFooter(pathname) && <SiteFooter Link={Link} className="site-footer-centered" extraLinks={FOOTER_LINKS} externalLinks={FOOTER_EXTERNAL_LINKS} onFeedback={() => openFeedback("Send feedback")} />}
      <FeedbackHost />
      <ReportHost />
      <LeaveGameDialog
        open={leaving !== null}
        onStay={() => setLeaving(null)}
        onLeave={() => {
          const go = leaving;
          setLeaving(null);
          go?.();
        }}
      />
    </LogPoseProvider>
  );
}
