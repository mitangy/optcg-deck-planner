// An anchor is matched exactly first; only when that finds nothing does the whitespace-tolerant fallback apply, so a formatter or move that re-indents code does not make every anchor stale. Whitespace is never added or removed next to punctuation, so `a(b)` does not match `a( b )`.
"use strict";

const crlf = (x) => x.split("\n").join("\r\n");
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function looseRegex(from) {
  const tokens = from.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return null;
  return new RegExp(tokens.map(escapeRe).join("\\s+"), "g");
}

function findAnchor(text, from) {
  const variant = !text.includes(from) && text.includes(crlf(from)) ? crlf(from) : from;
  const spans = [];
  if (variant) for (let i = text.indexOf(variant); i >= 0; i = text.indexOf(variant, i + variant.length)) spans.push([i, i + variant.length]);
  if (spans.length) return { count: spans.length, mode: "exact", spans, from: variant };
  const re = looseRegex(from);
  if (!re) return { count: 0, mode: "exact", spans: [], from };
  const loose = [...text.matchAll(re)].map((m) => [m.index, m.index + m[0].length]);
  return { count: loose.length, mode: loose.length ? "loose" : "exact", spans: loose, from };
}

// A loose match replaces only the span the trimmed anchor covers, so outer whitespace that `from` and `to` share stays as the source has it.
function applyAnchor(text, from, to) {
  const found = findAnchor(text, from);
  if (found.count !== 1) return { error: true, count: found.count };
  const [start, end] = found.spans[0];
  let replacement = to;
  if (found.mode === "exact") {
    if (found.from !== from) replacement = crlf(to);
  } else {
    const lead = /^\s*/.exec(from)[0];
    const trail = /\s*$/.exec(from)[0];
    if (lead && replacement.startsWith(lead)) replacement = replacement.slice(lead.length);
    if (trail && replacement.endsWith(trail)) replacement = replacement.slice(0, replacement.length - trail.length);
  }
  return { updated: text.slice(0, start) + replacement + text.slice(end), mode: found.mode };
}

module.exports = { findAnchor, applyAnchor, looseRegex };
