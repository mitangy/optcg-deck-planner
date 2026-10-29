import { useEffect } from "react";

export type PageMeta = {
  title: string;
  description?: string;
  /** Pathname of the page; query and hash are dropped from the canonical URL. */
  path?: string;
  /** Site origin without a trailing slash, e.g. https://optcgduel.app. */
  origin: string;
  /** Keep search engines from listing the page. Removes the canonical link. */
  noindex?: boolean;
};

function upsert(selector: string, create: () => HTMLElement): HTMLElement {
  let el = document.head.querySelector<HTMLElement>(selector);
  if (!el) {
    el = create();
    document.head.appendChild(el);
  }
  return el;
}

function setNamedMeta(attr: "name" | "property", key: string, content: string) {
  const el = upsert(`meta[${attr}="${key}"]`, () => {
    const m = document.createElement("meta");
    m.setAttribute(attr, key);
    return m;
  });
  el.setAttribute("content", content);
}

function removeAll(selector: string) {
  for (const el of Array.from(document.head.querySelectorAll(selector))) el.remove();
}

/** Only touches a social tag the page already ships (index.html carries the defaults). */
function syncIfPresent(attr: "name" | "property", key: string, content: string) {
  const el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (el) el.setAttribute("content", content);
}

/** The canonical URL of a page: origin plus pathname, with no query, hash or trailing slash (except the root). */
export function canonicalUrl(origin: string, path = "/"): string {
  const base = origin.replace(/\/+$/, "");
  const pathname = path.split(/[?#]/)[0] || "/";
  const clean = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return `${base}${clean.startsWith("/") ? clean : `/${clean}`}`;
}

/** Sets the document title, description, canonical link, robots and social tags for the page being shown. */
export function applyPageMeta({ title, description, path, origin, noindex }: PageMeta): void {
  document.title = title;
  if (description !== undefined) setNamedMeta("name", "description", description);

  // A private page must not leave its noindex behind for the next public page.
  removeAll('meta[name="robots"]');
  removeAll('link[rel="canonical"]');
  const url = path !== undefined ? canonicalUrl(origin, path) : undefined;
  if (noindex) {
    setNamedMeta("name", "robots", "noindex");
  } else if (url) {
    const link = document.createElement("link");
    link.setAttribute("rel", "canonical");
    link.setAttribute("href", url);
    document.head.appendChild(link);
  }

  syncIfPresent("property", "og:title", title);
  syncIfPresent("name", "twitter:title", title);
  if (description !== undefined) {
    syncIfPresent("property", "og:description", description);
    syncIfPresent("name", "twitter:description", description);
  }
  if (url) syncIfPresent("property", "og:url", url);
}

/** Applies the page meta while the component is mounted and whenever a field changes. */
export function usePageMeta(meta: PageMeta): void {
  const { title, description, path, origin, noindex } = meta;
  useEffect(() => {
    applyPageMeta({ title, description, path, origin, noindex });
  }, [title, description, path, origin, noindex]);
}
