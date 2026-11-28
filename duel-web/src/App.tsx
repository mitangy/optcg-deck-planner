import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { SiteFooter } from "@optcg/site-legal";
import { LogPoseProvider } from "@optcg/analyst-client";
import { useProductEvents } from "./analytics/useProductEvents";
import { getApiBaseUrl } from "./config";
import { LeaveGameDialog } from "./LeaveGameDialog";
import { defaultLogPosePage, logPoseChromeFor, openDeckFor, openNewDeckFor, SOURCE_HOOKS, useBoardBrief } from "./logPose";
import { useLogPoseCardInspect } from "./logPoseCard";
import { APP_ROUTES } from "./routes";
import { useDuelSettings } from "./settings";
import { FeedbackHost } from "./FeedbackHost";
import { ReportHost } from "./reports/ReportHost";
import { openFeedback } from "./feedbackDialog";
import { RouteMeta } from "./seo/RouteMeta";
import { compactSiteFooter, FOOTER_EXTERNAL_LINKS, FOOTER_LINKS, showsSiteFooter } from "./siteFooter";
import { applyTextSize } from "./textSize";
import { applyPopupSize } from "./board/preview/popupSize";
import { applyTheme, LIGHT_QUERY } from "./theme";
import { useMediaQuery } from "@optcg/ui/hooks";

export function App() {
  const { reduceMotion, theme, colorMode, textSize, popupSize, previewPopupSize } = useDuelSettings();
  const deviceLight = useMediaQuery(LIGHT_QUERY);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  useProductEvents(pathname);
  const ownClaude = useMemo(() => ({ onSelect: () => navigate("/settings#log-pose") }), [navigate]);
  const pathRef = useRef(pathname);
  pathRef.current = pathname;
  const [leaving, setLeaving] = useState<(() => void) | null>(null);
  const { openCard, inspect: cardInspect } = useLogPoseCardInspect();
  const sources = useMemo(
    () => ({ ...SOURCE_HOOKS, openCard, openDeck: openDeckFor((to) => navigate(to)), openNewDeck: openNewDeckFor((to, o) => navigate(to, o), () => pathRef.current, (go) => setLeaving(() => go)) }),
    [navigate, openCard],
  );
  useLayoutEffect(() => applyTheme(theme, colorMode), [theme, colorMode, deviceLight]);
  useLayoutEffect(() => applyTextSize(textSize), [textSize]);
  useLayoutEffect(() => applyPopupSize(popupSize), [popupSize]);
  useLayoutEffect(() => applyPopupSize(previewPopupSize, document.documentElement, "previewPopupSize"), [previewPopupSize]);
  useEffect(() => {
    if (reduceMotion) document.documentElement.dataset.motion = "reduce";
    else delete document.documentElement.dataset.motion;
  }, [reduceMotion]);
  const logPosePage = useMemo(() => defaultLogPosePage(pathname), [pathname]);
  const chrome = logPoseChromeFor(pathname, useBoardBrief());

  return (
    <LogPoseProvider apiBase={getApiBaseUrl()} hidden={chrome.hidden} launcher={chrome.launcher} defaultPage={logPosePage} sources={sources} ownClaude={ownClaude}>
      <RouteMeta />
      <Suspense fallback={<div className="route-fallback" aria-busy="true" />}>
        <Routes>
          {APP_ROUTES.map((r) => (
            <Route key={r.path} path={r.path} element={r.element} />
          ))}
        </Routes>
      </Suspense>
      {showsSiteFooter(pathname) && <SiteFooter Link={Link} className="site-footer-centered" compact={compactSiteFooter(pathname)} extraLinks={FOOTER_LINKS} externalLinks={FOOTER_EXTERNAL_LINKS} onFeedback={() => openFeedback("Send feedback")} />}
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
      {cardInspect}
    </LogPoseProvider>
  );
}
