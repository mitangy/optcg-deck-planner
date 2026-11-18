import { useEffect, useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { DeckConfigHeader } from "../layout/DeckConfigHeader";
import { DeckImportPanel } from "../board/DeckImportPanel";
import { createDeckFromInput, setSelectedDeckId } from "../decks/storage";
import { addMetaDeck } from "../decks/meta";
import { NEW_DECK_STARTS, createLeaderDeck, leaderDeckName, startButtonLabel, type NewDeckStart, type PickableLeader } from "../decks/newDeckStart";
import { readLogPoseDraft } from "../logPose";
import { LeaderPicker } from "./newDeck/LeaderPicker";
import { MetaPicker, type MetaChoice } from "./newDeck/MetaPicker";

export function NewDeckPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [start, setStart] = useState<NewDeckStart>("leader");
  const [name, setName] = useState("");
  const [initialList, setInitialList] = useState("");
  const [leader, setLeader] = useState<PickableLeader | null>(null);
  const [metaChoice, setMetaChoice] = useState<MetaChoice | null>(null);
  const [fromLogPose, setFromLogPose] = useState(false);
  const [createErr, setCreateErr] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const draft = readLogPoseDraft(location.state);
    if (!draft) return;
    setName(draft.name);
    setInitialList(draft.list);
    setFromLogPose(true);
    setStart("paste");
    navigate(location.pathname, { replace: true, state: null });
  }, [location.state, location.pathname, navigate]);

  function open(deckId: string, warnings: string[] = []) {
    setSelectedDeckId(deckId);
    navigate(`/decks/${deckId}/configure`, {
      replace: true,
      state: warnings.length ? { importNotice: warnings.join(" ") } : undefined,
    });
  }

  function onCreate(e: FormEvent) {
    e.preventDefault();
    setCreateErr(null);
    if (start === "leader") {
      if (!leader) return;
      open(createLeaderDeck(leader, name).id);
      return;
    }
    if (start === "meta") {
      if (!metaChoice) return;
      const result = addMetaDeck(metaChoice.leader, metaChoice.deck);
      if (!result.ok) {
        setCreateErr(result.errors.join(" · ") || "Could not copy this deck");
        return;
      }
      open(result.deck.id, result.warnings);
      return;
    }
    if (!name.trim()) {
      setCreateErr("Enter a deck name.");
      return;
    }
    setCreating(true);
    const result = createDeckFromInput(name, initialList);
    setCreating(false);
    if (!result.ok) {
      setCreateErr(result.errors.join(" · ") || "Could not create deck");
      return;
    }
    open(result.deck.id);
  }

  const ready = start === "leader" ? leader !== null : start === "meta" ? metaChoice !== null : true;

  return (
    <div className="app-shell">
      <div className="deck-config deck-config-page">
        <DeckConfigHeader
          back={{ to: "/decks", label: "Decks", ariaLabel: "Back to decks" }}
          heading={
            <>
              <h1 className="deck-config-title">New deck</h1>
              <p className="meta">Start from a Leader, copy a tournament deck or paste a list. You add cards on the next screen.</p>
            </>
          }
        />

        <form className="deck-new-form" onSubmit={onCreate}>
          {fromLogPose ? (
            <p className="deck-new-note" role="status">
              Filled in by Log Pose. Check it, then press Import deck.
            </p>
          ) : null}

          <fieldset className="nd-starts">
            <legend className="nd-legend">How do you want to start?</legend>
            {NEW_DECK_STARTS.map((s) => (
              <label key={s.id} className={`nd-start${start === s.id ? " is-selected" : ""}`}>
                <input
                  type="radio"
                  name="new-deck-start"
                  value={s.id}
                  checked={start === s.id}
                  onChange={() => {
                    setStart(s.id);
                    setCreateErr(null);
                  }}
                />
                <span>{s.label}</span>
              </label>
            ))}
          </fieldset>

          {start === "leader" ? (
            <>
              <LeaderPicker value={leader?.id ?? null} onChange={setLeader} />
            </>
          ) : null}

          {start === "meta" ? <MetaPicker value={metaChoice} onChange={setMetaChoice} /> : null}

          {start === "paste" ? (
            <div className="field">
              <label htmlFor="new-deck-name">Deck name</label>
              <input id="new-deck-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="My red ST01" required />
            </div>
          ) : null}

          {start === "paste" ? (
            <DeckImportPanel
              heading="Import deck list (optional)"
              hint="Same format as OPTCGSim. Leave empty to start blank and add cards manually."
              importText={initialList}
              onImportTextChange={setInitialList}
              onImport={() => undefined}
              showImportButton={false}
            />
          ) : null}

          {createErr ? (
            <p className="deck-edit-error" role="alert">
              {createErr}
            </p>
          ) : null}

          <div className="deck-new-actions">
            {start === "leader" ? (
              <p className="meta nd-picked" role="status">
                {leader ? `Selected: ${leader.name} (${leader.id})` : "Pick a Leader to continue."}
              </p>
            ) : null}
            {start === "leader" ? (
              <div className="field">
                <label htmlFor="new-deck-name">Deck name (optional)</label>
                <input
                  id="new-deck-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={leader ? leaderDeckName("", leader.name) : "Leader name deck"}
                />
              </div>
            ) : null}
            <button type="submit" className="btn btn-primary" disabled={creating || !ready}>
              {creating ? "Creating…" : startButtonLabel(start, initialList)}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
