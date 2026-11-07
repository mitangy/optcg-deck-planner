import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { DUEL_URL } from "../duelLink";
import { useLogPoseDraft } from "../logPose";
import { Tab, TabGroup, TabList, TabPanel, TabPanels } from "@optcg/ui/tabs";
import { qk } from "../queryKeys";

export function ImportPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [decklist, setDecklist] = useState("");
  const [mode, setMode] = useState<"paste" | "file">("paste");
  const [err, setErr] = useState<string | null>(null);
  // A deck Log Pose built arrives in the router state (#726): its name and list go straight into the form.
  const fromLogPose = useLogPoseDraft((d) => {
    setName(d.name);
    setDecklist(d.list);
    setMode("paste");
  });
  const create = useMutation({
    mutationFn: () => api.createDeck(name.trim(), decklist),
    onSuccess: async (deck) => {
      await qc.invalidateQueries({ queryKey: qk.decks() });
      await qc.invalidateQueries({ queryKey: qk.shopping.all() });
      // New imports are auto-added to open group-buy contributions.
      await qc.invalidateQueries({ queryKey: qk.groupBuys() });
      await qc.invalidateQueries({ queryKey: qk.groupBuy.all() });
      navigate(`/decks/${deck.id}`);
    },
    onError: (e: Error) => setErr(e.message),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!decklist.trim()) {
      setErr("Paste a deck code or upload a file first.");
      return;
    }
    create.mutate();
  }

  function onFile(file: File | null) {
    if (!file) return;
    if (!name) setName(file.name.replace(/\.(txt|deck)$/i, ""));
    file.text().then((text) => {
      setDecklist(text);
      setMode("paste");
    });
  }

  async function pasteFromClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        setErr("Clipboard is empty.");
        return;
      }
      setDecklist(text.trim());
      setErr(null);
      setMode("paste");
    } catch {
      setErr("Could not read clipboard — paste into the box with Ctrl+V.");
    }
  }

  return (
    <section>
      <h1>Import deck</h1>
      <p className="muted">
        Paste an OPTCGSim deck code from your clipboard, or upload a <code>.txt</code> /{" "}
        <code>.deck</code> file.
      </p>
      <p className="muted">
        Decks you make in the{" "}
        <a href={`${DUEL_URL}/decks`} target="_blank" rel="noopener">
          Duel app
        </a>{" "}
        show up here on their own. Decks you add here show up in the Duel app once they have 50 cards.
      </p>
      <form className="import-form" onSubmit={onSubmit}>
        {fromLogPose ? (
          <p className="import-note" role="status">
            Filled in by Log Pose. Check it, then press Create deck.
          </p>
        ) : null}
        <label>
          Deck name
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>

        <TabGroup selectedIndex={mode === "paste" ? 0 : 1} onChange={(i) => setMode(i === 0 ? "paste" : "file")}>
          <TabList className="import-modes" aria-label="Import method">
            <Tab className={({ selected }) => (selected ? "mode active" : "mode")}>Paste deck code</Tab>
            <Tab className={({ selected }) => (selected ? "mode active" : "mode")}>Upload file</Tab>
          </TabList>

          <TabPanels>
            <TabPanel className="paste-block">
              <div className="paste-actions">
                <button type="button" className="btn secondary" onClick={pasteFromClipboard}>
                  Paste from clipboard
                </button>
              </div>
              <label>
                Deck code
                <textarea
                  value={decklist}
                  onChange={(e) => setDecklist(e.target.value)}
                  rows={16}
                  placeholder={"1xOP15-002\n4xOP15-053\n4xOP15-052\n…"}
                  required
                />
              </label>
              <p className="hint">
                Same format as OPTCGSim “Copy Deck List to Clipboard” — one card per line like{" "}
                <code>4xOP15-053</code>.
              </p>
            </TabPanel>
            <TabPanel>
              <label>
                Decklist file (.txt / .deck)
                <input
                  type="file"
                  accept=".txt,.deck,text/plain"
                  onChange={(e) => onFile(e.target.files?.[0] ?? null)}
                />
                {decklist && (
                  <p className="hint">
                    Loaded {decklist.split("\n").filter((l) => l.trim()).length} lines — switch to
                    “Paste deck code” to review before creating.
                  </p>
                )}
              </label>
            </TabPanel>
          </TabPanels>
        </TabGroup>

        {err && <p className="error">{err}</p>}
        <button className="btn primary" type="submit" disabled={create.isPending}>
          {create.isPending ? "Saving…" : "Create deck"}
        </button>
      </form>
    </section>
  );
}
