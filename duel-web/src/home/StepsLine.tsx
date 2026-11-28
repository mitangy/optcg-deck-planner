/** The whole flow in one line. Signed-in players already have a record, so only a guest sees the last step. */
export function stepsLine(guest: boolean): string[] {
  return guest ? ["Pick a deck", "Play", "Sign in to keep your record"] : ["Pick a deck", "Play"];
}

export function StepsLine({ guest }: { guest: boolean }) {
  const steps = stepsLine(guest);
  return (
    <ol className="steps-line" aria-label="How it works">
      {steps.map((s) => (
        <li key={s}>{s}</li>
      ))}
    </ol>
  );
}
