export type PrerenderHead = {
  title: string;
  description: string;
  canonical?: string;
  image?: string;
  noindex?: boolean;
  extraHead?: string;
  jsonLd?: unknown;
};

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function jsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function setMeta(html: string, attr: "name" | "property", key: string, content: string): string {
  const tag = `<meta ${attr}="${key}" content="${escapeHtml(content)}" />`;
  const re = new RegExp(`<meta\\s+${attr}="${escapeRe(key)}"[^>]*>`);
  return re.test(html) ? html.replace(re, () => tag) : html.replace("</head>", () => `    ${tag}\n  </head>`);
}

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
  if (head.jsonLd !== undefined) html = html.replace("</head>", () => `    <script type="application/ld+json">${jsonForScript(head.jsonLd)}</script>\n  </head>`);
  if (head.extraHead) html = html.replace("</head>", () => `    ${head.extraHead}\n  </head>`);
  return html;
}

const EMPTY_ROOT = '<div id="root"></div>';

// The client boots with `createRoot`, which replaces this markup; `data-prerendered` lets it tell the markup came from the server.
export function injectRoot(template: string, rootHtml: string, data?: { id: string; value: unknown }): string {
  if (!template.includes(EMPTY_ROOT)) throw new Error('prerender: the template has no empty <div id="root"></div>');
  const script = data ? `<script type="application/json" id="${escapeHtml(data.id)}">${jsonForScript(data.value)}</script>` : "";
  return template.replace(EMPTY_ROOT, () => `<div id="root" data-prerendered>${rootHtml}</div>${script}`);
}
