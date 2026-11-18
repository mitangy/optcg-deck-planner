import { useLocation } from "react-router-dom";
import { usePageMeta } from "@optcg/ui/seo";
import { routeMetaFor, SITE_ORIGIN } from "./routeMetaTable";

export function RouteMeta() {
  const { pathname } = useLocation();
  const meta = routeMetaFor(pathname);
  usePageMeta({ title: meta.title, description: meta.description, path: pathname, origin: SITE_ORIGIN, noindex: meta.noindex });
  return null;
}
