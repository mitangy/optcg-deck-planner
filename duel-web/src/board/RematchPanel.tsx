import { useState } from "react";
import type { RematchDeckOption } from "../decks/rematchDecks";
import type { PlayerDeckWire, RematchAction, RematchState, Seat, SeatPlayers } from "../net/protocol";
import { seatLabel, seatName } from "./playerNames";

/** Deck to send per seat with a rematch request; undefined keeps that seat's current deck. */
export type RematchDecks = [PlayerDeckWire | undefined, PlayerDeckWire | undefined];

/**
 * Turn each seat's picked deck id ("" keeps the deck) into the wire decks to
 * send with a rematch request, or undefined when every seat keeps its deck.
 */
export function decksFromPicks(options: readonly RematchDeckOption[], picks: readonly [string, string]): RematchDecks | undefined {
  const wire = (id: string) => (id ? options.find((o) => o.id === id)?.wire : undefined);
  const decks: RematchDecks = [wire(picks[0]), wire(picks[1])];
  return decks[0] || decks[1] ? decks : undefined;
}

function DeckSelect({
  options,
  value,
  label,
  onChange,
}: {
  options: readonly RematchDeckOption[];
  value: string;
  label: string;
  onChange: (id: string) => void;
}) {
  return (
    <label className="rematch-deck">
      <span className="rematch-deck-label">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Keep same deck</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {`${o.name} — ${o.leaderName} (${o.cards})`}
          </option>
        ))}
      </select>
    </label>
  );
}

type Props = {
  state: RematchState | null;
  mySeat: Seat;
  players: SeatPlayers | null;
  /** Practice: both seats are this player (agree from both; name seats). */
  autoAccept?: boolean;
  /** Saved decks to switch to before asking for / accepting (omit to hide the picker). */
  deckOptions?: readonly RematchDeckOption[];
  /** `decks` (by seat) accompanies "request" when a different deck was picked. */
  onAction: (action: RematchAction, decks?: RematchDecks) => void;
};

/**
 * Match-over rematch vote: both players agree, then the loser picks whether
 * to go first or second and a fresh game starts in the same room.
 */
export function RematchPanel({ state, mySeat, players, autoAccept = false, deckOptions, onAction }: Props) {
  const [picks, setPicks] = useState<[string, string]>(["", ""]);
  if (!state) return null;
  const oppSeat: Seat = mySeat === 0 ? 1 : 0;
  const oppName = seatName(players, oppSeat) ?? "Your opponent";

  if (!state.available) {
    return <p className="rematch-note">{oppName} left — a rematch isn&apos;t available.</p>;
  }

  if (state.chooser != null) {
    if (autoAccept || state.chooser === mySeat) {
      return (
        <div className="rematch-panel" role="group" aria-label="Choose turn order">
          <p className="rematch-note">
            <strong>
              {autoAccept ? `${seatLabel(players, state.chooser)} lost` : "You lost"}
            </strong>{" "}
            — pick the turn order for the rematch.
          </p>
          <div className="rematch-actions">
            <button type="button" className="btn btn-primary" onClick={() => onAction("first")}>
              Go first
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => onAction("second")}>
              Go second
            </button>
          </div>
        </div>
      );
    }
    return <p className="rematch-note">Rematch on! {oppName} is choosing who goes first…</p>;
  }

  const mine = state.requested[mySeat];
  const theirs = state.requested[oppSeat];
  const oppNewDeck = !autoAccept && state.newDeck[oppSeat];

  const pickers = deckOptions && deckOptions.length > 0 ? (
    <div className="rematch-decks">
      {(autoAccept ? ([0, 1] as const) : [mySeat]).map((seat) => (
        <DeckSelect
          key={seat}
          options={deckOptions}
          value={picks[seat]}
          label={autoAccept ? `${seatLabel(players, seat)}: deck for the rematch` : "Deck for the rematch"}
          onChange={(id) => setPicks((p) => (seat === 0 ? [id, p[1]] : [p[0], id]))}
        />
      ))}
    </div>
  ) : null;
  const request = () => onAction("request", deckOptions ? decksFromPicks(deckOptions, picks) : undefined);
  const myPick = deckOptions?.find((o) => o.id === picks[mySeat]);

  if (mine && !theirs) {
    return (
      <div className="rematch-panel">
        <p className="rematch-note">Waiting for {oppName} to accept the rematch…</p>
        {myPick ? <p className="rematch-note">You&apos;re bringing {myPick.name}.</p> : null}
        <div className="rematch-actions">
          <button type="button" className="btn btn-secondary" onClick={() => onAction("decline")}>
            Cancel request
          </button>
        </div>
      </div>
    );
  }

  if (theirs && !mine) {
    return (
      <div className="rematch-panel">
        <p className="rematch-note">
          <strong>{oppName} wants a rematch!</strong>
        </p>
        {oppNewDeck ? <p className="rematch-note">{oppName} is bringing a different deck.</p> : null}
        {pickers}
        <div className="rematch-actions">
          <button type="button" className="btn btn-primary" onClick={request}>
            Accept rematch
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => onAction("decline")}>
            No thanks
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rematch-panel">
      {state.declinedBy === oppSeat && !autoAccept ? (
        <p className="rematch-note">{oppName} declined the rematch.</p>
      ) : null}
      {pickers}
      <div className="rematch-actions">
        <button type="button" className="btn btn-primary" onClick={request}>
          {autoAccept ? "Rematch" : "Ask for a rematch"}
        </button>
      </div>
    </div>
  );
}
