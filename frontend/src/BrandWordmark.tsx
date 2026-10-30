/**
 * Our own text wordmark for the top bar ("OPTCG" followed by the page's
 * "Planner" span). Plain text, so it needs no alt text and no image request.
 * A <b> rather than a <span>: `.brand a span` styles the "Planner" label.
 */
export function BrandWordmark() {
  return <b className="brand-wordmark">OPTCG</b>;
}
