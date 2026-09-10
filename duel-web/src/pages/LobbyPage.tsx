import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { getOrCreateGuestId } from "../auth/guestId";
import { getApiBaseUrl, getGameServerUrl } from "../config";
import {
  deckToWire,
  deleteDeck,
  ensureDefaultDeck,
  ensureTestDecks,
  listSavedDecks,
  saveDeck,
  setSelectedDeckId,
  validateImportedList,
  type SavedDeck,
} from "../decks/storage";
import {
  fetchAuthMe,
  googleLoginUrl,
  logoutSession,
  mintDevGameToken,
  mintGuestGameToken,
  mintSessionGameToken,
  type AuthUser,
} from "../net/api";
import { loadMatchResume } from "../net/matchResume";
import { useDuelSession } from "../state/DuelSession";

type AuthMode = "guest" | "google" | "dev";

export function LobbyPage() {
  const navigate = useNavigate();
  const { connect, queueRanked, cancelQueue, queueing, setRating } = useDuelSession();
  const [serverUrl, setServerUrl] = useState(getGameServerUrl());
  const [apiUrl] = useState(getApiBaseUrl());
  const [userKey, setUserKey] = useState("web-dev");
  const [secret, setSecret] = useState("");
  const [roomId, setRoomId] = useState("");
  const [authMode, setAuthMode] = useState<AuthMode>("guest");
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ratingLabel, setRatingLabel] = useState<string | null>(null);

  const [decks, setDecks] = useState<SavedDeck[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [importName, setImportName] = useState("");
  const [importText, setImportText] = useState("");
  const [importMsg, setImportMsg] = useState<string | null>(null);

  function refreshDecks(preferId?: string) {
    const seeded = ensureDefaultDeck();
    ensureTestDecks();
    const all = listSavedDecks();
    setDecks(all);
    const prefer = preferId ?? selectedId;
    const sel = all.find((d) => d.id === prefer) ?? seeded;
    setSelectedId(sel.id);
    setSelectedDeckId(sel.id);
  }

  useEffect(() => {
    refreshDecks();
    const resume = loadMatchResume();
    if (resume?.mode === "duel") navigate("/duel", { replace: true });
    else if (resume?.mode === "hotseat") navigate("/hotseat", { replace: true });
    void fetchAuthMe()
      .then((u) => {
        if (u) {
          setAuthUser(u);
          setAuthMode("google");
        }
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedDeck = useMemo(
    () => decks.find((d) => d.id === selectedId) ?? null,
    [decks, selectedId],
  );

  async function authOpts() {
    if (authMode === "guest") {
      const minted = await mintGuestGameToken(getOrCreateGuestId());
      setRating(minted.rating);
      setRatingLabel(`${minted.rating} (${minted.games_played} games · guest)`);
      return {
        serverUrl: serverUrl.trim(),
        gameToken: minted.token,
        secret: secret.trim() || undefined,
      };
    }
    if (authMode === "google") {
      const minted = await mintSessionGameToken();
      setRating(minted.rating);
      setRatingLabel(`${minted.rating} (${minted.games_played} games)`);
      return {
        serverUrl: serverUrl.trim(),
        gameToken: minted.token,
        secret: secret.trim() || undefined,
      };
    }
    const minted = await mintDevGameToken(userKey.trim());
    setRating(minted.rating);
    setRatingLabel(`${minted.rating} (${minted.games_played} games · dev)`);
    return {
      serverUrl: serverUrl.trim(),
      gameToken: minted.token,
      secret: secret.trim() || undefined,
    };
  }

  function hotseatUserKey(): string {
    if (authMode === "guest") return getOrCreateGuestId();
    if (authMode === "google" && authUser) return `user-${authUser.id}`;
    return userKey.trim() || "web-dev";
  }

  async function go(mode: "create" | "join" | "queue" | "hotseat") {
    if (authMode === "dev" && !userKey.trim()) {
      setError("user key is required for dev auth");
      return;
    }
    if (mode === "join" && !roomId.trim()) {
      setError("Room id required to join");
      return;
    }
    if (!selectedDeck) {
      setError("Select a deck first");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const wire = deckToWire(selectedDeck);
      setSelectedDeckId(selectedDeck.id);
      if (mode === "hotseat") {
        navigate("/hotseat", {
          state: {
            serverUrl: serverUrl.trim(),
            secret: secret.trim() || undefined,
            userKey: hotseatUserKey(),
            useToken: true,
            deckWire: wire,
            deckName: selectedDeck.name,
          },
        });
        return;
      }
      const opts = await authOpts();
      if (mode === "queue") {
        await queueRanked({ ...opts, deck: wire });
        navigate("/duel");
        return;
      }
      await connect({
        ...opts,
        roomId: mode === "join" ? roomId.trim() : undefined,
        preferredSeat: mode === "create" ? 0 : undefined,
        deck: wire,
        createOptions:
          mode === "create"
            ? {
                players: [wire, wire],
              }
            : undefined,
      });
      navigate("/duel");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connect failed");
    } finally {
      setBusy(false);
    }
  }

  function onImport() {
    setImportMsg(null);
    const v = validateImportedList(importText);
    if (!v.ok || !v.leaderId) {
      setImportMsg(v.errors.join(" · ") || "Import failed");
      return;
    }
    const saved = saveDeck({
      name: importName.trim() || `Imported ${v.leaderId}`,
      leaderId: v.leaderId,
      cards: v.cards,
    });
    setImportText("");
    setImportName("");
    setImportMsg(
      `Saved “${saved.name}” (${saved.cards.length} cards)${
        v.warnings.length ? ` — ${v.warnings.join(" ")}` : ""
      }`,
    );
    refreshDecks(saved.id);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
  }

  return (
    <div className="app-shell">
      <form className="lobby lobby-wide" onSubmit={onSubmit}>
        <h1 className="lobby-brand">OPTCG Duel</h1>
        <p className="lobby-sub">
          Import planner-style decklists, choose your deck, inspect alt arts in-match, or hotseat
          vs yourself. Private prototype only.
        </p>

        <section className="lobby-section">
          <h2 className="lobby-section-title">Identity</h2>
          <p className="meta">
            Duel-web auth only for now — sharing the planner session cookie across origins is
            deferred (see ADR-016).
          </p>
          <div className="actions" style={{ marginBottom: 8 }}>
            <button
              type="button"
              className={`btn ${authMode === "guest" ? "btn-primary" : "btn-secondary"}`}
              disabled={busy}
              onClick={() => setAuthMode("guest")}
            >
              Continue as guest
            </button>
            <a className="btn btn-secondary" href={googleLoginUrl()}>
              Sign in with Google
            </a>
            <button
              type="button"
              className={`btn ${authMode === "dev" ? "btn-primary" : "btn-secondary"}`}
              disabled={busy}
              onClick={() => setAuthMode("dev")}
            >
              Dev key
            </button>
            {authUser ? (
              <button
                type="button"
                className="btn btn-danger"
                disabled={busy}
                onClick={() => {
                  void logoutSession().then(() => {
                    setAuthUser(null);
                    setAuthMode("guest");
                    setRating(null);
                    setRatingLabel(null);
                  });
                }}
              >
                Sign out
              </button>
            ) : null}
          </div>
          <p className="meta">
            {authMode === "guest"
              ? `Guest id ${getOrCreateGuestId().slice(0, 10)}… (stable in this browser)`
              : authMode === "google"
                ? authUser
                  ? `Signed in as ${authUser.email}`
                  : "Complete Google sign-in, then return here"
                : "Dev key mint via POST /duel/dev-token"}
          </p>
          {ratingLabel ? <p className="meta">Rating: {ratingLabel}</p> : null}
        </section>

        <section className="lobby-section">
          <h2 className="lobby-section-title">Your decks</h2>
          <label htmlFor="deck">Active deck</label>
          <select
            id="deck"
            value={selectedId}
            onChange={(e) => {
              setSelectedId(e.target.value);
              setSelectedDeckId(e.target.value);
            }}
          >
            {decks.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} ({d.leaderId}, {d.cards.length} cards)
              </option>
            ))}
          </select>
          {selectedDeck ? (
            <p className="meta">
              Leader {selectedDeck.leaderId} · {selectedDeck.cards.length} main-deck cards
            </p>
          ) : null}
          {selectedDeck &&
          selectedDeck.id !== "default-st01" &&
          !selectedDeck.id.startsWith("test-") ? (
            <button
              type="button"
              className="btn btn-danger"
              disabled={busy}
              onClick={() => {
                deleteDeck(selectedDeck.id);
                refreshDecks();
              }}
            >
              Delete selected deck
            </button>
          ) : null}

          <label htmlFor="import-name">Import name</label>
          <input
            id="import-name"
            value={importName}
            onChange={(e) => setImportName(e.target.value)}
            placeholder="My red ST01"
          />
          <label htmlFor="import-text">Decklist (OPTCGSim / planner paste)</label>
          <textarea
            id="import-text"
            className="lobby-textarea"
            rows={6}
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder={"1xST01-001\n4xST01-003\n4xST01-006\n4xST01-008\n4xST01-009\n4xST01-014"}
          />
          <button type="button" className="btn btn-secondary" onClick={onImport}>
            Import &amp; save deck
          </button>
          {importMsg ? <p className="meta">{importMsg}</p> : null}
        </section>

        <section className="lobby-section">
          <h2 className="lobby-section-title">Connection</h2>
          <label htmlFor="gs">Game server URL</label>
          <input
            id="gs"
            autoCapitalize="off"
            autoCorrect="off"
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
            placeholder="http://localhost:2567"
          />

          <p className="meta">API: {apiUrl}</p>

          {authMode === "dev" ? (
            <>
              <label htmlFor="user">User key (dev token)</label>
              <input
                id="user"
                autoCapitalize="off"
                value={userKey}
                onChange={(e) => setUserKey(e.target.value)}
                placeholder="web-dev"
              />
            </>
          ) : null}

          <label htmlFor="secret">Join secret (optional)</label>
          <input
            id="secret"
            autoCapitalize="off"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="matches DEV_JOIN_SECRET"
          />

          <label htmlFor="room">Room id (manual join)</label>
          <input
            id="room"
            autoCapitalize="off"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            placeholder="paste from other browser"
          />
        </section>

        {error ? <p className="error-text">{error}</p> : null}
        {queueing ? <p className="meta">In ranked queue…</p> : null}

        <div className="actions">
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || queueing}
            onClick={() => void go("hotseat")}
          >
            Play locally vs yourself
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy || queueing}
            onClick={() => void go("create")}
          >
            Create duel
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy || queueing}
            onClick={() => void go("join")}
          >
            Join by room id
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy || queueing}
            onClick={() => void go("queue")}
          >
            {busy || queueing ? "Working…" : "Ranked queue"}
          </button>
          {queueing ? (
            <button type="button" className="btn btn-danger" onClick={() => void cancelQueue()}>
              Cancel queue
            </button>
          ) : null}
        </div>
      </form>
    </div>
  );
}
