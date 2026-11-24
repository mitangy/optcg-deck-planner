export function promptBody(sourceName: string, prompt: string): string {
  for (const sep of [" — ", ": ", " - "]) {
    const lead = `${sourceName}${sep}`;
    if (prompt.startsWith(lead) && prompt.length > lead.length) return prompt.slice(lead.length);
  }
  return prompt;
}
