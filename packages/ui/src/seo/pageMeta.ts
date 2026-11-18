import { useEffect } from "react";

export type PageMeta = {
  title: string;
  description?: string;
  path?: string;
  origin: string;
  noindex?: boolean;
  image?: string;
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

function syncIfPresent(attr: "name" | "property", key: string, content: string) {
  const el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (el) el.setAttribute("content", content);
}

export function canonicalUrl(origin: string, path = "/"): string {
  const base = origin.replace(/\/+$/, "");
  const pathname = path.split(/[?#]/)[0] || "/";
  const clean = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return `${base}${clean.startsWith("/") ? clean : `/${clean}`}`;
}

export function applyPageMeta({ title, description, path, origin, noindex, image }: PageMeta): void {
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
  if (image) {
    syncIfPresent("property", "og:image", image);
    syncIfPresent("name", "twitter:image", image);
  }
}

export function usePageMeta(meta: PageMeta): void {
  const { title, description, path, origin, noindex, image } = meta;
  useEffect(() => {
    applyPageMeta({ title, description, path, origin, noindex, image });
  }, [title, description, path, origin, noindex, image]);
}
