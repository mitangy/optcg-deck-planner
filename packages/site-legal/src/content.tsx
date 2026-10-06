import type { ReactNode } from "react";

/** Shows a "draft under review" banner on every legal page. Turn off once reviewed. */
export const LEGAL_DRAFT = true;

export const LEGAL_UPDATED = "6 October 2026";

/** Contact for privacy requests. Empty until one is chosen; the pages say so. */
export const LEGAL_CONTACT_EMAIL = "";

export type LegalKind = "terms" | "privacy" | "cookies";

export const LEGAL_PATHS: Record<LegalKind, string> = {
  terms: "/terms",
  privacy: "/privacy",
  cookies: "/cookies",
};

export const LEGAL_TITLES: Record<LegalKind, string> = {
  terms: "Terms & credits",
  privacy: "Privacy policy",
  cookies: "Cookies",
};

export const FAN_DISCLAIMER =
  "Unofficial fan-made project, not affiliated with or endorsed by Bandai.";

export const OWNERSHIP_NOTICE =
  "“One Piece Card Game” © Bandai Co., Ltd. “One Piece” © Eiichiro Oda / Shueisha, Toei Animation. " +
  "All trademarks, card images and game content belong to their respective owners and are used " +
  "for informational and community purposes.";

function Contact() {
  return LEGAL_CONTACT_EMAIL ? (
    <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>
  ) : (
    <>the site maintainer (a contact email is coming soon)</>
  );
}

const SITES = (
  <>
    OPTCG Deck Planner (<strong>optcg-deck-planner.app</strong>) and OPTCG Duel (
    <strong>optcgduel.app</strong>)
  </>
);

const terms: ReactNode = (
  <>
    <p>
      These terms cover {SITES}, together “the sites”. They are free fan tools for planning One
      Piece Card Game decks and playing practice matches online. By using them you agree to the
      terms below.
    </p>

    <h2>Fan project</h2>
    <p>{FAN_DISCLAIMER}</p>
    <p>{OWNERSHIP_NOTICE}</p>
    <p>
      If you hold rights in any of this content and want something changed or removed, contact <Contact /> and we will act on it promptly.
    </p>

    <h2>Using the sites</h2>
    <ul>
      <li>
        The sites are provided as is, without warranties of any kind. Features may change, break
        or be removed, and the sites may go offline at any time.
      </li>
      <li>
        Card prices and recent sales come from TCGplayer and are for reference only. They can be
        late or wrong, and they are not offers to buy or sell.
      </li>
      <li>
        The duel rules engine is our own reading of the official rules and card text. It can get
        rulings wrong; the official rules always win. Ratings (Bounty) are for fun and carry no
        prize or official standing.
      </li>
      <li>
        Group buys are a bookkeeping aid between people who know each other. We are not a party to
        any purchase or payment and do not handle money.
      </li>
    </ul>

    <h2>Your account and content</h2>
    <ul>
      <li>
        You sign in with Google. Keep your Google account secure; anything done while signed in is
        treated as done by you.
      </li>
      <li>
        Usernames, match chat and uploaded images (playmats, card backs) must not be offensive,
        harassing, or impersonate someone else, and you must have the right to use any image you
        upload.
      </li>
      <li>
        Do not cheat, attack or overload the sites or the game server, or scrape them at volume.
      </li>
      <li>
        We may remove content or suspend accounts that break these terms. You can stop using the
        sites at any time and ask us to delete your account (see the{" "}
        <a href="/privacy">Privacy policy</a>).
      </li>
    </ul>

    <h2>Credits</h2>
    <ul>
      <li>One Piece Card Game, its rules, card text and artwork: Bandai Co., Ltd.</li>
      <li>One Piece: Eiichiro Oda / Shueisha, Toei Animation.</li>
      <li>
        Card images and market prices: TCGplayer, with the card catalog collected through{" "}
        <a href="https://tcgcsv.com" target="_blank" rel="noopener noreferrer">
          TCGCSV
        </a>
        .
      </li>
      <li>Fonts: Fraunces and IBM Plex Sans, served by Google Fonts.</li>
      <li>
        Built with open-source software including React, Vite, FastAPI, SQLAlchemy and Colyseus.
        Thank you to their authors.
      </li>
    </ul>

    <h2>Changes</h2>
    <p>
      We may update these terms. The date at the top changes when we do, and continuing to use the
      sites means you accept the updated terms.
    </p>
  </>
);

const privacy: ReactNode = (
  <>
    <p>
      This policy explains what {SITES} collect, why, and who else sees it. They are run as a
      small, non-commercial fan project. We do not sell your data, show ads, or use advertising
      trackers.
    </p>

    <h2>What we collect</h2>
    <h3>Your account</h3>
    <p>
      When you sign in with Google we receive your email address, your name and a Google account
      ID. We use them to sign you in and to show your name on things you share. On OPTCG Duel you
      also pick a public username, which other players see.
    </p>

    <h3>Deck planner</h3>
    <ul>
      <li>Your decks, the cards you own, and your shopping-list choices.</li>
      <li>
        Share links you create. Anyone with a link can see that deck or list and the name you
        shared it under, until you turn the link off.
      </li>
      <li>
        Group buys: member names, quantities, prices and any receipt text you paste in to match an
        order. Members of the group buy can see these.
      </li>
      <li>
        The card scanner uses your camera only inside your browser. Camera images are not uploaded.
      </li>
    </ul>

    <h3>OPTCG Duel</h3>
    <ul>
      <li>
        Your duel settings and any playmat or card back images you upload, so they follow you to
        other devices. Uploads are kept as a history you can delete in Settings.
      </li>
      <li>Ranked match results (who played, who won, why) and your Bounty rating.</li>
      <li>
        Friends, game invites, and while you are in a match, which room you are in, so friends can
        join or watch.
      </li>
      <li>
        Match chat is passed between the players in the room and held in the game server’s memory
        for that match only. It is not saved.
      </li>
      <li>
        Log Pose, the deck analyst: recorded games (both decks and every move) are used, without
        names, usernames or exact ratings, for its win rate stats and as example games it can
        study when answering any player. You can leave your games out under Settings, Log Pose.
        Questions you ask Log Pose in the app, its answers, and the game reviews it writes for you
        are saved to your account so you can reread them.
      </li>
      <li>
        Card reports you send: the card, your description, where you saw it (match, practice or
        deck), the app version, and your account if you are signed in.
      </li>
      <li>
        If you play without signing in, a random guest ID is kept in your browser so the game
        server can recognise you between matches.
      </li>
    </ul>

    <h3>Feedback</h3>
    <p>
      When you use “Report a problem” or “Send feedback” on either site we store your message and
      the type you chose, the page you were on (path only), the app version, your screen size, your
      browser’s user agent, the match room ID if you sent it from a match, and your account if you
      are signed in.
    </p>

    <h3>Analytics and logs</h3>
    <p>
      We use Vercel Web Analytics and Speed Insights to count page views and measure load speed.
      They do not use cookies. They record the page path (we remove query strings and share
      tokens first), the referring site, country, and device, browser and operating system type.
      Our hosting providers keep standard server logs, including IP addresses, for security and
      troubleshooting.
    </p>

    <h2>Who else handles it</h2>
    <ul>
      <li>
        <strong>Google</strong>: sign-in. Google also serves our fonts, so it sees your IP address
        when a page loads.
      </li>
      <li>
        <strong>Vercel</strong>: hosts both web apps and runs the analytics above.
      </li>
      <li>
        <strong>Render</strong>: hosts our API and the duel game server.
      </li>
      <li>
        <strong>Anthropic</strong>: runs Claude, the model behind Log Pose in the app. What you ask
        Log Pose, with the deck or game you have open and the game records it looks up, is sent to
        Anthropic&rsquo;s API to write the answer.
      </li>
      <li>
        <strong>Neon</strong>: hosts the database that stores the data above.
      </li>
      <li>
        <strong>TCGplayer</strong>: card images load straight from TCGplayer’s servers, so they
        see your IP address and browser details. Prices are fetched by our server, so none of your
        data is sent to get them.
      </li>
    </ul>
    <p>
      These providers may process data outside your country, including in the United States. We
      do not share your data with anyone else unless the law requires it.
    </p>

    <h2>How long we keep it</h2>
    <p>
      Account data stays until you delete it or ask us to delete your account. Deleting a deck,
      share link, group buy or uploaded image removes it. Server logs and analytics are kept for
      the limited periods our providers set.
    </p>

    <h2>Your choices</h2>
    <p>
      You can see and change most of your data in the apps. To get a copy of your data, correct
      it, or delete your account and everything linked to it, contact <Contact />. Depending
      on where you live you may have further rights, such as objecting to processing or
      complaining to a data protection authority.
    </p>

    <h2>Children</h2>
    <p>The sites are not meant for children under 13, and we do not knowingly collect their data.</p>

    <h2>Changes</h2>
    <p>
      We will update this page when what we collect changes. The date at the top shows the latest
      version.
    </p>
  </>
);

const cookies: ReactNode = (
  <>
    <p>
      {SITES} use a small number of cookies, all needed for signing in. We do not use advertising
      or tracking cookies, and our analytics do not use cookies, so there is nothing to opt into.
    </p>

    <h2>Cookies we set</h2>
    <div className="legal-table-wrap">
      <table className="legal-table">
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">Purpose</th>
            <th scope="col">Lasts</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>optcg_session</code>
            </td>
            <td>Keeps you signed in. Not readable by page scripts.</td>
            <td>30 days, or until you log out</td>
          </tr>
          <tr>
            <td>
              <code>optcg_oauth_nonce</code>
            </td>
            <td>Protects the Google sign-in step from forgery.</td>
            <td>10 minutes</td>
          </tr>
          <tr>
            <td>
              <code>optcg_oauth_return</code>
            </td>
            <td>Remembers which app to return you to after Google sign-in.</td>
            <td>10 minutes</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p>
      Google sets its own cookies on its sign-in pages. Those are covered by Google’s privacy
      policy.
    </p>

    <h2>Storage in your browser</h2>
    <p>
      The apps also save things in your browser’s local storage, session storage and IndexedDB.
      These stay on your device and are not sent to us unless the feature says so (for example,
      settings sync when you are signed in).
    </p>
    <ul>
      <li>Preferences such as theme, list or grid layout, sorting, filters and open panels.</li>
      <li>OPTCG Duel settings, saved decks, and the selected deck.</li>
      <li>Your playmat and card back images, cached so matches load quickly.</li>
      <li>A guest ID if you play without signing in.</li>
      <li>A cache of card data used by the card scanner.</li>
      <li>
        Short-lived notes such as the match to rejoin after a reload and the page to return to
        after signing in.
      </li>
    </ul>

    <h2>Clearing them</h2>
    <p>
      You can delete cookies and site data in your browser settings at any time. Clearing the
      session cookie signs you out, and clearing site data resets your device preferences and any
      decks you saved only on that device.
    </p>
  </>
);

export const LEGAL_CONTENT: Record<LegalKind, ReactNode> = { terms, privacy, cookies };
