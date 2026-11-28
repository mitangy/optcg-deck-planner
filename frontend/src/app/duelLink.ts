import { consumeHandoffOnLoad, otherAppClickHandler, type ClaimOutcome, type HandoffMinter } from "@optcg/ui/handoff";
import { api } from "../api";
import { buildOptcgSimExport, type OptcgSimExportCard } from "../pages/shopping/optcgsimExport";

export const DUEL_URL = (
  (import.meta.env.VITE_DUEL_URL as string | undefined)?.trim() || "https://optcgduel.app"
).replace(/\/+$/, "");

export function duelPlayPath(deck: {
  id: number | string;
  name: string;
  leader_card_id?: string | null;
  cards: OptcgSimExportCard[];
}): string | null {
  if (!deck.leader_card_id) return null;
  const { pasteText, lineCount } = buildOptcgSimExport(deck.cards, {
    leaderCardId: deck.leader_card_id,
  });
  if (lineCount === 0) return null;
  return (
    `/decks?planner=${encodeURIComponent(String(deck.id))}` +
    `#list=${encodeURIComponent(pasteText)}&name=${encodeURIComponent(deck.name)}`
  );
}

export function duelPlayUrl(deck: Parameters<typeof duelPlayPath>[0]): string | null {
  const path = duelPlayPath(deck);
  return path ? `${DUEL_URL}${path}` : null;
}

const mintForDuel: HandoffMinter = () => api.mintHandoff("duel");

/**
 * Props for an `<a>` to the Duel app that keeps the signed-in person signed in there (#1502). Only use it where the viewer
 * is signed in; a signed-out viewer gets a failed ticket request and the plain link.
 */
export function duelLinkProps(path: string): {
  href: string;
  target: "_blank";
  rel: string;
  onClick: (e: React.MouseEvent) => void;
} {
  return {
    href: `${DUEL_URL}${path}`,
    target: "_blank",
    rel: "noopener",
    onClick: otherAppClickHandler(DUEL_URL, path, mintForDuel, { newTab: true }),
  };
}

/** Start-up: signs in on a handoff ticket from the Duel app (if the address carries one) before the app renders. */
export function claimDuelHandoff(): Promise<ClaimOutcome> {
  return consumeHandoffOnLoad({
    location: window.location,
    history: window.history,
    audience: "planner",
    referrer: document.referrer,
    siblingOrigin: DUEL_URL,
    currentUserId: async () => (await api.me())?.id ?? null,
    claim: (ticket, audience) => api.claimHandoff(ticket, audience),
  });
}
