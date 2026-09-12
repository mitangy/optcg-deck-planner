import { getCardDef } from "./cards/definitions.js";
import type { GameEvent } from "./types.js";

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
        lines.push(`Seat ${e.seat} plays ${getCardDef(e.defId).name}`);
        break;
      case "stage_replaced":
        lines.push(
          `Seat ${e.seat} replaces Stage (trashes ${getCardDef(e.trashedDefId).name})`,
        );
        break;
      case "character_trashed_for_space":
        lines.push(
          `Seat ${e.seat} trashes ${getCardDef(e.defId).name} for board space`,
        );
        break;
      case "don_given":
        lines.push(
          `Seat ${e.seat} attaches DON!! to ${getCardDef(e.targetDefId).name} → ${e.newPower} power`,
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
          `Seat ${e.seat} counters with ${getCardDef(e.defId).name} (+${e.bonus})`,
        );
        break;
      case "battle_resolved":
        lines.push(
          `Battle ${e.attackerWon ? "hits" : "fails"} (${e.attackerPower} vs ${e.defenderPower})`,
        );
        break;
      case "character_ko":
        lines.push(`Seat ${e.seat}'s ${getCardDef(e.defId).name} is K.O.'d`);
        break;
      case "life_taken":
        lines.push(
          `Seat ${e.seat} takes Life (${getCardDef(e.defId).name}${
            e.toHand ? " → hand" : ", Trigger pending"
          })`,
        );
        break;
      case "trigger_available":
        lines.push(
          `Seat ${e.seat} Trigger available (${getCardDef(e.defId).name})`,
        );
        break;
      case "trigger_resolved":
        lines.push(
          `Seat ${e.seat} Trigger ${e.accepted ? "accepted" : "declined"}`,
        );
        break;
      case "pending_choice_added":
        lines.push(
          `Seat ${e.seat} may resolve ${getCardDef(e.cardDefId).name}'s ${e.kind.replace(/_/g, " ")} (${e.prompt})`,
        );
        break;
      case "pending_choice_resolved":
        lines.push(
          `Seat ${e.seat} ${e.accepted ? "accepts" : "declines"} ${getCardDef(e.cardDefId).name}'s ${e.kind.replace(/_/g, " ")}`,
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
