/**
 * Anchor matching shared by run.cjs (--check-anchors, applying a mutation) and
 * locate.cjs (--locate-stale). Pure functions, no I/O.
 *
 * An anchor (`from`) is matched exactly first. Only when that finds nothing do
 * we fall back to a whitespace-tolerant match, so a formatter or a move that
 * re-indents code does not make every anchor stale: one-or-more whitespace in
 * `from` matches one-or-more whitespace in the source (a line break plus
 * indentation counts as one run), and leading/trailing whitespace of `from` is
 * ignored. Whitespace is never added or removed next to punctuation, so
 * `a(b)` does not match `a( b )`.
 */
"use strict";

const crlf = (x) => x.split("\n").join("\r\n");
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Whitespace-tolerant regex for `from`, or null when it is all whitespace. */
function looseRegex(from) {
  const tokens = from.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return null;
  return new RegExp(tokens.map(escapeRe).join("\\s+"), "g");
}

/**
 * Find `from` in `text`. Returns { count, mode, spans, from } where mode is
 * "exact" (including the CRLF spelling of `from`, returned as `from`) or
 * "loose" (whitespace-tolerant fallback), and spans lists [start, end) of each
 * match. count 0 means stale.
 */
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

/**
 * Replace the single match of `from` in `text` with `to`. Returns
 * { updated, mode } or { error, count }. A loose match replaces only the span
 * the trimmed anchor covers, so outer whitespace that `from` and `to` share
 * (usually indentation and the final newline) stays as the source has it.
 */
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
