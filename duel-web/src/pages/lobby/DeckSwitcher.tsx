import type { CSSProperties } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Listbox, ListboxButton, ListboxList, ListboxOption, Select } from "@optcg/ui/popups";
import { lookupCard } from "../../cards/atlas";
import { useCardDataReady } from "../../cards/cardData";
import { useArtFallback } from "../../cards/useArtFallback";
import { resolveCardImageUrl } from "../../decks/artPrefs";
import { groupByLeader } from "../../decks/groupByLeader";
import { isIncompleteDeck } from "../../decks/deckStatus";
import type { SavedDeck } from "../../decks/storage";
import { botMetaDecks } from "../../home/botMetaDecks";
import { BOT_DECK_RANDOM, BOT_DECK_RANDOM_META, metaDeckValue, metaSavedDeck } from "../../home/botGame";
import { leaderGlow } from "../../home/leaderGlow";

function leaderName(leaderId: string, ready: boolean): string {
  return ready ? lookupCard(leaderId).name : "—";
}

const BOT_YOUR_DECKS_GROUP = "__your-decks__";

const LEADER_GROUP = "__leader__:";

function deckLabel(d: SavedDeck, ready: boolean): string {
  return `${d.name} — ${leaderName(d.leaderId, ready)} (${d.cards.length}${isIncompleteDeck(d) ? "/50" : ""})`;
}

function leaderGroupOptions(decks: SavedDeck[], ready: boolean, nested: boolean) {
  return groupByLeader(decks, (d) => d.leaderId).flatMap((g) => [
    {
      value: `${LEADER_GROUP}${g.leaderId}`,
      label: (
        <span className={`deck-picker-group deck-picker-leader${nested ? " nested" : ""}`}>
          {leaderName(g.leaderId, ready)} · {g.leaderId}
        </span>
      ),
      disabled: true,
    },
    ...g.items.map((d) => ({
      value: d.id,
      label: `${d.name} (${d.cards.length}${isIncompleteDeck(d) ? "/50" : ""})`,
      buttonLabel: deckLabel(d, ready),
    })),
  ]);
}

function IncompleteBadge({ deck }: { deck: SavedDeck }) {
  return isIncompleteDeck(deck) ? (
    <span className="deck-incomplete-badge" title={`${deck.cards.length} of 50 main-deck cards`}>
      Incomplete
    </span>
  ) : null;
}

export function DeckPicker({
  id,
  label,
  decks,
  value,
  onChange,
  mirror,
  random,
  botMeta,
}: {
  id: string;
  label: string;
  decks: SavedDeck[];
  value: string;
  onChange: (id: string) => void;
  mirror?: { label: string; deck: SavedDeck | null };
  random?: { label: string; hint: string };
  botMeta?: boolean;
}) {
  const cardsReady = useCardDataReady();
  const isRandom = random !== undefined && value === BOT_DECK_RANDOM;
  const mirrored = value === "" && mirror !== undefined;
  const metaPick = botMeta
    ? botMetaDecks().find((m) => metaDeckValue(m.leaderId) === value)
    : undefined;
  const randomMeta = botMeta === true && value === BOT_DECK_RANDOM_META;
  const deck =
    isRandom || randomMeta
      ? null
      : metaPick
        ? metaSavedDeck(metaPick)
        : (decks.find((d) => d.id === value) ?? (mirrored ? (mirror.deck ?? null) : null));
  const unknown = isRandom || randomMeta || (mirrored && mirror.deck === null);
  return (
    <div className="field">
      <label htmlFor={id}>
        {label} {deck ? <IncompleteBadge deck={deck} /> : null}
      </label>
      <div className="deck-picker">
        {deck ? (
          <LeaderThumb key={deck.id} deck={deck} className="deck-picker-art" />
        ) : (
          <span className={`deck-picker-art${unknown ? " deck-picker-art-random" : ""}`} aria-hidden>
            {unknown ? "?" : null}
          </span>
        )}
        <Select
          id={id}
          value={value}
          onChange={onChange}
          options={
            botMeta
              ? [
                  { value: BOT_DECK_RANDOM_META, label: "Random meta deck" },
                  ...botMetaDecks().map((m) => ({
                    value: metaDeckValue(m.leaderId),
                    label: m.name,
                  })),
                  ...(decks.length > 0
                    ? [
                        {
                          value: BOT_YOUR_DECKS_GROUP,
                          label: <span className="deck-picker-group">Your decks</span>,
                          disabled: true,
                        },
                        ...leaderGroupOptions(decks, cardsReady, true),
                      ]
                    : []),
                ]
              : [
                  ...(mirror ? [{ value: "", label: mirror.label }] : []),
                  ...(random ? [{ value: BOT_DECK_RANDOM, label: random.label }] : []),
                  ...leaderGroupOptions(decks, cardsReady, false),
                ]
          }
        />
      </div>
      {botMeta ? (
        <p className="field-hint">
          The meta decks are recent top tournament lists from Limitless TCG, and
          the bot knows how to play these Leaders.
        </p>
      ) : isRandom ? (
        <p className="field-hint">{random.hint}</p>
      ) : null}
    </div>
  );
}

function LeaderThumb({ deck, className }: { deck: SavedDeck; className: string }) {
  const cardsReady = useCardDataReady();
  const { src: art, fail } = useArtFallback(
    cardsReady ? resolveCardImageUrl(deck.leaderId, { deck, size: "thumb" }) : undefined,
    deck.leaderId,
  );
  return art ? (
    <img className={className} src={art} alt="" onError={fail} />
  ) : (
    <span className={`${className} ${className}-empty`} aria-hidden />
  );
}

const NEW_DECK = "__new-deck__";
const MANAGE_DECKS = "__manage-decks__";

export function DeckSwitcher({
  decks,
  selectedDeck,
  onChoose,
}: {
  decks: SavedDeck[];
  selectedDeck: SavedDeck;
  onChoose: (id: string) => void;
}) {
  const navigate = useNavigate();
  const cardsReady = useCardDataReady();
  const glow = cardsReady ? leaderGlow(lookupCard(selectedDeck.leaderId).colors) : undefined;

  function pick(value: string) {
    if (value === NEW_DECK) navigate("/decks/new");
    else if (value === MANAGE_DECKS) navigate("/decks");
    else onChoose(value);
  }

  return (
    <Listbox value={selectedDeck.id} onChange={pick}>
      {({ open }: { open: boolean }) => (
        <div className="deck-switcher">
          <ListboxButton
            className={`home-deck${open ? " open" : ""}`}
            style={glow ? ({ "--glow": glow } as CSSProperties) : undefined}
          >
            <LeaderThumb key={selectedDeck.id} deck={selectedDeck} className="home-deck-art" />
            <span className="home-deck-text">
              <span className="home-deck-label">Sailing with</span>
              <span className="home-deck-name">{selectedDeck.name}</span>
              <span className="home-deck-leader">
                {leaderName(selectedDeck.leaderId, cardsReady)} · {selectedDeck.cards.length} cards{" "}
                <IncompleteBadge deck={selectedDeck} />
              </span>
              <span className="home-deck-change">
                Change deck{" "}
                <span className="home-deck-chevron" aria-hidden>
                  ▾
                </span>
              </span>
            </span>
          </ListboxButton>
          <Link to={`/decks/${selectedDeck.id}/configure`} className="home-deck-edit">
            Edit deck
          </Link>

          <ListboxList anchor={{ to: "bottom start", gap: 6, padding: 8 }} className="deck-menu">
            <div className="deck-menu-list">
              {groupByLeader(decks, (d) => d.leaderId).map((g) => (
                <div key={g.leaderId} role="group" aria-label={leaderName(g.leaderId, cardsReady)}>
                  <div className="deck-menu-leader" aria-hidden>
                    {leaderName(g.leaderId, cardsReady)} · {g.leaderId}
                  </div>
                  {g.items.map((d) => {
                    const active = d.id === selectedDeck.id;
                    return (
                      <ListboxOption
                        as="div"
                        key={d.id}
                        value={d.id}
                        className={`deck-menu-row${active ? " active" : ""}`}
                      >
                        <div className="deck-menu-pick">
                          <LeaderThumb deck={d} className="deck-menu-art" />
                          <span className="deck-menu-text">
                            <span className="deck-menu-name">{d.name}</span>
                            <span className="deck-menu-sub">
                              {d.cards.length} cards <IncompleteBadge deck={d} />
                            </span>
                          </span>
                          <span className="deck-menu-check" aria-hidden>
                            {active ? "✓" : ""}
                          </span>
                        </div>
                        <button
                          type="button"
                          className="deck-menu-edit"
                          aria-label={`Edit ${d.name}`}
                          title="Edit deck"
                          tabIndex={-1}
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/decks/${d.id}/configure`);
                          }}
                        >
                          Edit
                        </button>
                      </ListboxOption>
                    );
                  })}
                </div>
              ))}
            </div>
            <div className="deck-menu-foot">
              <ListboxOption as="div" value={NEW_DECK} className="btn btn-secondary btn-sm">
                + New deck
              </ListboxOption>
              <ListboxOption as="div" value={MANAGE_DECKS} className="btn btn-ghost btn-sm">
                Manage decks
              </ListboxOption>
            </div>
          </ListboxList>
        </div>
      )}
    </Listbox>
  );
}
