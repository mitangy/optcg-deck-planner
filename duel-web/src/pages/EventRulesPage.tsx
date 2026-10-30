import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { LEGAL_CONTACT_EMAIL } from "@optcg/site-legal";
import { type DuelEvent, fetchEventById } from "../events/eventApi";
import { NavMenu } from "../nav/NavMenu";

function inZone(iso: string, timeZone: string, withDate = true): string {
  return new Intl.DateTimeFormat("en-US", {
    ...(withDate ? { weekday: "long", month: "long", day: "numeric", year: "numeric" } : {}),
    hour: "numeric",
    minute: "2-digit",
    timeZone,
    timeZoneName: "short",
  }).format(new Date(iso));
}

/** "Monday, November 23, 2026": the day after the event ends, Eastern time. */
function drawDay(endsAt: string): string {
  const next = new Date(Date.parse(endsAt) + 24 * 3_600_000);
  return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "America/New_York" }).format(next);
}

function RulesBody({ event }: { event: DuelEvent }) {
  const contact = LEGAL_CONTACT_EMAIL ? <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a> : <>the site maintainer through the feedback link in the site footer</>;
  return (
    <article className="legal-doc" aria-label={`${event.title} official rules`}>
      <p className="legal-updated">Rules version {event.rules_version}</p>
      <p className="rules-caps">NO PURCHASE NECESSARY. A purchase or payment of any kind will not increase your chances of winning. This is a free giveaway, not a raffle.</p>

      <h2>Sponsor</h2>
      <p>
        {event.title} is run by Miko, the operator of optcgduel.app (the “Sponsor”). It is not sponsored, endorsed or administered by Bandai Namco,
        TCGPlayer, Instagram or Meta, and none of them is responsible for it.
      </p>

      <h2>Who can enter</h2>
      <ul>
        <li>You must be a resident of the United States and at least 13 years old.</li>
        <li>If you are under 18, you need a parent’s or guardian’s permission to enter and to accept a prize.</li>
        <li>The site’s staff and moderators may join and play, but cannot win. Banned accounts cannot win. Guest accounts cannot enter.</li>
        <li>Void where prohibited by law.</li>
      </ul>

      <h2>Entry window</h2>
      <p>
        Games count only if they finish between {inZone(event.starts_at, "UTC")} and {inZone(event.ends_at, "UTC")}, which is {inZone(event.starts_at, "America/New_York")} to{" "}
        {inZone(event.ends_at, "America/New_York", false)} (the window starts at the first time and ends just before the second).
      </p>

      <h2>How to enter</h2>
      <ol>
        <li>Sign in to optcgduel.app with an account (not a guest) and press “Join the giveaway” on the home page. You must accept these rules to join. You can join at any time until the event ends.</li>
        <li>
          During the entry window, finish at least {event.min_games} games of {event.min_turns} or more turns each against at least {event.min_opponents} different signed-in players. Ranked and
          casual games both count. Games against guests, against yourself, or that end before turn {event.min_turns} do not count.
        </li>
      </ol>
      <p>
        Entry is free: you only play. There is one entry per person. Using more than one account, or working with another player to farm games (for example by
        playing each other repeatedly to reach the numbers), disqualifies the accounts involved. Your progress is shown on the home page.
      </p>

      <h2>Prizes</h2>
      <p>
        {event.winners} winners will each receive one $20 USD TCGPlayer gift card ({event.prize}). The approximate total value of all prizes is $60 USD. Each gift card is delivered
        by email as a code and is subject to TCGPlayer’s own terms. There is no cash alternative and prizes cannot be exchanged or transferred. Winners are responsible for any
        taxes that apply.
      </p>

      <h2>Odds</h2>
      <p>The odds of winning depend on the number of eligible entrants.</p>

      <h2>How the winners are drawn</h2>
      <p>
        The draw is verifiable. Before the event starts, the Sponsor commits to a secret random seed by publishing its SHA-256 hash. After the event, the seed is revealed so anyone can
        check the result.
      </p>
      <ol>
        <li>
          Eligible entrants are the players who joined and met the requirements above. After the draw, their account ids are published here, so the list can be checked.
        </li>
        <li>Each eligible account id is scored with HMAC-SHA256, using the seed as the key and the text <code>{event.id}:&lt;account id&gt;</code> as the message.</li>
        <li>
          The accounts are sorted by that score, lowest first. The first {event.winners} accounts win. If a winner cannot be contacted, is not eligible, or declines, the next account in the
          sorted list takes the place.
        </li>
      </ol>
      <p>Seed hash (published before the event):</p>
      <code className="rules-hash" data-testid="seed-hash">
        {event.seed_hash ?? "Will be published here before the event starts."}
      </code>
      <p>Seed (revealed after the draw):</p>
      <code className="rules-hash" data-testid="seed">
        {event.seed ?? "Not revealed yet."}
      </code>
      {event.seed ? (
        <>
          <p>Eligible account ids: {event.eligible_user_ids?.join(", ") || "none"}.</p>
          <pre className="rules-hash">{`import hashlib, hmac
seed = "<the seed above>"
rank = lambda i: hmac.new(seed.encode(), f"${event.id}:{i}".encode(), hashlib.sha256).hexdigest()
print(sorted(eligible_ids, key=rank))`}</pre>
        </>
      ) : null}
      <p>The draw takes place on or about {drawDay(event.ends_at)}.</p>

      <h2>Winner notification</h2>
      <p>
        Winners are contacted at the email address of their account. A winner has 7 days to reply. If they do not reply in time, the next account in the sorted list is chosen instead.
        Winners are announced by display name only, and only with their permission.
      </p>

      <h2>Privacy</h2>
      <p>
        Email addresses are used only to contact winners. See the <Link to="/privacy">privacy policy</Link> for how the site handles your data.
      </p>

      <h2>Changes and cancellation</h2>
      <p>
        If technical problems or anything else outside the Sponsor’s control affects the fairness or running of the event, the Sponsor may change, suspend or cancel it. Accounts found
        cheating or abusing the game or these rules are disqualified.
      </p>

      <h2>Questions</h2>
      <p>Contact {contact}.</p>
    </article>
  );
}

/** Official rules of a giveaway event: /events/:eventId/rules (#794). */
export function EventRulesPage() {
  const { eventId } = useParams();
  const [state, setState] = useState<{ status: "loading" } | { status: "none" } | { status: "ready"; event: DuelEvent }>({ status: "loading" });

  useEffect(() => {
    let live = true;
    // By id, not "current": the banner drops an ended event after a week, but the rules, seed and
    // eligible ids must stay readable through the draw and the winner's reply window (#795).
    fetchEventById(eventId ?? "")
      .then((event) => live && setState(event ? { status: "ready", event } : { status: "none" }))
      .catch(() => live && setState({ status: "none" }));
    return () => {
      live = false;
    };
  }, [eventId]);

  return (
    <div className="app-shell">
      <div className="page page-narrow legal-page rules-page">
        <header className="page-header">
          <NavMenu />
          <Link to="/" className="btn btn-ghost btn-sm page-back" aria-label="Back to home">
            ← Home
          </Link>
          <h1 className="page-title">Official rules</h1>
        </header>
        {state.status === "ready" ? (
          <RulesBody event={state.event} />
        ) : (
          <p className="panel-copy" role="status">
            {state.status === "loading" ? "Loading…" : "These rules are not available."}
          </p>
        )}
      </div>
    </div>
  );
}
