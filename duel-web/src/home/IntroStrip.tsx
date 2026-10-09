/** First-visit "how it works" for guests, until dismissed or a match starts from the lobby. */
export function IntroStrip({ onDismiss }: { onDismiss: () => void }) {
  return (
    <section className="intro" aria-label="How it works">
      <ol className="intro-steps">
        <li>
          <b>Pick a deck</b>
          <span>Starters are ready, or build one in the Planner.</span>
        </li>
        <li>
          <b>Practice</b>
          <span>Play both sides on this device.</span>
        </li>
        <li>
          <b>Sign in</b>
          <span>Ranked and a Bounty, friends, match logs.</span>
        </li>
      </ol>
      <button type="button" className="btn btn-ghost btn-sm intro-dismiss" onClick={onDismiss}>
        Got it
      </button>
    </section>
  );
}
