import { PageShell } from "../layout/PageShell";
import { useState } from "react";
import { Link } from "react-router-dom";
import { getOrCreateGuestId } from "../auth/guestId";
import { UsernameSettings } from "../auth/UsernameSettings";
import { useAccountCosmetics } from "../account/cosmeticsSync";
import { flushAccountSync, stopAccountSync } from "../account/accountSync";
import { clearAuth, useAuthUser } from "../auth/session";
import { CARD_BACK_ASPECT, cardBackCssValue, useCardBackUrl } from "../cardBack";
import { DonArtPicker } from "./DonArtPicker";
import { SettingToggle } from "./SettingToggle";
import { CosmeticActions, useCosmeticSlot } from "../cosmetics/CosmeticActions";
import { CosmeticHistory } from "../cosmetics/CosmeticHistory";
import { ImageEditor } from "../cosmetics/ImageEditor";
import { googleLoginUrl, logoutSession } from "../net/api";
import { PLAYMAT_ASPECT, usePlaymatUrl } from "../playmat";
import { GameplaySettingsFields } from "../board/GameplaySettings";
import {
  devKeyAllowed,
  updateSettings,
  useDuelSettings,
  type DuelSettings,
} from "../settings";
import { useDuelSession } from "../state/DuelSession";
import { THEMES, type ColorMode } from "../theme";
import { VersionStatus } from "../VersionStatus";
import { openFeedback } from "../feedbackDialog";
import { AnalystLinkPanel } from "../history/AnalystLinkPanel";
import "../history/history.css";

const MODE_OPTIONS: { value: ColorMode; label: string }[] = [
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" },
  { value: "system", label: "Auto" },
];

/** The jump bar under the title, in page order. */
const JUMP_LINKS: { id: string; label: string; signedInOnly?: boolean }[] = [
  { id: "account", label: "Account" },
  { id: "gameplay", label: "Gameplay" },
  { id: "appearance", label: "Appearance" },
  { id: "deck-editor", label: "Deck editor" },
  { id: "log-pose", label: "Log Pose", signedInOnly: true },
  { id: "about", label: "About" },
];

export function SettingsPage() {
  const { setRating } = useDuelSession();
  const settings = useDuelSettings();
  const authUser = useAuthUser();
  const showDevKey = devKeyAllowed();
  const playmatUrl = usePlaymatUrl();
  const mat = useCosmeticSlot("playmat");
  const cardBackUrl = useCardBackUrl();
  const back = useCosmeticSlot("cardBack");
  const { signedIn } = useAccountCosmetics();
  const savedWhere = signedIn
    ? "Saved to your account, so it follows you to every device."
    : "Saved in this browser. Sign in to keep it on every device.";

  const [editing, setEditing] = useState<{
    kind: "playmat" | "cardBack";
    file: File;
  } | null>(null);

  function update(patch: Partial<DuelSettings>) {
    updateSettings(patch);
  }

  const editor = editing ? (
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
        void (kind === "playmat" ? mat : back).upload(file);
      }}
    />
  ) : null;

  return (
    <PageShell pageClass="page-narrow page-settings" back={{ to: "/", label: "Home", ariaLabel: "Back to home" }} title="Settings" outside={editor}>
      <nav className="settings-jump" aria-label="Jump to a section">
        {JUMP_LINKS.filter((l) => !l.signedInOnly || authUser).map((l) => (
          <a key={l.id} href={`#${l.id}`}>
            {l.label}
          </a>
        ))}
      </nav>

      {/* Phones: one column in this order. 1024px and up: Gameplay on the right, the rest on the left. */}
      <div className="settings-cols">
      <div className="settings-a">
      <section className="panel" id="account">
        <h2 className="panel-title">Account</h2>
        {authUser ? (
          <>
            <p className="panel-copy">
              Signed in as <strong>{authUser.email}</strong>. Your ranked Bounty
              follows this account.
            </p>
            <UsernameSettings user={authUser} />
            <div className="btn-row">
              <Link to="/history" className="btn btn-secondary">
                Match history
              </Link>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  void flushAccountSync().then(logoutSession).then(() => {
                    stopAccountSync({ clearDecks: true });
                    clearAuth();
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

      </div>
      <div className="settings-b">
      <section className="panel" id="gameplay">
        <h2 className="panel-title">Gameplay</h2>
        <p className="field-hint">
          Also under ⚙ during a match.{" "}
          {signedIn
            ? "Saved to your account, so they follow you to every device."
            : "Saved in this browser. Sign in to keep them on every device."}
        </p>
        <GameplaySettingsFields />
      </section>

      </div>
      <div className="settings-c">
      <div className="settings-section" id="appearance" role="group" aria-labelledby="appearance-title">
        <h2 className="settings-section-title" id="appearance-title">Appearance</h2>
        <section className="panel" id="theme">
          <h2 className="panel-title" id="theme-title">Theme</h2>
          <div className="segmented segmented-3" role="radiogroup" aria-label="Mode">
            {MODE_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={settings.colorMode === o.value}
                className={settings.colorMode === o.value ? "active" : undefined}
                onClick={() => update({ colorMode: o.value })}
              >
                {o.label}
              </button>
            ))}
          </div>
          <div className="theme-grid" role="radiogroup" aria-labelledby="theme-title">
            {THEMES.map((t) => (
              <label
                key={t.id}
                className={`theme-option${settings.theme === t.id ? " is-active" : ""}`}
              >
                <input
                  type="radio"
                  name="theme"
                  className="visually-hidden"
                  value={t.id}
                  checked={settings.theme === t.id}
                  onChange={() => update({ theme: t.id })}
                />
                <span className="theme-chip" data-theme={t.id} aria-hidden>
                  <span className="theme-chip-mat" />
                  <span className="theme-chip-btn" />
                  <span className="theme-chip-dot" />
                </span>
                <span className="theme-name">{t.name}</span>
                <span className="theme-blurb">{t.blurb}</span>
              </label>
            ))}
          </div>
          <p className="field-hint">
            Crew colours for the whole app. Light mode keeps the playmat dark. Auto
            follows your device. {savedWhere}
          </p>
        </section>

        <section className="panel" id="playmat">
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
            Best at 12:7 (official mats are 24 × 14 in). Crop, rotate and flip after
            choosing. Shown on your side of the board.{" "}
            {savedWhere}
          </p>
          <div className="btn-row">
            <CosmeticActions
              hasArt={Boolean(playmatUrl)}
              busy={mat.busy}
              resetLabel="Use default"
              onPick={(file) => setEditing({ kind: "playmat", file })}
              onReset={mat.reset}
            />
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
          <CosmeticHistory kind="playmat" />
          {mat.error ? <p className="error-text">{mat.error}</p> : null}
        </section>

        <section className="panel" id="card-back">
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
                Opponents and spectators see it unless they turn other players' art off.{" "}
                {savedWhere}
              </p>
              <div className="btn-row">
                <CosmeticActions
                  hasArt={Boolean(cardBackUrl)}
                  busy={back.busy}
                  resetLabel="Use official"
                  onPick={(file) => setEditing({ kind: "cardBack", file })}
                  onReset={back.reset}
                />
              </div>
              {back.error ? <p className="error-text">{back.error}</p> : null}
            </div>
          </div>
          <CosmeticHistory kind="cardBack" />
          <SettingToggle
            checked={settings.showOthersArt}
            onChange={(showOthersArt) => update({ showOthersArt })}
            label="Show other players' playmats and card backs"
            hint={<>Turn off to always see the standard art for opponents and players you watch. {savedWhere}</>}
          />
        </section>

        <section className="panel" id="don-card">
          <h2 className="panel-title">DON!! card</h2>
          <DonArtPicker
            value={settings.donArt}
            onChange={(donArt) => update({ donArt })}
            savedWhere={savedWhere}
          />
        </section>
      </div>

      <section className="panel" id="deck-editor">
        <h2 className="panel-title">Deck editor</h2>
        <SettingToggle
          checked={settings.deckStats}
          onChange={(deckStats) => update({ deckStats })}
          label="Deck stats"
          hint={<>Cost curve, counters, draw odds and build hints when you edit a deck. {savedWhere}</>}
        />
      </section>

      {authUser ? <AnalystLinkPanel /> : null}

      <section className="panel panel-quiet" id="about">
        <h2 className="panel-title">About</h2>
        <p className="panel-copy">
          Private prototype. Rules engine and card effects are a work in
          progress.
        </p>
        <VersionStatus actions />
        <div className="about-feedback">
          <Link to="/whats-new" className="btn btn-ghost btn-sm about-feedback-btn">
            What’s new
          </Link>
          <button type="button" className="btn btn-ghost btn-sm about-feedback-btn" onClick={() => openFeedback("Send feedback")}>
            Send feedback
          </button>
        </div>
      </section>
      </div>
      </div>
    </PageShell>
  );
}
