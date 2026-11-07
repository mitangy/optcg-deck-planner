import { Link } from "react-router-dom";
import { WhatsNewCard } from "@optcg/patch-notes";

/**
 * The once-per-update card, in its own chunk (F-12): the whole patch-notes list (about 90 KB of text) is only
 * read here and on the What's new page, so the lobby loads it lazily instead of shipping it in the entry chunk.
 */
export default function WhatsNewHost() {
  return <WhatsNewCard app="duel" Link={Link} />;
}
