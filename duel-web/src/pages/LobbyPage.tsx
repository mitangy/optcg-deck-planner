import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { getOrCreateGuestId } from "../auth/guestId";
import { BuildTag } from "../BuildTag";
import { getApiBaseUrl, getGameServerUrl } from "../config";
import {
  deckToWire,
  ensureDefaultDeck,
  ensureTestDecks,
  getSelectedDeckId,
  listSavedDecks,
  setSelectedDeckId,
  type SavedDeck,
} from "../decks/storage";
import {
  fetchAuthMe,
  googleLoginUrl,
  logoutSession,
  mintDevGameToken,
  mintGuestGameToken,
  mintSessionGameToken,
  warmDuelServices,
  type AuthUser,
} from "../net/api";
import { clearMatchResume, loadMatchResume } from "../net/matchResume";
import { useDuelSession } from "../state/DuelSession";

type AuthMode = "guest" | "google" | "dev";

/** Which play mode the user is configuring after clicking an action. */
type SetupMode = "hotseat" | "create" | "join" | "queue" | "spectate" | null;

/** Private-room timer presets (ranked always forces 30s turns). */
type TimerPreset = "off" | "turn_30" | "match_30m" | "turn_30_match_30m";

function timerFromPreset(preset: TimerPreset): {
  turnSeconds?: number;
  matchSeconds?: number;
} {
  switch (preset) {
    case "turn_30":
      return { turnSeconds: 30 };
    case "match_30m":
      return { matchSeconds: 30 * 60 };
    case "turn_30_match_30m":
      return { turnSeconds: 30, matchSeconds: 30 * 60 };
    default:
      return {};
  }
}

export function LobbyPage() {
  const showDevKey =
    import.meta.env.DEV || import.meta.env.VITE_SHOW_DEV_KEY === "true";
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
  /** Short status while buttons are disabled (vs-self warm/mint). */
  const [busyStatus, setBusyStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ratingLabel, setRatingLabel] = useState<string | null>(null);

  const [decks, setDecks] = useState<SavedDeck[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [opponentDeckId, setOpponentDeckId] = useState("");
  const [pendingResume, setPendingResume] = useState<ReturnType<typeof loadMatchResume>>(null);

  const [setupMode, setSetupMode] = useState<SetupMode>(null);
  const [timerPreset, setTimerPreset] = useState<TimerPreset>("off");

  function refreshDecks(preferId?: string) {
    const seeded = ensureDefaultDeck();
    ensureTestDecks();
    const all = listSavedDecks();
    setDecks(all);
    // Prefer an explicit id (post-import), then in-memory selection, then the
    // persisted lobby choice — otherwise mount always falls back to ST01 Luffy.
    const prefer =
      preferId || selectedId || getSelectedDeckId() || undefined;
    const sel = (prefer && all.find((d) => d.id === prefer)) || seeded;
    setSelectedId(sel.id);
    setSelectedDeckId(sel.id);
    setOpponentDeckId((prev) => {
      if (prev && all.some((d) => d.id === prev)) return prev;
      // Prefer a different constructed deck for the enemy when available.
      const other = all.find((d) => d.id !== sel.id) ?? sel;
      return other.id;
    });
  }

  useEffect(() => {
    refreshDecks();
    // Offer resume instead of forcing it — browser Back from hotseat used to
    // bounce straight back into the match and made Leave feel broken.
    setPendingResume(loadMatchResume());
    // Wake free-tier Render API + game-server so hotseat mint/create is warm.
    warmDuelServices(apiUrl, serverUrl);
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

  function openSetup(mode: Exclude<SetupMode, null>) {
    setError(null);
    setSetupMode(mode);
    if (mode === "create") setTimerPreset("off");
  }

  async function confirmSetup() {
    if (!setupMode) return;
    if (authMode === "dev" && !userKey.trim()) {
      setError("user key is required for dev auth");
      return;
    }
    if ((setupMode === "join" || setupMode === "spectate") && !roomId.trim()) {
      setError("Room id required to join / spectate");
      return;
    }
    if (setupMode !== "spectate" && !selectedDeck) {
      setError("Select a deck first");
      return;
    }
    setBusy(true);
    setBusyStatus(setupMode === "hotseat" ? "Starting vs-self…" : "Working…");
    setError(null);
    try {
      // Starting a new match must not auto-resume a prior room on the next
      // /hotseat or /duel mount (refresh keeps history.state).
      clearMatchResume();
      if (setupMode === "hotseat") {
        const wire = deckToWire(selectedDeck!);
        setSelectedDeckId(selectedDeck!.id);
        const key = hotseatUserKey();
        const enemy =
          decks.find((d) => d.id === opponentDeckId) ?? selectedDeck!;
        // Fire-and-forget wake only — do not block the lobby on free-tier API
        // cold starts (that grayed every button for up to ~20s). HotseatPage
        // awaits readiness + mints with a visible Starting screen.
        warmDuelServices(apiUrl, serverUrl.trim());
        navigate("/hotseat", {
          state: {
            serverUrl: serverUrl.trim(),
            secret: secret.trim() || undefined,
            userKey: key,
            useToken: true,
            deckWire: wire,
            enemyDeckWire: deckToWire(enemy),
            deckName: selectedDeck!.name,
            enemyDeckName: enemy.name,
          },
        });
        return;
      }
      const opts = await authOpts();
      if (setupMode === "queue") {
        const wire = deckToWire(selectedDeck!);
        setSelectedDeckId(selectedDeck!.id);
        await queueRanked({ ...opts, deck: wire });
        navigate("/duel");
        return;
      }
      if (setupMode === "spectate") {
        await connect({
          ...opts,
          roomId: roomId.trim(),
          role: "spectator",
        });
        navigate("/duel");
        return;
      }
      const wire = deckToWire(selectedDeck!);
      setSelectedDeckId(selectedDeck!.id);
      const timer = timerFromPreset(timerPreset);
      await connect({
        ...opts,
        roomId: setupMode === "join" ? roomId.trim() : undefined,
        preferredSeat: setupMode === "create" ? 0 : undefined,
        deck: wire,
        createOptions:
          setupMode === "create"
            ? {
                ranked: false,
                players: [wire, wire],
                timer,
              }
            : undefined,
      });
      navigate("/duel");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connect failed");
    } finally {
      setBusy(false);
      setBusyStatus(null);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
  }

  const setupTitle =
    setupMode === "hotseat"
      ? "Play vs yourself"
      : setupMode === "create"
        ? "Create duel"
        : setupMode === "join"
          ? "Join by room id"
          : setupMode === "queue"
            ? "Ranked queue"
            : setupMode === "spectate"
              ? "Spectate room"
              : null;

  return (
    <div className="app-shell">
      <form className="lobby lobby-wide" onSubmit={onSubmit}>
        <h1 className="lobby-brand">OPTCG Duel</h1>
        <p className="lobby-sub">
          Configure decks, choose your list for matches, inspect alt arts in-match, or hotseat vs
          yourself. Private prototype only.
        </p>
        <BuildTag className="build-tag-lobby" />

        {pendingResume ? (
          <section className="lobby-section resume-banner">
            <h2 className="lobby-section-title">Resume match?</h2>
            <p className="meta">
              A {pendingResume.mode === "hotseat" ? "vs-self (hotseat)" : "online"} match is still
              saved in this tab.
            </p>
            <div className="actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() =>
                  navigate(pendingResume.mode === "hotseat" ? "/hotseat" : "/duel", {
                    replace: true,
                  })
                }
              >
                Resume
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  clearMatchResume();
                  setPendingResume(null);
                }}
              >
                Discard &amp; stay in lobby
              </button>
            </div>
          </section>
        ) : null}

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
            {showDevKey ? (
              <button
                type="button"
                className={`btn ${authMode === "dev" ? "btn-primary" : "btn-secondary"}`}
                disabled={busy}
                onClick={() => setAuthMode("dev")}
              >
                Dev key
              </button>
            ) : null}
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
          <h2 className="lobby-section-title">Decks</h2>
          <p className="meta">
            Manage saved decks on the decks page. Match modes below ask which deck to use.
          </p>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy}
            onClick={() => navigate("/decks")}
          >
            Manage decks
          </button>
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
        </section>

        {error ? <p className="error-text">{error}</p> : null}
        {busyStatus ? <p className="meta">{busyStatus}</p> : null}
        {queueing ? <p className="meta">In ranked queue…</p> : null}

        <div className="actions">
          <button
            type="button"
            className={`btn ${setupMode === "hotseat" ? "btn-primary" : "btn-secondary"}`}
            disabled={busy || queueing}
            onClick={() => openSetup("hotseat")}
          >
            Play locally vs yourself
          </button>
          <button
            type="button"
            className={`btn ${setupMode === "create" ? "btn-primary" : "btn-secondary"}`}
            disabled={busy || queueing}
            onClick={() => openSetup("create")}
          >
            Create duel
          </button>
          <button
            type="button"
            className={`btn ${setupMode === "join" ? "btn-primary" : "btn-secondary"}`}
            disabled={busy || queueing}
            onClick={() => openSetup("join")}
          >
            Join by room id
          </button>
          <button
            type="button"
            className={`btn ${setupMode === "queue" ? "btn-primary" : "btn-secondary"}`}
            disabled={busy || queueing}
            onClick={() => openSetup("queue")}
          >
            {queueing ? "In queue…" : "Ranked queue"}
          </button>
          {queueing ? (
            <button type="button" className="btn btn-danger" onClick={() => void cancelQueue()}>
              Cancel queue
            </button>
          ) : null}
          <button
            type="button"
            className={`btn ${setupMode === "spectate" ? "btn-primary" : "btn-secondary"}`}
            disabled={busy || queueing}
            onClick={() => openSetup("spectate")}
          >
            Spectate room
          </button>
        </div>

        {setupMode && setupTitle ? (
          <section className="lobby-section lobby-setup-panel" aria-label={setupTitle}>
            <h2 className="lobby-section-title">{setupTitle}</h2>

            {setupMode === "hotseat" ? (
              <>
                <p className="meta">Choose your deck and the enemy deck for this device.</p>
                <label htmlFor="setup-deck">Your deck</label>
                <select
                  id="setup-deck"
                  value={selectedId}
                  onChange={(e) => {
                    setSelectedId(e.target.value);
                    setSelectedDeckId(e.target.value);
                  }}
                >
                  {decks.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} — {d.leaderId}
                      {d.leaderId === "OP16-080" ? " Teach" : ""}
                      {d.leaderId === "OP17-039" ? " Rocks" : ""} ({d.cards.length} cards)
                    </option>
                  ))}
                </select>
                <label htmlFor="enemy-deck">Enemy deck</label>
                <select
                  id="enemy-deck"
                  value={opponentDeckId}
                  onChange={(e) => setOpponentDeckId(e.target.value)}
                >
                  {decks.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} — {d.leaderId} ({d.cards.length} cards)
                    </option>
                  ))}
                </select>
              </>
            ) : null}

            {setupMode === "create" || setupMode === "join" || setupMode === "queue" ? (
              <>
                <label htmlFor="setup-deck-online">Your deck</label>
                <select
                  id="setup-deck-online"
                  value={selectedId}
                  onChange={(e) => {
                    setSelectedId(e.target.value);
                    setSelectedDeckId(e.target.value);
                  }}
                >
                  {decks.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} — {d.leaderId}
                      {d.leaderId === "OP16-080" ? " Teach" : ""}
                      {d.leaderId === "OP17-039" ? " Rocks" : ""} ({d.cards.length} cards)
                    </option>
                  ))}
                </select>
                {selectedDeck ? (
                  <p className="meta">
                    Leader {selectedDeck.leaderId} · {selectedDeck.cards.length} main-deck cards
                  </p>
                ) : null}
              </>
            ) : null}

            {setupMode === "create" ? (
              <>
                <label htmlFor="timer-preset">Timer</label>
                <select
                  id="timer-preset"
                  value={timerPreset}
                  onChange={(e) => setTimerPreset(e.target.value as TimerPreset)}
                >
                  <option value="off">No timer</option>
                  <option value="turn_30">30 second turns</option>
                  <option value="match_30m">30 minute match</option>
                  <option value="turn_30_match_30m">30s turns + 30 min match</option>
                </select>
                <p className="meta">Private rooms are unranked. Ranked queue always uses 30s turns.</p>
              </>
            ) : null}

            {setupMode === "queue" ? (
              <p className="meta">Ranked always enforces 30 second player turns.</p>
            ) : null}

            {setupMode === "join" || setupMode === "spectate" ? (
              <>
                <label htmlFor="room">Room id</label>
                <input
                  id="room"
                  autoCapitalize="off"
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value)}
                  placeholder="paste from other browser"
                />
              </>
            ) : null}

            <div className="actions" style={{ marginTop: 12 }}>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy || queueing}
                onClick={() => void confirmSetup()}
              >
                {busy && busyStatus
                  ? busyStatus
                  : setupMode === "hotseat"
                    ? "Start vs yourself"
                    : setupMode === "create"
                      ? "Create room"
                      : setupMode === "join"
                        ? "Join room"
                        : setupMode === "queue"
                          ? "Enter ranked queue"
                          : "Spectate"}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={busy}
                onClick={() => setSetupMode(null)}
              >
                Cancel
              </button>
            </div>
          </section>
        ) : null}
      </form>
    </div>
  );
}
