import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getOrCreateGuestId } from "../auth/guestId";
import { UsernameSettings } from "../auth/UsernameSettings";
import { BuildTag } from "../BuildTag";
import {
  CARD_BACK_ASPECT,
  cardBackCssValue,
  clearCardBack,
  saveCardBack,
  useCardBackUrl,
} from "../cardBack";
import { ImageEditor } from "../cosmetics/ImageEditor";
import { getApiBaseUrl, getGameServerUrl } from "../config";
import {
  fetchAuthMe,
  googleLoginUrl,
  logoutSession,
  type AuthUser,
} from "../net/api";
import {
  PLAYMAT_ASPECT,
  clearPlaymat,
  savePlaymat,
  usePlaymatUrl,
} from "../playmat";
import { GameplaySettingsFields } from "../board/GameplaySettings";
import {
  devKeyAllowed,
  updateSettings,
  useDuelSettings,
  type DuelSettings,
} from "../settings";
import { useDuelSession } from "../state/DuelSession";

export function SettingsPage() {
  const { setRating } = useDuelSession();
  const settings = useDuelSettings();
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const showDevKey = devKeyAllowed();
  const defaultServer = getGameServerUrl();
  const playmatUrl = usePlaymatUrl();
  const [matBusy, setMatBusy] = useState(false);
  const [matError, setMatError] = useState<string | null>(null);
  const cardBackUrl = useCardBackUrl();
  const [backBusy, setBackBusy] = useState(false);
  const [backError, setBackError] = useState<string | null>(null);

  const [editing, setEditing] = useState<{
    kind: "playmat" | "cardBack";
    file: File;
  } | null>(null);

  async function onPlaymatFile(file: File | undefined) {
    if (!file) return;
    setMatBusy(true);
    setMatError(null);
    try {
      await savePlaymat(file);
    } catch (e) {
      setMatError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setMatBusy(false);
    }
  }

  async function onCardBackFile(file: File | undefined) {
    if (!file) return;
    setBackBusy(true);
    setBackError(null);
    try {
      await saveCardBack(file);
    } catch (e) {
      setBackError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBackBusy(false);
    }
  }

  useEffect(() => {
    void fetchAuthMe()
      .then((u) => setAuthUser(u))
      .catch(() => undefined);
  }, []);

  function update(patch: Partial<DuelSettings>) {
    updateSettings(patch);
  }

  return (
    <div className="app-shell">
      <div className="page page-narrow">
        <header className="page-header">
          <Link
            to="/"
            className="btn btn-ghost btn-sm page-back"
            aria-label="Back to home"
          >
            ← Home
          </Link>
          <h1 className="page-title">Settings</h1>
        </header>

        <section className="panel">
          <h2 className="panel-title">Account</h2>
          {authUser ? (
            <>
              <p className="panel-copy">
                Signed in as <strong>{authUser.email}</strong>. Your ranked Bounty
                follows this account.
              </p>
              <UsernameSettings user={authUser} onChange={setAuthUser} />
              <div className="btn-row">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    void logoutSession().then(() => {
                      setAuthUser(null);
                      setRating(null);
                    });
                  }}
                >
                  Sign out
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="panel-copy">
                Playing as a guest (
                <code>{getOrCreateGuestId().slice(0, 10)}…</code>, stable in
                this browser). Sign in to keep your Bounty across devices.
              </p>
              <div className="btn-row">
                <a className="btn btn-primary" href={googleLoginUrl()}>
                  Sign in with Google
                </a>
              </div>
            </>
          )}

          {showDevKey && !authUser ? (
            <div className="field-group">
              <label className="switch">
                <input
                  type="checkbox"
                  checked={settings.useDevKey}
                  onChange={(e) => update({ useDevKey: e.target.checked })}
                />
                <span>Use a dev user key instead of the guest id</span>
              </label>
              {settings.useDevKey ? (
                <div className="field">
                  <label htmlFor="dev-user">Dev user key</label>
                  <input
                    id="dev-user"
                    autoCapitalize="off"
                    autoCorrect="off"
                    value={settings.devUserKey}
                    onChange={(e) => update({ devUserKey: e.target.value })}
                    placeholder="web-dev"
                  />
                  <p className="field-hint">Minted via POST /duel/dev-token.</p>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>

        <section className="panel">
          <h2 className="panel-title">Gameplay</h2>
          <p className="field-hint">
            Also under ⚙ during a match. Saved in this browser.
          </p>
          <GameplaySettingsFields />
        </section>

        <section className="panel">
          <h2 className="panel-title">Playmat</h2>
          <div
            className={`playmat-preview${playmatUrl ? " has-art" : ""}`}
            style={
              playmatUrl
                ? {
                    backgroundImage: `linear-gradient(rgba(5, 10, 14, ${settings.playmatDim}), rgba(5, 10, 14, ${settings.playmatDim})), linear-gradient(rgba(14, 34, 48, ${1 - settings.playmatOpacity}), rgba(14, 34, 48, ${1 - settings.playmatOpacity})), url("${playmatUrl}")`,
                  }
                : undefined
            }
            aria-label={playmatUrl ? "Your playmat" : "Default playmat"}
          >
            {!playmatUrl ? <span>Default playmat</span> : null}
          </div>
          <p className="field-hint">
            Official playmats are 24 × 14 in (12:7). You can crop, rotate and
            flip after choosing an image. Shown on your side of the board;
            stored only in this browser.
          </p>
          <div className="btn-row">
            <label className={`btn btn-secondary${matBusy ? " is-busy" : ""}`}>
              <input
                type="file"
                accept="image/*"
                className="visually-hidden"
                disabled={matBusy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) setEditing({ kind: "playmat", file: f });
                  e.target.value = "";
                }}
              />
              {matBusy
                ? "Processing…"
                : playmatUrl
                  ? "Replace image"
                  : "Upload image"}
            </label>
            {playmatUrl ? (
              <button
                type="button"
                className="btn btn-ghost"
                disabled={matBusy}
                onClick={() => void clearPlaymat().catch(() => undefined)}
              >
                Use default
              </button>
            ) : null}
          </div>
          {playmatUrl ? (
            <div className="field">
              <label htmlFor="mat-dim">
                Dim art · {Math.round(settings.playmatDim * 100)}%
              </label>
              <input
                id="mat-dim"
                type="range"
                className="range"
                min={0}
                max={0.8}
                step={0.05}
                value={settings.playmatDim}
                onChange={(e) => update({ playmatDim: Number(e.target.value) })}
              />
            </div>
          ) : null}
          {playmatUrl ? (
            <div className="field">
              <label htmlFor="mat-opacity">
                Art transparency · {Math.round((1 - settings.playmatOpacity) * 100)}%
              </label>
              <input
                id="mat-opacity"
                type="range"
                className="range"
                min={0}
                max={0.8}
                step={0.05}
                value={1 - settings.playmatOpacity}
                onChange={(e) => update({ playmatOpacity: 1 - Number(e.target.value) })}
              />
            </div>
          ) : null}
          {matError ? <p className="error-text">{matError}</p> : null}
        </section>

        <section className="panel">
          <h2 className="panel-title">Card back</h2>
          <div className="card-back-settings">
            <div
              className="card-back-preview"
              style={{
                backgroundImage: `${cardBackCssValue(cardBackUrl)}, linear-gradient(145deg, #243447, #15202c)`,
              }}
              role="img"
              aria-label={cardBackUrl ? "Your card back" : "Official card back"}
            />
            <div className="card-back-settings-body">
              <p className="field-hint">
                {cardBackUrl
                  ? "Custom card back."
                  : "Official ONE PIECE CARD GAME back."}{" "}
                Shown on your deck and Life cards; opponents see the official
                back. Crop, rotate and flip after choosing an image. Stored only
                in this browser.
              </p>
              <div className="btn-row">
                <label
                  className={`btn btn-secondary${backBusy ? " is-busy" : ""}`}
                >
                  <input
                    type="file"
                    accept="image/*"
                    className="visually-hidden"
                    disabled={backBusy}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) setEditing({ kind: "cardBack", file: f });
                      e.target.value = "";
                    }}
                  />
                  {backBusy
                    ? "Processing…"
                    : cardBackUrl
                      ? "Replace image"
                      : "Upload image"}
                </label>
                {cardBackUrl ? (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={backBusy}
                    onClick={() => void clearCardBack().catch(() => undefined)}
                  >
                    Use official
                  </button>
                ) : null}
              </div>
              {backError ? <p className="error-text">{backError}</p> : null}
            </div>
          </div>
        </section>

        <section className="panel">
          <h2 className="panel-title">Connection</h2>
          <div className="field">
            <label htmlFor="gs">Game server URL</label>
            <div className="field-inline">
              <input
                id="gs"
                autoCapitalize="off"
                autoCorrect="off"
                value={settings.serverUrl}
                onChange={(e) => update({ serverUrl: e.target.value })}
                placeholder={defaultServer}
              />
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={!settings.serverUrl}
                onClick={() => update({ serverUrl: "" })}
              >
                Reset
              </button>
            </div>
            <p className="field-hint">
              Leave blank to use the default ({defaultServer}).
            </p>
          </div>

          <div className="field">
            <label htmlFor="secret">Join secret</label>
            <input
              id="secret"
              autoCapitalize="off"
              autoCorrect="off"
              value={settings.joinSecret}
              onChange={(e) => update({ joinSecret: e.target.value })}
              placeholder="Optional — matches DEV_JOIN_SECRET"
            />
          </div>

          <p className="field-hint">API: {getApiBaseUrl()}</p>
        </section>

        <section className="panel panel-quiet">
          <h2 className="panel-title">About</h2>
          <p className="panel-copy">
            Private prototype. Rules engine and card effects are a work in
            progress.
          </p>
          <p className="field-hint">
            Build <BuildTag />
          </p>
        </section>
      </div>
      {editing ? (
        <ImageEditor
          file={editing.file}
          aspect={
            editing.kind === "playmat" ? PLAYMAT_ASPECT : CARD_BACK_ASPECT
          }
          title={editing.kind === "playmat" ? "Edit playmat" : "Edit card back"}
          outputWidth={editing.kind === "playmat" ? 2400 : 630}
          onCancel={() => setEditing(null)}
          onApply={(blob) => {
            const kind = editing.kind;
            setEditing(null);
            const file = new File([blob], "edited.png", { type: blob.type });
            if (kind === "playmat") void onPlaymatFile(file);
            else void onCardBackFile(file);
          }}
        />
      ) : null}
    </div>
  );
}
