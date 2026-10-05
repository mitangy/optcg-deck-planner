/**
 * The prompt sentence without a leading "<card name> — ", for places that already
 * title the prompt with the card's name (the sheet header, the field bar).
 */
export function promptBody(sourceName: string, prompt: string): string {
  for (const sep of [" — ", ": ", " - "]) {
    const lead = `${sourceName}${sep}`;
    if (prompt.startsWith(lead) && prompt.length > lead.length) return prompt.slice(lead.length);
  }
  return prompt;
}
