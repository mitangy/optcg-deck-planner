import { useEffect } from "react";
import { Link } from "react-router-dom";
import { FAN_DISCLAIMER } from "@optcg/site-legal";
import { NavMenu } from "../nav/NavMenu";
import { BackLink } from "./BackLink";
import "./playOnline.css";

/** Plain-language answers, also published as FAQPage structured data so they can show in search results. */
export const PLAY_ONLINE_FAQ: readonly { q: string; a: string }[] = [
  {
    q: "Is OPTCG Duel free?",
    a: "Yes. Playing, ranked matches, bots, private rooms and the deck builder cost nothing. Optional extras such as the Log Pose AI coach have a usage limit.",
  },
  {
    q: "Do I need to download anything?",
    a: "No. It runs in your browser on a computer, tablet or phone. You can add it to your Home Screen if you want an app icon.",
  },
  {
    q: "Can I play OPTCG on my phone?",
    a: "Yes. The board has a layout made for phones, and you can drag cards with your finger.",
  },
  {
    q: "Which cards and sets are included?",
    a: "The card catalog covers the booster sets from OP01 on, the extra boosters, the starter decks and promo cards. New sets are added as they are released.",
  },
  {
    q: "Can I use my own deck?",
    a: "Yes. Build one in OPTCG Duel, import a decklist, copy a meta deck, or bring a deck you made in the OPTCG Deck Planner.",
  },
  {
    q: "Is this an official Bandai game?",
    a: `No. ${FAN_DISCLAIMER}`,
  },
];

const STEPS: readonly { title: string; body: string }[] = [
  {
    title: "Pick a deck",
    body: "Start with a ready-made deck, copy one of the meta decks, build your own, or bring a deck from the OPTCG Deck Planner.",
  },
  {
    title: "Choose how to play",
    body: "Ranked against a random opponent, practice against a bot, or make a private room and send a friend the link.",
  },
  {
    title: "Play",
    body: "The game enforces the rules for you: DON!! attach, attacks, blocks, counters, triggers and life. You just make the decisions.",
  },
];

const FEATURES: readonly { title: string; body: string }[] = [
  { title: "Ranked ladder", body: "Win matches to raise your Bounty and climb the leaderboard." },
  { title: "Bots", body: "Practice any deck against the computer on Easy, Normal or Hard. Bot games are never ranked." },
  { title: "Friends and invites", body: "Add friends, see who is around and invite them to a private room." },
  { title: "Spectate", body: "Watch a match in progress from a link." },
  { title: "Replays and match logs", body: "Look back at a finished match turn by turn." },
  { title: "Log Pose AI coach", body: "Ask about your deck or the board you are looking at." },
  { title: "Undo", body: "Ask to take back your last action or a whole turn." },
  { title: "Themes", body: "Pick a crew or place for the look of the board, in light or dark." },
  { title: "Phone layout", body: "A board built for small screens, not a shrunken desktop page." },
];

/** Public landing page for people searching how to play OPTCG online. */
export function PlayOnlinePage() {
  useFaqJsonLd();
  return (
    <div className="app-shell">
      <div className="page play-online">
        <header className="page-header">
          <NavMenu />
          <BackLink to="/" label="Home" ariaLabel="Back to home" />
        </header>

        <section className="play-online-hero">
          <h1 className="page-title play-online-title">Play OPTCG online, free in your browser</h1>
          <p className="play-online-notice" role="note">
            <b>Unofficial fan-made One Piece TCG simulator.</b> Not affiliated with or endorsed by Bandai.
          </p>
          <p className="play-online-lede">
            OPTCG Duel is a free, unofficial simulator for the One Piece Trading Card Game. There is no download and no sign-up
            to start. It works on desktop and on your phone, and the rules engine runs the game for you, from attacks and
            blocks to card effects.
          </p>
          <div className="play-online-cta">
            <Link to="/" className="btn btn-primary btn-lg">
              Play now
            </Link>
            <Link to="/decks/meta" className="btn btn-secondary btn-lg">
              Browse meta decks
            </Link>
          </div>
        </section>

        <section className="panel" aria-labelledby="po-start">
          <h2 className="panel-title" id="po-start">
            How to start
          </h2>
          <ol className="play-online-steps">
            {STEPS.map((s) => (
              <li key={s.title}>
                <b>{s.title}</b>
                <span>{s.body}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="panel" aria-labelledby="po-features">
          <h2 className="panel-title" id="po-features">
            What you can do
          </h2>
          <ul className="play-online-features">
            {FEATURES.map((f) => (
              <li key={f.title}>
                <b>{f.title}</b>
                <span>{f.body}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel" aria-labelledby="po-faq">
          <h2 className="panel-title" id="po-faq">
            Questions
          </h2>
          <dl className="play-online-faq">
            {PLAY_ONLINE_FAQ.map((item) => (
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
        </div>
      </div>
    </div>
  );
}

/** Adds FAQPage JSON-LD to the head while the page is open. */
function useFaqJsonLd() {
  useEffect(() => {
    const el = document.createElement("script");
    el.type = "application/ld+json";
    el.dataset.pageJsonld = "faq";
    el.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: PLAY_ONLINE_FAQ.map((item) => ({
        "@type": "Question",
        name: item.q,
        acceptedAnswer: { "@type": "Answer", text: item.a },
      })),
    });
    document.head.appendChild(el);
    return () => el.remove();
  }, []);
}
