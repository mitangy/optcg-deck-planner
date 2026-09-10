import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { getApiBaseUrl, getGameServerUrl } from "../config";
import { mintDevGameToken } from "../net/api";
import { useDuelSession } from "../state/DuelSession";

export function LobbyPage() {
  const navigate = useNavigate();
  const { connect, queueRanked, cancelQueue, queueing, setRating } = useDuelSession();
  const [serverUrl, setServerUrl] = useState(getGameServerUrl());
  const [apiUrl] = useState(getApiBaseUrl());
  const [userKey, setUserKey] = useState("web-dev");
  const [secret, setSecret] = useState("");
  const [roomId, setRoomId] = useState("");
  const [useToken, setUseToken] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ratingLabel, setRatingLabel] = useState<string | null>(null);

  async function authOpts() {
    if (!useToken) {
      return {
        serverUrl: serverUrl.trim(),
        devUserId: userKey.trim(),
        secret: secret.trim() || undefined,
      };
    }
    const minted = await mintDevGameToken(userKey.trim());
    setRating(minted.rating);
    setRatingLabel(`${minted.rating} (${minted.games_played} games)`);
    return {
      serverUrl: serverUrl.trim(),
      gameToken: minted.token,
      secret: secret.trim() || undefined,
    };
  }

  async function go(mode: "create" | "join" | "queue" | "spectate") {
    if (!userKey.trim()) {
      setError("user key is required");
      return;
    }
    if ((mode === "join" || mode === "spectate") && !roomId.trim()) {
      setError("Room id required to join / spectate");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const opts = await authOpts();
      if (mode === "queue") {
        await queueRanked(opts);
      } else {
        await connect({
          ...opts,
          roomId: mode === "create" ? undefined : roomId.trim(),
          role: mode === "spectate" ? "spectator" : "player",
        });
      }
      navigate("/duel");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connect failed");
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
  }

  return (
    <div className="app-shell">
      <form className="lobby" onSubmit={onSubmit}>
        <h1 className="lobby-brand">OPTCG Duel</h1>
        <p className="lobby-sub">
          Browser lobby — ranked queue, bearer game tokens, reconnect. Private prototype only.
          Product web UI lives here in <code>duel-web/</code> (not Expo web).
        </p>

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

        <label htmlFor="user">User key (dev token / legacy id)</label>
        <input
          id="user"
          autoCapitalize="off"
          value={userKey}
          onChange={(e) => setUserKey(e.target.value)}
          placeholder="web-dev"
        />

        <button type="button" className="toggle" onClick={() => setUseToken((v) => !v)}>
          Auth: {useToken ? "POST /duel/dev-token (bearer)" : "legacy devUserId"}
        </button>
        {ratingLabel ? <p className="meta">Rating: {ratingLabel}</p> : null}

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

        {error ? <p className="error-text">{error}</p> : null}
        {queueing ? <p className="meta">In ranked queue…</p> : null}

        <div className="actions">
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || queueing}
            onClick={() => go("queue")}
          >
            {busy || queueing ? "Working…" : "Ranked queue"}
          </button>
          {queueing ? (
            <button type="button" className="btn btn-danger" onClick={() => cancelQueue()}>
              Cancel queue
            </button>
          ) : null}
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy || queueing}
            onClick={() => go("create")}
          >
            Create duel
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy || queueing}
            onClick={() => go("join")}
          >
            Join by room id
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy || queueing}
            onClick={() => go("spectate")}
          >
            Spectate room
          </button>
        </div>
      </form>
    </div>
  );
}
