import { Fragment, useMemo, type ReactNode } from "react";
import { parseMarkdown, type Block, type Inline } from "./markdown";

function inlines(nodes: Inline[]): ReactNode[] {
  return nodes.map((n, k) => {
    switch (n.t) {
      case "text":
        return <Fragment key={k}>{n.v}</Fragment>;
      case "b":
        return <strong key={k}>{inlines(n.c)}</strong>;
      case "i":
        return <em key={k}>{inlines(n.c)}</em>;
      case "code":
        return <code key={k}>{n.v}</code>;
      case "a":
        return (
          <a key={k} href={n.href} target="_blank" rel="noopener noreferrer">
            {inlines(n.c)}
          </a>
        );
      case "br":
        return <br key={k} />;
    }
  });
}

function block(b: Block, k: number): ReactNode {
  switch (b.t) {
    case "p":
      return <p key={k}>{inlines(b.c)}</p>;
    case "h":
      // Headings stay small inside a chat bubble.
      return (
        <p key={k} className={`lp-md-h lp-md-h${Math.min(b.level, 3)}`}>
          {inlines(b.c)}
        </p>
      );
    case "ul":
      return (
        <ul key={k}>
          {b.items.map((it, j) => (
            <li key={j}>{inlines(it)}</li>
          ))}
        </ul>
      );
    case "ol":
      return (
        <ol key={k} start={b.start === 1 ? undefined : b.start}>
          {b.items.map((it, j) => (
            <li key={j}>{inlines(it)}</li>
          ))}
        </ol>
      );
    case "code":
      return (
        <pre key={k} className="lp-md-pre">
          <code>{b.v}</code>
        </pre>
      );
    case "table":
      return (
        <div key={k} className="lp-md-table" tabIndex={0} role="region" aria-label="Table">
          <table>
            <thead>
              <tr>
                {b.head.map((c, j) => (
                  <th key={j}>{inlines(c)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {b.rows.map((r, j) => (
                <tr key={j}>
                  {r.map((c, m) => (
                    <td key={m}>{inlines(c)}</td>
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
export function Markdown({ text, className }: { text: string; className?: string }) {
  const blocks = useMemo(() => parseMarkdown(text), [text]);
  return <div className={className ? `lp-md ${className}` : "lp-md"}>{blocks.map(block)}</div>;
}
