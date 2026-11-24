import { useContext, useState } from "react";
import { canAddCopy, copiesIn, type CardList, type CardListRow } from "./cardLists";
import { SourceHooksContext } from "./Sources";
import { CardThumbButton } from "./CardThumbButton";
import type { DeckEditor } from "./proposals";

const MINUS = "−";

const errorMessage = (e: unknown) => (e instanceof Error && e.message.trim() ? e.message.trim() : "Couldn't save that change. Nothing was changed.");

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function statsOf(c: CardListRow): string {
  return [
    cap(c.type),
    c.colors.map(cap).join("/"),
    c.cost !== undefined ? `cost ${c.cost}` : "",
    c.power !== undefined ? `power ${c.power}` : "",
    c.counter ? `counter +${c.counter}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Cards found for a description. With a deck open each row has a stepper that adds or removes one copy; without one the rows are only shown. */
export function CardListCard({ list, editor }: { list: CardList; editor: DeckEditor | null }) {
  const hooks = useContext(SourceHooksContext);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState("");

  const change = async (row: CardListRow, delta: 1 | -1) => {
    if (!editor || working) return;
    const before = copiesIn(editor.cards, row.id);
    const after = before + delta;
    if (after < 0 || (delta > 0 && !canAddCopy(row, before))) return;
    setWorking(row.id);
    setError("");
    try {
      await editor.apply([{ id: row.id, before, after }]);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setWorking(null);
    }
  };

  return (
    <section className="lp-edit lp-cl" aria-label={`Cards: ${list.title}`}>
      <h3 className="lp-edit-head">
        <span className="lp-edit-head-text">{list.title}</span>
      </h3>
      <ul className="lp-cl-rows">
        {list.cards.map((c) => {
          const art = hooks.card?.(c.id);
          const name = art?.name ?? c.name;
          const copies = editor ? copiesIn(editor.cards, c.id) : 0;
          const leader = c.type === "leader";
          const busy = working === c.id;
          return (
            <li key={c.id} className="lp-cl-row" data-busy={busy ? "true" : undefined}>
              <CardThumbButton id={c.id} name={name} className="lp-edit-thumb lp-cl-thumb">
                {art?.imageUrl ? <img src={art.imageUrl} alt="" loading="lazy" decoding="async" onError={(e) => (e.currentTarget.style.visibility = "hidden")} /> : null}
              </CardThumbButton>
              <span className="lp-cl-main">
                <span className="lp-edit-name-text" title={`${name} (${c.id})`}>
                  {name} <span className="lp-edit-id">{c.id}</span>
                </span>
                <span className="lp-cl-stats">{statsOf(c)}</span>
                {c.reason ? <span className="lp-edit-reason lp-cl-reason">{c.reason}</span> : null}
              </span>
              {editor && !leader ? (
                <span className="lp-cl-step" role="group" aria-label={`${name} in your deck`}>
                  <button type="button" className="lp-btn lp-cl-btn" aria-label={`Remove one ${name}`} onClick={() => void change(c, -1)} disabled={working !== null || copies === 0}>
                    {MINUS}
                  </button>
                  <span className="lp-cl-count" aria-label={`${copies} in deck`} title="Copies in your deck">
                    {copies}
                  </span>
                  <button
                    type="button"
                    className="lp-btn lp-cl-btn lp-cl-add"
                    aria-label={`Add one ${name}`}
                    aria-busy={busy}
                    onClick={() => void change(c, 1)}
                    disabled={working !== null || !canAddCopy(c, copies)}
                  >
                    +
                  </button>
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
      <p className="lp-edit-status lp-cl-status" role="status" aria-live="polite" data-error={error ? "true" : undefined}>
        {error || (editor ? "" : "Open a deck to add these cards.")}
      </p>
    </section>
  );
}
