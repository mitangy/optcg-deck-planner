import { useLocation } from "react-router-dom";
import { usePageMeta } from "@optcg/ui/seo";
import { routeMetaFor, SITE_ORIGIN } from "./routeMeta";

/**
 * Keeps the tab title, description, canonical link and robots tag in step with the
 * route. Place it once inside the Router.
 *
 * It only runs when the path changes, never on later renders, so the "Your move"
 * mark the turn alert puts in front of the title while a match tab is hidden
 * (board/turnAlert.ts) is not overwritten.
 */
export function RouteMeta() {
  const { pathname } = useLocation();
  const meta = routeMetaFor(pathname);
  usePageMeta({ title: meta.title, description: meta.description, path: pathname, origin: SITE_ORIGIN, noindex: meta.noindex });
  return null;
}
