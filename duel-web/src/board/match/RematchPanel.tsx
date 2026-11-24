import { Select } from "@optcg/ui/popups";
import { useState } from "react";
import { groupByLeader } from "../../decks/groupByLeader";
import type { RematchDeckOption } from "../../decks/rematchDecks";
import type { PlayerDeckWire, RematchAction, RematchState, Seat, SeatPlayers } from "../../net/protocol";
import { seatLabel, seatName } from "./playerNames";

export type RematchDecks = [PlayerDeckWire | undefined, PlayerDeckWire | undefined];

export function decksFromPicks(options: readonly RematchDeckOption[], picks: readonly [string, string]): RematchDecks | undefined {
  const wire = (id: string) => (id ? options.find((o) => o.id === id)?.wire : undefined);
  const decks: RematchDecks = [wire(picks[0]), wire(picks[1])];
  return decks[0] || decks[1] ? decks : undefined;
}

const KEEP_DECK = "Keep same deck";
const LEADER_GROUP = "__leader__:";

// A native select draws its open list in browser colours (near-invisible text on Windows Chrome), so the list is ours, floating in a portal so opening it never moves the panel.
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
    <Select
      className="rematch-deck"
      label={label}
      value={value}
      onChange={onChange}
      options={[
        { value: "", label: KEEP_DECK },
        ...groupByLeader(options, (o) => o.leaderId).flatMap((g) => [
          {
            value: `${LEADER_GROUP}${g.leaderId}`,
            label: <span className="deck-picker-group">{g.items[0]!.leaderName} · {g.leaderId}</span>,
            disabled: true,
          },
          ...g.items.map((o) => ({ value: o.id, label: o.name, sub: `${o.cards} cards` })),
        ]),
      ]}
    />
  );
}

export type RematchStage = "none" | "left" | "order" | "order-wait" | "waiting" | "accept" | "ask";

// The gold button of the match-over card is the rematch offer while this has one, and Return home when it does not ("none", "left").
export function rematchStage(state: RematchState | null, mySeat: Seat, autoAccept = false): RematchStage {
  if (!state) return "none";
  if (!state.available) return "left";
  if (state.chooser != null) return autoAccept || state.chooser === mySeat ? "order" : "order-wait";
  const oppSeat: Seat = mySeat === 0 ? 1 : 0;
  const mine = state.requested[mySeat];
  const theirs = state.requested[oppSeat];
  if (mine && !theirs) return "waiting";
  if (theirs && !mine) return "accept";
  return "ask";
}

type Props = {
  state: RematchState | null;
  mySeat: Seat;
  players: SeatPlayers | null;
  autoAccept?: boolean;
  deckOptions?: readonly RematchDeckOption[];
  onAction: (action: RematchAction, decks?: RematchDecks) => void;
};

export function RematchPanel({ state, mySeat, players, autoAccept = false, deckOptions, onAction }: Props) {
  const [picks, setPicks] = useState<[string, string]>(["", ""]);
  const [decksOpen, setDecksOpen] = useState(false);
  if (!state) return null;
  const oppSeat: Seat = mySeat === 0 ? 1 : 0;
  const oppName = seatName(players, oppSeat) ?? "Your opponent";

  if (!state.available) {
    return <p className="rematch-note">{oppName} left. A rematch isn&apos;t available.</p>;
  }

  if (state.chooser != null) {
    if (autoAccept || state.chooser === mySeat) {
      return (
        <div className="rematch-panel" role="group" aria-label="Choose turn order">
          <p className="rematch-note">
            <strong>
              {autoAccept ? `${seatLabel(players, state.chooser)} lost` : "You lost"}
            </strong>
            . Pick the turn order for the rematch.
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

  // One fixed-height slot, so revealing the select does not move the buttons above it.
  const pickers = deckOptions && deckOptions.length > 0 ? (
    <div className="rematch-deck-slot">
      {decksOpen ? (
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
      ) : (
        <button type="button" className="rematch-change-deck" onClick={() => setDecksOpen(true)}>
          {autoAccept ? "Change decks" : "Change deck"}
        </button>
      )}
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
        <div className="rematch-actions">
          <button type="button" className="btn btn-primary" onClick={request}>
            Accept rematch
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => onAction("decline")}>
            No thanks
          </button>
        </div>
        {pickers}
      </div>
    );
  }

  return (
    <div className="rematch-panel">
      {state.declinedBy === oppSeat && !autoAccept ? (
        <p className="rematch-note">{oppName} declined the rematch.</p>
      ) : null}
      <div className="rematch-actions">
        <button type="button" className="btn btn-primary" onClick={request}>
          {autoAccept ? "Rematch" : "Ask for a rematch"}
        </button>
      </div>
      {pickers}
    </div>
  );
}
