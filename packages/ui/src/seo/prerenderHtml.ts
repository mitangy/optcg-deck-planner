/**
 * String helpers for build-time pre-rendering (#914): they turn the built `index.html`
 * into a per-route page whose `<head>` and `#root` already hold the real content, so a
 * crawler that does not run JavaScript still sees it. No DOM, so they run in Node.
 */

export type PrerenderHead = {
  title: string;
  description: string;
  /** Absolute canonical URL. Left out for a noindex page. */
  canonical?: string;
  /** Absolute URL of the share picture (og:image, twitter:image). */
  image?: string;
  noindex?: boolean;
  /** Extra markup for the end of `<head>`, e.g. a JSON-LD script. */
  extraHead?: string;
};

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** JSON that is safe inside a `<script>`: a `<` can never close the tag early. */
export function jsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Sets `<meta {attr}="{key}" content>`; adds the tag at the end of `<head>` when the template has none. */
function setMeta(html: string, attr: "name" | "property", key: string, content: string): string {
  const tag = `<meta ${attr}="${key}" content="${escapeHtml(content)}" />`;
  const re = new RegExp(`<meta\\s+${attr}="${escapeRe(key)}"[^>]*>`);
  return re.test(html) ? html.replace(re, () => tag) : html.replace("</head>", () => `    ${tag}\n  </head>`);
}

/** Replaces the page title, description, canonical link, robots tag and social tags of a built `index.html`. */
export function applyHead(template: string, head: PrerenderHead): string {
  let html = template.replace(/<title>[\s\S]*?<\/title>/, () => `<title>${escapeHtml(head.title)}</title>`);
  html = setMeta(html, "name", "description", head.description);
  html = html.replace(/\s*<link rel="canonical"[^>]*>/, "").replace(/\s*<meta name="robots"[^>]*>/, "");
  const robotsOrCanonical = head.noindex
    ? `<meta name="robots" content="noindex" />`
    : head.canonical
      ? `<link rel="canonical" href="${escapeHtml(head.canonical)}" />`
      : "";
  if (robotsOrCanonical) html = html.replace("</head>", () => `    ${robotsOrCanonical}\n  </head>`);
  html = setMeta(html, "property", "og:title", head.title);
  html = setMeta(html, "name", "twitter:title", head.title);
  html = setMeta(html, "property", "og:description", head.description);
  html = setMeta(html, "name", "twitter:description", head.description);
  if (head.canonical && !head.noindex) html = setMeta(html, "property", "og:url", head.canonical);
  if (head.image) {
    html = setMeta(html, "property", "og:image", head.image);
    html = setMeta(html, "name", "twitter:image", head.image);
  }
  if (head.extraHead) html = html.replace("</head>", () => `    ${head.extraHead}\n  </head>`);
  return html;
}

const EMPTY_ROOT = '<div id="root"></div>';

/**
 * Puts the rendered markup inside `#root`. The client boots with `createRoot`, which replaces it;
 * `data-prerendered` lets the app tell that the markup on screen came from the server.
 * `data` (optional) is page data the client reads synchronously, so its first render matches.
 */
export function injectRoot(template: string, rootHtml: string, data?: { id: string; value: unknown }): string {
  if (!template.includes(EMPTY_ROOT)) throw new Error('prerender: the template has no empty <div id="root"></div>');
  const script = data ? `<script type="application/json" id="${escapeHtml(data.id)}">${jsonForScript(data.value)}</script>` : "";
  return template.replace(EMPTY_ROOT, () => `<div id="root" data-prerendered>${rootHtml}</div>${script}`);
}
