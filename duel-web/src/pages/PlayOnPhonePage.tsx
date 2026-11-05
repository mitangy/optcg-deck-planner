import { Link } from "react-router-dom";
import { FAN_DISCLAIMER } from "@optcg/site-legal";
import { NavMenu } from "../nav/NavMenu";
import { BackLink } from "./BackLink";
import "./playOnline.css";
import "./landing973.css";

/** Answers are shown on the page and published as FAQPage structured data (see prerender/entry.tsx). */
export const PLAY_ON_PHONE_FAQ: readonly { q: string; a: string }[] = [
  {
    q: "Can I play the One Piece TCG on my phone?",
    a: "Yes. OPTCG Duel runs in your phone's browser, in Safari on iPhone and in Chrome or another browser on Android, with a board made for small screens.",
  },
  {
    q: "Is there an app to download?",
    a: "No. There is nothing in an app store. You open the site, and you can add it to your Home Screen so it opens like an app.",
  },
  {
    q: "Is it free?",
    a: "Yes. Playing, ranked matches, bots and private rooms cost nothing.",
  },
  {
    q: "Should I play in portrait or landscape?",
    a: "Both work. Portrait is easier to hold with one hand; landscape gives the cards more room. The board shows a one-time tip to rotate for bigger cards, and Settings lets you pick a preferred orientation.",
  },
  {
    q: "Can I play my own deck on my phone?",
    a: "Yes. Import a decklist, copy a meta deck, or bring a deck from the OPTCG Deck Planner, then play it.",
  },
  {
    q: "Is this an official game?",
    a: `No. ${FAN_DISCLAIMER}`,
  },
];

const IPHONE_STEPS: readonly string[] = [
  "Open optcgduel.app in Safari. Other iPhone browsers cannot add a Home Screen icon the same way.",
  "Tap the Share button.",
  "Tap Add to Home Screen, then Add.",
];

const ANDROID_STEPS: readonly string[] = [
  "Open optcgduel.app in Chrome or your usual browser.",
  "Open the browser menu.",
  "Tap Install app or Add to Home screen. The wording depends on your browser.",
];

const TIPS: readonly { title: string; body: string }[] = [
  { title: "Rotate for bigger cards", body: "Hold the phone sideways for a wider board. On a phone held upright you will see a one-time reminder." },
  { title: "Drag to play", body: "Drag a card from your hand onto the field to play it, drag DON!! onto a character to attach it, and drag a Leader or Character onto an opposing card to attack." },
  { title: "Tap for actions", body: "Tap a card to see what it can do right now. If there is only one action, a tap does it." },
  { title: "Long-press to read", body: "Long-press a card to inspect it at full size and read its text." },
  { title: "Simple board", body: "In portrait, the Simple board on phones setting turns your Life, Deck, DON!! and Trash into counts so your cards get bigger." },
  { title: "Lock the orientation", body: "Settings can lock a match to portrait or landscape on browsers that allow it, such as Android Chrome in full screen or installed. iPhone Safari does not allow it." },
];

/** Public landing page for people searching how to play the One Piece TCG on a phone. */
export function PlayOnPhonePage() {
  return (
    <div className="app-shell">
      <div className="page play-online">
        <header className="page-header">
          <NavMenu />
          <BackLink to="/" label="Home" ariaLabel="Back to home" />
        </header>

        <section className="play-online-hero">
          <h1 className="page-title play-online-title">Play the One Piece TCG on your phone</h1>
          <p className="play-online-notice" role="note">
            <b>Unofficial fan-made One Piece TCG simulator.</b> Not affiliated with or endorsed by Bandai.
          </p>
          <p className="play-online-lede">
            OPTCG Duel runs in mobile Safari and Chrome, so you can play the One Piece Trading Card Game on an iPhone or an Android phone
            without an app store. There is nothing to download: open the page, pick a deck and play. It is free, and the rules engine runs
            the game for you.
          </p>
          <div className="play-online-cta">
            <Link to="/" className="btn btn-primary btn-lg">
              Play now
            </Link>
            <Link to="/optcg-sim-online" className="btn btn-secondary btn-lg">
              OPTCG sim online
            </Link>
          </div>
        </section>

        <section className="panel" aria-labelledby="ph-home">
          <h2 className="panel-title" id="ph-home">
            Add it to your Home Screen
          </h2>
          <p className="panel-copy landing-copy">
            This is optional. A Home Screen icon opens OPTCG Duel full screen, like an app, with no browser bars.
          </p>
          <div className="landing-columns">
            <div>
              <h3 className="landing-subtitle">iPhone</h3>
              <ol className="landing-list">
                {IPHONE_STEPS.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
            </div>
            <div>
              <h3 className="landing-subtitle">Android</h3>
              <ol className="landing-list">
                {ANDROID_STEPS.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        <section className="panel" aria-labelledby="ph-layouts">
          <h2 className="panel-title" id="ph-layouts">
            Portrait and landscape
          </h2>
          <p className="panel-copy landing-copy">
            In portrait, the board is laid out for a tall screen with your opponent's side at the top and yours at the bottom. In landscape,
            the cards get more room: the battle log, chat and matchup brief move into a small icon rail on the left that opens as an overlay,
            and the actions sit in a slim column on the right. Switch any time by turning the phone.
          </p>
        </section>

        <section className="panel" aria-labelledby="ph-tips">
          <h2 className="panel-title" id="ph-tips">
            Tips for playing on a phone
          </h2>
          <ul className="play-online-features">
            {TIPS.map((t) => (
              <li key={t.title}>
                <b>{t.title}</b>
                <span>{t.body}</span>
              </li>
            ))}
          </ul>
          <p className="panel-copy landing-copy">
            Looking for the full feature list? See <Link to="/optcg-sim-online">OPTCG sim online</Link> or{" "}
            <Link to="/play-one-piece-tcg-online">how to play OPTCG online</Link>.
          </p>
        </section>

        <section className="panel" aria-labelledby="ph-faq">
          <h2 className="panel-title" id="ph-faq">
            Questions
          </h2>
          <dl className="play-online-faq">
            {PLAY_ON_PHONE_FAQ.map((item) => (
              <div key={item.q}>
                <dt>{item.q}</dt>
                <dd>{item.a}</dd>
              </div>
            ))}
          </dl>
        </section>

        <div className="play-online-cta play-online-cta-end">
          <Link to="/" className="btn btn-primary btn-lg">
            Play now
          </Link>
          <Link to="/leaders" className="btn btn-secondary btn-lg">
            Top leaders
          </Link>
        </div>
      </div>
    </div>
  );
}
