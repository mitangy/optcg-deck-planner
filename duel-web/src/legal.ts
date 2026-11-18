export function showOfficialIdentity(): boolean {
  const raw = import.meta.env.VITE_SHOW_OFFICIAL_IDENTITY;
  if (raw === undefined || raw === "") return true;
  return raw === "1" || raw.toLowerCase() === "true";
}
