/** Legal / IP gate for public builds (ADR-008). */
export function showOfficialIdentity(): boolean {
  const raw = import.meta.env.VITE_SHOW_OFFICIAL_IDENTITY;
  if (raw === undefined || raw === "") return true; // staging default: show arts
  return raw === "1" || raw.toLowerCase() === "true";
}
