import { Fragment, useMemo, type ReactNode } from "react";
import { MARK_RE, splitMarks } from "./citations";
import { parseMarkdown, type Block, type Inline } from "./markdown";

/** Draws the citation marker with this index (see placeMarkers). */
type RenderMark = (index: number) => ReactNode;

/** Draws a stretch of plain text (not code, not link text), so the host can decorate parts of it. */
type RenderText = (text: string) => ReactNode;

function inlines(nodes: Inline[], mark?: RenderMark, text?: RenderText): ReactNode[] {
  return nodes.map((n, k) => {
    switch (n.t) {
      case "text":
        return (
          <Fragment key={k}>
            {splitMarks(n.v).map((part, j) => (typeof part === "number" ? <Fragment key={j}>{mark ? mark(part) : null}</Fragment> : text ? <Fragment key={j}>{text(part)}</Fragment> : part))}
          </Fragment>
        );
      case "b":
        return <strong key={k}>{inlines(n.c, mark, text)}</strong>;
      case "i":
        return <em key={k}>{inlines(n.c, mark, text)}</em>;
      case "code":
        return <code key={k}>{n.v.replace(MARK_RE, "")}</code>;
      case "a":
        return (
          <a key={k} href={n.href.replace(MARK_RE, "")} target="_blank" rel="noopener noreferrer">
            {inlines(n.c, mark)}
          </a>
        );
      case "br":
        return <br key={k} />;
    }
  });
}

function block(b: Block, k: number, mark?: RenderMark, text?: RenderText): ReactNode {
  switch (b.t) {
    case "p":
      return <p key={k}>{inlines(b.c, mark, text)}</p>;
    case "h":
      // Headings stay small inside a chat bubble.
      return (
        <p key={k} className={`lp-md-h lp-md-h${Math.min(b.level, 3)}`}>
          {inlines(b.c, mark, text)}
        </p>
      );
    case "ul":
      return (
        <ul key={k}>
          {b.items.map((it, j) => (
            <li key={j}>{inlines(it, mark, text)}</li>
          ))}
        </ul>
      );
    case "ol":
      return (
        <ol key={k} start={b.start === 1 ? undefined : b.start}>
          {b.items.map((it, j) => (
            <li key={j}>{inlines(it, mark, text)}</li>
          ))}
        </ol>
      );
    case "code":
      return (
        <pre key={k} className="lp-md-pre">
          <code>{b.v.replace(MARK_RE, "")}</code>
        </pre>
      );
    case "table":
      return (
        <div key={k} className="lp-md-table" tabIndex={0} role="region" aria-label="Table">
          <table>
            <thead>
              <tr>
                {b.head.map((c, j) => (
                  <th key={j}>{inlines(c, mark, text)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {b.rows.map((r, j) => (
                <tr key={j}>
                  {r.map((c, m) => (
                    <td key={m}>{inlines(c, mark, text)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "hr":
      return <hr key={k} />;
  }
}

/** Assistant text rendered from the safe Markdown subset (see markdown.ts). No HTML is ever injected. */
export function Markdown({ text, className, renderMark, renderText }: { text: string; className?: string; renderMark?: RenderMark; renderText?: RenderText }) {
  const blocks = useMemo(() => parseMarkdown(text), [text]);
  return <div className={className ? `lp-md ${className}` : "lp-md"}>{blocks.map((b, k) => block(b, k, renderMark, renderText))}</div>;
}
