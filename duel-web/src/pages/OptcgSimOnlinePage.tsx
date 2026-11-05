import { Link } from "react-router-dom";
import { FAN_DISCLAIMER } from "@optcg/site-legal";
import { NavMenu } from "../nav/NavMenu";
import { BackLink } from "./BackLink";
import "./playOnline.css";
import "./landing973.css";

/** Answers are shown on the page and published as FAQPage structured data (see prerender/entry.tsx). */
export const OPTCG_SIM_FAQ: readonly { q: string; a: string }[] = [
  {
    q: "Is OPTCG Duel free?",
    a: "Yes. Playing, ranked matches, bots, private rooms and the deck builder cost nothing.",
  },
  {
    q: "Do I need to download anything?",
    a: "No. It runs in your browser, so there is nothing to install and nothing to update. You can add it to your Home Screen if you want an app icon.",
  },
  {
    q: "Can I play on my phone?",
    a: "Yes. The board has layouts made for phones, in portrait and landscape, and you can drag cards with your finger.",
  },
  {
    q: "Is this an official game?",
    a: `No. ${FAN_DISCLAIMER}`,
  },
  {
    q: "Can I use my own decklist?",
    a: "Yes. Build a deck in OPTCG Duel, paste a decklist to import it, copy a meta deck, or bring a deck from the OPTCG Deck Planner.",
  },
  {
    q: "Can I play with friends?",
    a: "Yes. Make a private room and send your friend the link, or add friends and invite them. Other people can spectate a match from a link.",
  },
];

const COMPARISON: readonly { row: string; browser: string; download: string }[] = [
  { row: "Install needed", browser: "No, open the page", download: "Yes, download and install a program" },
  { row: "Works on a phone", browser: "Yes, with board layouts made for phones", download: "Depends on the simulator" },
  { row: "Works on Mac, Chromebook and PC", browser: "Yes, in any current browser", download: "Depends on the simulator" },
  { row: "Updates", browser: "Automatic, you always load the latest version", download: "Depends on the simulator" },
  { row: "Ranked ladder", browser: "Yes, with a Bounty and a leaderboard", download: "Varies" },
  { row: "Cost", browser: "Free", download: "Varies" },
];

const FEATURES: readonly { title: string; body: string }[] = [
  { title: "Ranked and Bounty ladder", body: "Match a random opponent, win to raise your Bounty and climb the leaderboard." },
  { title: "Casual and practice", body: "Play the computer on Easy, Normal or Hard, or play both sides yourself on one device to test a deck." },
  { title: "Private rooms", body: "Make a room, send a friend the link and play a casual game with a timer you choose." },
  { title: "Spectate", body: "Watch a match in progress from a link." },
  { title: "Replays and match logs", body: "Look back at a finished match turn by turn, and open its log." },
  { title: "Game review", body: "Review a finished game with Log Pose, the built-in AI coach, which grades moves from bot simulations." },
  { title: "Deck import", body: "Paste a decklist, copy a meta deck, or bring a deck from the OPTCG Deck Planner." },
  { title: "Meta decks and leaders", body: "Browse the leaders and decklists that are doing well, then try one right away." },
  { title: "Phone layouts", body: "A board built for small screens, in portrait and landscape." },
  { title: "Home Screen install", body: "Add it to your Home Screen to open it like an app, without an app store." },
  { title: "Crew themes", body: "Pick a crew or place for the look of the board, in light or dark." },
];

/** Public landing page for people searching "OPTCG sim online". */
export function OptcgSimOnlinePage() {
  return (
    <div className="app-shell">
      <div className="page play-online">
        <header className="page-header">
          <NavMenu />
          <BackLink to="/" label="Home" ariaLabel="Back to home" />
        </header>

        <section className="play-online-hero">
          <h1 className="page-title play-online-title">OPTCG sim online: play the One Piece TCG in your browser</h1>
          <p className="play-online-notice" role="note">
            <b>Unofficial fan-made One Piece TCG simulator.</b> Not affiliated with or endorsed by Bandai.
          </p>
          <p className="play-online-lede">
            OPTCG Duel is a free OPTCG sim that runs in your browser. There is no download and no install, so it works on a PC, a Mac, a
            Chromebook or a phone. Open the page, pick a deck and play: the rules engine handles DON!! attaching, attacks, blocks, counters,
            triggers and life for you, and you only make the decisions.
          </p>
          <div className="play-online-cta">
            <Link to="/" className="btn btn-primary btn-lg">
              Play now
            </Link>
            <Link to="/leaders" className="btn btn-secondary btn-lg">
              Top leaders
            </Link>
          </div>
        </section>

        <section className="panel" aria-labelledby="sim-compare">
          <h2 className="panel-title" id="sim-compare">
            Browser vs download simulators
          </h2>
          <p className="panel-copy landing-copy">
            Some simulators are programs you download and install. A browser simulator skips that step. The table below compares the two kinds in
            general terms; the details differ from one download simulator to the next.
          </p>
          <div className="landing-table-wrap">
            <table className="landing-table">
              <thead>
                <tr>
                  <th scope="col">Feature</th>
                  <th scope="col">OPTCG Duel (browser)</th>
                  <th scope="col">Download simulators</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON.map((r) => (
                  <tr key={r.row}>
                    <th scope="row">{r.row}</th>
                    <td>{r.browser}</td>
                    <td>{r.download}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel" aria-labelledby="sim-features">
          <h2 className="panel-title" id="sim-features">
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
          <p className="panel-copy landing-copy">
            Playing on a phone? Read <Link to="/play-optcg-on-phone">how to play the One Piece TCG on your phone</Link>. New to the site? See{" "}
            <Link to="/play-one-piece-tcg-online">how to play OPTCG online</Link>.
          </p>
        </section>

        <section className="panel" aria-labelledby="sim-other">
          <h2 className="panel-title" id="sim-other">
            Other ways to play
          </h2>
          <p className="panel-copy landing-copy">
            There is more than one way to play the One Piece TCG without a table in front of you.{" "}
            <a href="https://www.optcgsim.com/" target="_blank" rel="nofollow noopener">
              OPTCGSim
            </a>{" "}
            is a popular free downloadable simulator. Local game stores also run in-person events, which are the best way to play the real
            cards against people near you. Pick whatever suits how you like to play.
          </p>
        </section>

        <section className="panel" aria-labelledby="sim-faq">
          <h2 className="panel-title" id="sim-faq">
            Questions
          </h2>
          <dl className="play-online-faq">
            {OPTCG_SIM_FAQ.map((item) => (
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
