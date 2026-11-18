import { Link } from "react-router-dom";
import { WhatsNewCard } from "@optcg/patch-notes";

export default function WhatsNewHost() {
  return <WhatsNewCard app="duel" Link={Link} />;
}
