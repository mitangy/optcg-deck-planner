import { getCardDef } from "./cards/definitions.js";
import type { GameEvent } from "./types.js";

/** Card name, or "a hidden card" for ids a seat's projected events hide (see projectGameEvents). */
function nameOf(id: string): string {
  return id === "HIDDEN" ? "a hidden card" : getCardDef(id).name;
}

/** Human-readable lines for a batch of engine events (battle log / sim). */
export function describeEvents(events: readonly GameEvent[]): string[] {
  const lines: string[] = [];
  for (const e of events) {
    switch (e.type) {
      case "mulligan_resolved":
        lines.push(
          `Seat ${e.seat} ${e.didMulligan ? "mulligans" : "keeps"} opening hand`,
        );
        break;
      case "phase_changed":
        lines.push(`Phase → ${e.phase} (active seat ${e.activeSeat})`);
        break;
      case "drew":
        lines.push(`Seat ${e.seat} draws ${e.count}`);
        break;
      case "don_placed":
        lines.push(`Seat ${e.seat} places ${e.count} DON!!`);
        break;
      case "card_played":
        lines.push(
          `Seat ${e.seat} plays ${nameOf(e.defId)} (rests ${e.costPaid} DON!!)`,
        );
        break;
      case "stage_replaced":
        lines.push(
          `Seat ${e.seat} replaces Stage (trashes ${nameOf(e.trashedDefId)})`,
        );
        break;
      case "stage_trashed":
        lines.push(
          `Seat ${e.seat} trashes Stage ${nameOf(e.defId)}`,
        );
        break;
      case "character_trashed_for_space":
        lines.push(
          `Seat ${e.seat} trashes ${nameOf(e.defId)} for board space`,
        );
        break;
      case "don_given":
        lines.push(
          `Seat ${e.seat} attaches DON!! to ${nameOf(e.targetDefId)} → ${e.newPower} power`,
        );
        break;
      case "attack_declared": {
        const target =
          e.target.kind === "leader" ? "Leader" : "a Character";
        lines.push(
          `Seat ${e.seat} attacks ${target} (${e.attackerPower} vs ${e.defenderPower})`,
        );
        break;
      }
      case "blocked":
        lines.push(`Seat ${e.seat} blocks`);
        break;
      case "counter_applied":
        lines.push(
          `Seat ${e.seat} counters with ${nameOf(e.defId)} (+${e.bonus})`,
        );
        break;
      case "battle_resolved":
        lines.push(
          `Battle ${e.attackerWon ? "hits" : "fails"} (${e.attackerPower} vs ${e.defenderPower})`,
        );
        break;
      case "character_ko":
        lines.push(`Seat ${e.seat}'s ${nameOf(e.defId)} is K.O.'d`);
        break;
      case "life_taken":
        // Never say whether the card went to hand or has a [Trigger]: the opponent must not learn that (#352).
        lines.push(e.defId === "HIDDEN" ? `Seat ${e.seat} takes Life` : `Seat ${e.seat} takes Life (${nameOf(e.defId)})`);
        break;
      case "trigger_available":
        // Legacy logs only; hidden from the opponent so the seat that is not checking learns nothing.
        if (e.defId !== "HIDDEN") lines.push(`Seat ${e.seat} Trigger available (${nameOf(e.defId)})`);
        break;
      case "trigger_resolved":
        lines.push(e.accepted ? `Seat ${e.seat} Trigger accepted` : `Seat ${e.seat} adds the Life card to hand`);
        break;
      case "card_revealed":
        lines.push(
          `Seat ${e.seat} reveals ${nameOf(e.defId)}` +
            (e.matchedTrait ? " (trait matched)" : ""),
        );
        break;
      case "power_buff_applied":
        lines.push(
          `Seat ${e.seat} gives ${nameOf(e.targetDefId)} +${e.amount} power this ${e.duration}`,
        );
        break;
      case "card_moved":
        lines.push(
          `Seat ${e.seat} moves ${e.defId === "HIDDEN" ? "a card" : nameOf(e.defId)} from ${e.from} to ${e.to}`,
        );
        break;
      case "ability_activated":
        lines.push(`Seat ${e.seat} activates ${nameOf(e.defId)}'s ability`);
        break;
      case "pending_choice_added":
        lines.push(
          `Seat ${e.seat} may resolve ${nameOf(e.cardDefId)}'s ${e.kind.replace(/_/g, " ")} (${e.prompt})`,
        );
        break;
      case "pending_choice_resolved":
        if (e.kind === "life_trigger") break; // narrated by trigger_resolved
        lines.push(
          `Seat ${e.seat} ${e.accepted ? "accepts" : "declines"} ${nameOf(e.cardDefId)}'s ${e.kind.replace(/_/g, " ")}`,
        );
        break;
      case "game_over":
        lines.push(`★ Seat ${e.winner} wins (${e.reason})`);
        break;
      default:
        break;
    }
  }
  return lines;
}
