import { useEffect, useMemo, useRef, useState } from "react";
import { clearSimGames, fetchSimGameCount, importSimGames, type SimImportResult } from "./historyApi";
import { addResults, batchGames, describeImport, logKey, logPlayers, logToGame, NO_RESULT, readSimUpload } from "./simImport";

/**
 * Settings, inside the Log Pose panel: import your OPTCGSim games (the optcgsim-matches export, or one pasted
 * combat log) so Claude can read them. They are private to you; player names are dropped on the server.
 */
export function SimImportPanel() {
  const [count, setCount] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [mine, setMine] = useState<0 | 1>(0);
  const [won, setWon] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const refreshCount = () =>
    fetchSimGameCount()
      .then(setCount)
      .catch(() => setCount(null));
  useEffect(() => void refreshCount(), []);

  // A pasted combat log names its two players; the importer says which one is them.
  const players = useMemo(() => logPlayers(text), [text]);
  const isLog = players.length === 2;

  async function sendGames(games: unknown[]) {
    let total: SimImportResult = NO_RESULT;
    for (const batch of batchGames(games)) total = addResults(total, await importSimGames(batch));
    setStatus(describeImport(total));
    await refreshCount();
  }

  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setStatus("");
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const importText = (source: string) =>
    run(async () => {
      const upload = readSimUpload(source);
      if (upload.kind === "error") throw new Error(upload.message);
      if (upload.kind === "games") return sendGames(upload.games);
      const game = logToGame(upload.log, mine, won, await logKey(upload.log));
      if (!game) throw new Error("Could not read both players and their cards from that log.");
      await sendGames([game]);
      setText("");
    });

  async function onFile(file: File | undefined) {
    if (!file) return;
    const source = await file.text();
    if (fileInput.current) fileInput.current.value = "";
    const upload = readSimUpload(source);
    // A single combat log in a file goes to the box, so you can say which player you were.
    if (upload.kind === "log") {
      setText(upload.log);
      setError(null);
      setStatus("Log loaded. Pick which player you were, then import.");
      return;
    }
    await importText(source);
  }

  function clear() {
    if (!window.confirm("Remove all your imported OPTCGSim games from Log Pose? This cannot be undone.")) return;
    void run(async () => {
      const deleted = await clearSimGames();
      setStatus(`Removed ${deleted} imported ${deleted === 1 ? "game" : "games"}.`);
      await refreshCount();
    });
  }

  return (
    <div className="sim-import" aria-labelledby="sim-import-title">
      <h3 className="analyst-subtitle" id="sim-import-title">Import OPTCGSim games</h3>
      <p className="panel-copy">
        Add games you played on OPTCGSim and Claude can review them turn by turn. Choose your exported games file (.json)
        or paste one combat log. Only you can see them; player names are dropped when they are saved.
      </p>
      <div className="btn-row">
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => fileInput.current?.click()}>
          Choose export file
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".json,.txt,application/json,text/plain"
          hidden
          aria-label="OPTCGSim export file"
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
      </div>
      <textarea
        className="sim-import-text"
        aria-label="Paste one OPTCGSim combat log"
        placeholder="Or paste one combat log here"
        value={text}
        spellCheck={false}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="sim-import-pick">
        <label>
          <span>I played as</span>
          <select value={mine} disabled={!isLog || busy} onChange={(e) => setMine(e.target.value === "1" ? 1 : 0)}>
            {isLog ? (
              players.map((p, i) => (
                <option key={i} value={i}>
                  {p.name} ({p.leaderId})
                </option>
              ))
            ) : (
              <option value={0}>Paste a log first</option>
            )}
          </select>
        </label>
        <label>
          <span>Result</span>
          <select value={won ? "won" : "lost"} disabled={!isLog || busy} onChange={(e) => setWon(e.target.value === "won")}>
            <option value="won">I won</option>
            <option value="lost">I lost</option>
          </select>
        </label>
      </div>
      <div className="btn-row">
        <button type="button" className="btn btn-primary" disabled={busy || !text.trim()} onClick={() => void importText(text)}>
          Import
        </button>
        <button type="button" className="btn btn-ghost" disabled={busy || !count} onClick={clear}>
          Clear imported games
        </button>
      </div>
      <p className="field-hint sim-import-count">
        {count === null ? " " : count === 0 ? "No OPTCGSim games imported yet." : `${count} OPTCGSim ${count === 1 ? "game" : "games"} imported.`}
      </p>
      <p className="field-hint sim-import-status" role="status">
        {status || " "}
      </p>
      {error ? (
        <p className="field-hint" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
