import { useMemo, type ReactNode } from "react";
import type { DeckSummary } from "../api";
import { groupDecksByLeader, groupState, toggleGroupDecks } from "./deckGroups";

export type DeckIncludeChip = {
  key: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
};

/**
 * "Include decks" filter shared by Master Shopping and group buys (#1203): decks grouped by leader
 * (ticking a leader ticks all its decks), plus an "Other" group for chips that aren't decks.
 * `onChange` gets the next full list of ticked deck ids; it may be empty (only the Other chips count),
 * and "Clear all" unticks every deck without touching the Other chips (#1208).
 */
export function DeckIncludeFilter({
  heading,
  decks,
  selectedIds,
  onChange,
  onSelectAll,
  selectAllLabel,
  selectAllDisabled,
  showSelectAll = true,
  disabled,
  otherChips,
  note,
}: {
  heading: string;
  decks: DeckSummary[];
  selectedIds: number[];
  onChange: (next: number[]) => void;
  onSelectAll: () => void;
  selectAllLabel: string;
  selectAllDisabled?: boolean;
  showSelectAll?: boolean;
  disabled?: boolean;
  otherChips: DeckIncludeChip[];
  note?: ReactNode;
}) {
  const groups = useMemo(() => groupDecksByLeader(decks), [decks]);

  function toggleDeck(id: number) {
    onChange(
      selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id],
    );
  }

  return (
    <div className="deck-filter">
      <div className="deck-filter-head">
        <span>{heading}</span>
        {showSelectAll ? (
          <span className="deck-filter-actions">
            <button
              type="button"
              className="ghost"
              disabled={disabled || selectAllDisabled}
              onClick={onSelectAll}
            >
              {selectAllLabel}
            </button>
            <button
              type="button"
              className="ghost"
              disabled={disabled || selectedIds.length === 0}
              onClick={() => onChange([])}
            >
              Clear all
            </button>
          </span>
        ) : null}
      </div>
      <div className="deck-filter-groups">
        {groups.map((g) => {
          const ids = g.decks.map((d) => d.id);
          const state = groupState(ids, selectedIds);
          return (
            <div key={g.key || "none"} className="deck-filter-group">
              <label className="deck-filter-group-head">
                <input
                  type="checkbox"
                  checked={state === "all"}
                  disabled={disabled}
                  ref={(el) => {
                    if (el) el.indeterminate = state === "some";
                  }}
                  onChange={() => onChange(toggleGroupDecks(selectedIds, ids))}
                />
                <span className="deck-filter-group-name">{g.label}</span>
              </label>
              <div className="deck-filter-list">
                {g.decks.map((d) => (
                  <label key={d.id} className="deck-chip">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(d.id)}
                      disabled={disabled}
                      onChange={() => toggleDeck(d.id)}
                    />
                    <span className="deck-chip-name">{d.name}</span>
                  </label>
                ))}
              </div>
            </div>
          );
        })}
        {otherChips.length > 0 ? (
          <div className="deck-filter-group">
            <span className="deck-filter-group-head deck-filter-group-name">Other</span>
            <div className="deck-filter-list">
              {otherChips.map((c) => (
                <label key={c.key} className="deck-chip">
                  <input
                    type="checkbox"
                    checked={c.checked}
                    disabled={disabled}
                    onChange={(e) => c.onChange(e.target.checked)}
                  />
                  {c.label}
                </label>
              ))}
            </div>
          </div>
        ) : null}
      </div>
      {note}
    </div>
  );
}
