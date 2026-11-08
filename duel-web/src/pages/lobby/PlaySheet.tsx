import { Tab, TabGroup, TabList } from "@optcg/ui/tabs";
import { Dialog, Select } from "@optcg/ui/popups";
import { BOT_DECK_RANDOM, BOT_LEVELS } from "../../home/botGame";
import { TIMER_PRESET_OPTIONS, type TimerPreset } from "../../home/timerPreset";
import { prefetchBoard } from "../../lazyRoutes";
import { DeckPicker } from "./DeckSwitcher";
import { confirmLabel, MODE_CARDS, modeTitle, type PlayMode } from "./modes";
import type { LobbyDecks } from "./useLobbyDecks";
import type { LobbySheet } from "./useLobbySheet";

/** The Play sheet: the mode chooser, then the form for the chosen mode with its confirm button. */
export function PlaySheet({
  sheet,
  deckState,
  chooseDeck,
  busy,
  busyStatus,
  queueing,
  onConfirm,
}: {
  sheet: LobbySheet;
  deckState: LobbyDecks;
  chooseDeck: (id: string) => void;
  busy: boolean;
  busyStatus: string | null;
  queueing: boolean;
  onConfirm: (mode: PlayMode) => void;
}) {
  const { sheetOpen, mode, error, roomId, setRoomId, botLevel, setBotLevel, yourRandom, setYourRandom, timerPreset, setTimerPreset, pickMode, closeSheet, backToModes } = sheet;
  const { decks, selectedId, selectedDeck, opponentDeckId, setOpponentDeckId, botDeckId, setBotDeckId } = deckState;
  if (!sheetOpen) return null;
  return (
    <Dialog
      open
      onClose={() => {
        if (!busy) closeSheet();
      }}
      className="sheet-backdrop"
      panelClassName="sheet"
      label={modeTitle(mode)}
    >
      <div className="sheet-head">
        {mode ? (
          <button
            type="button"
            className="icon-btn"
            aria-label="Back to modes"
            disabled={busy}
            onClick={backToModes}
          >
            ←
          </button>
        ) : (
          <span className="icon-btn-spacer" aria-hidden />
        )}
        <h2 className="sheet-title">{modeTitle(mode)}</h2>
        <button
          type="button"
          className="icon-btn"
          aria-label="Close"
          disabled={busy}
          onClick={closeSheet}
        >
          ✕
        </button>
      </div>

      {!mode ? (
        <div className="mode-grid">
          {MODE_CARDS.map((m) => (
            <button
              key={m.mode}
              type="button"
              className="mode-card"
              onClick={() => pickMode(m.mode)}
            >
              <span className="mode-glyph" aria-hidden>
                {m.glyph}
              </span>
              <span className="mode-title">{m.title}</span>
              <span className="mode-blurb">{m.blurb}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="sheet-body">
          {mode === "create" || mode === "join" ? (
            <TabGroup selectedIndex={mode === "join" ? 1 : 0} onChange={(i) => pickMode(i === 1 ? "join" : "create")}>
              <TabList className="segmented" aria-label="Private room">
                <Tab className={({ selected }) => (selected ? "active" : "")}>Create</Tab>
                <Tab className={({ selected }) => (selected ? "active" : "")}>Join</Tab>
              </TabList>
            </TabGroup>
          ) : null}

          {mode !== "spectate" ? (
            <DeckPicker
              id="setup-deck"
              label="Your deck"
              decks={decks}
              value={mode === "bot" && yourRandom ? BOT_DECK_RANDOM : selectedId}
              onChange={(id) => {
                if (id === BOT_DECK_RANDOM) {
                  setYourRandom(true);
                  return;
                }
                setYourRandom(false);
                chooseDeck(id);
              }}
              random={
                mode === "bot"
                  ? { label: "Random deck", hint: "Picked from your complete decks when the game starts." }
                  : undefined
              }
            />
          ) : null}

          {mode === "hotseat" ? (
            <DeckPicker
              id="enemy-deck"
              label="Opponent deck"
              decks={decks}
              value={opponentDeckId}
              onChange={setOpponentDeckId}
            />
          ) : null}

          {mode === "bot" ? (
            <>
              <div className="field">
                <span className="field-label" id="bot-level-label">
                  Bot level
                </span>
                <div className="segmented segmented-3" role="radiogroup" aria-labelledby="bot-level-label">
                  {BOT_LEVELS.map((l) => (
                    <button
                      key={l.level}
                      type="button"
                      role="radio"
                      aria-checked={botLevel === l.level}
                      className={botLevel === l.level ? "active" : ""}
                      onClick={() => setBotLevel(l.level)}
                    >
                      {l.label}
                    </button>
                  ))}
                </div>
                <p className="field-hint">{BOT_LEVELS.find((l) => l.level === botLevel)?.hint}</p>
              </div>
              <DeckPicker
                id="bot-deck"
                label="Bot's deck"
                decks={decks}
                value={botDeckId}
                onChange={setBotDeckId}
                botMeta
              />
              <p className="field-hint">
                A casual game against the computer: not ranked, no timer, and not saved to your match history.
              </p>
            </>
          ) : null}

          {mode === "create" ? (
            <div className="field">
              <label htmlFor="timer-preset">Timer</label>
              <Select<TimerPreset>
                id="timer-preset"
                value={timerPreset}
                onChange={setTimerPreset}
                options={TIMER_PRESET_OPTIONS}
              />
              <p className="field-hint">
                {timerPreset === "seat_15m" || timerPreset === "turn_30_seat_15m"
                  ? "Each player's clock only runs while it's their move; whoever runs out loses. "
                  : ""}
                Private rooms are unranked.
              </p>
            </div>
          ) : null}

          {mode === "join" || mode === "spectate" ? (
            <div className="field">
              <label htmlFor="room">Room id</label>
              <input
                id="room"
                autoCapitalize="off"
                autoCorrect="off"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                placeholder="Paste the room id"
              />
            </div>
          ) : null}

          {mode === "queue" ? (
            <p className="field-hint">
              Ranked games give each player 15 minutes on a chess clock. Your Bounty updates after the match.
            </p>
          ) : null}

          {error ? <p className="error-text">{error}</p> : null}

          <button
            type="button"
            className="btn btn-primary btn-lg sheet-confirm"
            disabled={busy || queueing}
            onPointerEnter={prefetchBoard}
            onFocus={prefetchBoard}
            onClick={() => onConfirm(mode)}
          >
            {busy && busyStatus ? busyStatus : confirmLabel(mode)}
          </button>
        </div>
      )}
    </Dialog>
  );
}
