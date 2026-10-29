import { useLocation } from "react-router-dom";
import { usePageMeta } from "@optcg/ui/seo";
import { routeMetaFor, SITE_ORIGIN } from "./routeMeta";

/** Keeps the tab title, description, canonical link and robots tag in step with the route. Place it once inside the Router. */
export function RouteMeta({ signedIn }: { signedIn: boolean }) {
  const { pathname } = useLocation();
  const meta = routeMetaFor(pathname, signedIn);
  usePageMeta({ title: meta.title, description: meta.description, path: pathname, origin: SITE_ORIGIN, noindex: meta.noindex });
  return null;
}
