import { getCardDef } from "../cards/definitions.js";
import { ABILITY_REGISTRY } from "../registry/searchSlice.js";
import type { AbilityOperation, CardAbilityProgram, CompiledAbilityRegistry } from "../registry/schema.js";
import type { CardInstance, GameEvent, MatchState, PendingChoice, ResolutionFrame, Seat } from "../types.js";

type SearchOperation = Extract<AbilityOperation, { type: "search_top_deck" }>;

function searchOperation(ability: CardAbilityProgram): { operation: SearchOperation; index: number } {
  const index = ability.operations.findIndex((operation) => operation.type === "search_top_deck");
  if (index < 0) throw new Error(`Ability ${ability.id} has no search operation`);
  return { operation: ability.operations[index] as SearchOperation, index };
}

function eligible(defId: string, operation: SearchOperation): boolean {
  const selector = operation.selector;
  if (!selector) return true;
  if (selector.excludeDefIds?.includes(defId)) return false;
  const def = getCardDef(defId);
  const hasTrait = !selector.traits?.length || selector.traits.some((trait) => def.traits?.includes(trait));
  const hasName = !selector.nameIncludes?.length || selector.nameIncludes.some((name) => def.name.includes(name));
  return hasTrait && hasName;
}

export function scheduleDeclarativeSearch(
  state: MatchState,
  seat: Seat,
  source: Pick<CardInstance, "id" | "defId">,
  ability: CardAbilityProgram,
  window: string,
  alloc: (prefix: string) => string,
  existingFrame?: ResolutionFrame,
): PendingChoice {
  const index = existingFrame?.operationIndex ?? searchOperation(ability).index;
  const operation = ability.operations[index];
  if (operation?.type !== "search_top_deck") throw new Error("Continuation does not point to a search operation");
  const choiceId = alloc("choice");
  const frameId = existingFrame?.id ?? alloc("frame");
  const top = state.players[seat].deck.slice(0, operation.count);
  const options = top.map((defId, optionIndex) => ({ id: `${choiceId}:option:${optionIndex}`, defId, eligible: eligible(defId, operation) }));
  const expectedInstanceIds = state.players[seat].zoneInstanceIds.deck.slice(0, top.length);
  if (existingFrame) Object.assign(existingFrame.bindings, { expectedTop: top, expectedInstanceIds });
  else state.resolutionFrames.push({ id: frameId, seat, sourceInstanceId: source.id, sourceDefId: source.defId, abilityId: ability.id, window, operationIndex: index, bindings: { expectedTop: top, expectedInstanceIds } });
  return {
    id: choiceId,
    resolutionFrameId: frameId,
    seat,
    kind: "search_top_deck",
    cardDefId: source.defId,
    sourceInstanceId: source.id,
    optional: false,
    prompt: `Look at the top ${options.length} card${options.length === 1 ? "" : "s"}, add up to ${operation.maxSelect} eligible card ${operation.destination === "life_top" ? "to the top of your Life cards" : "to your hand"}, then ${operation.remainder === "trash" ? "trash the rest." : "order the rest on the bottom of your deck."}`,
    abilityId: "top_deck_search",
    search: { options, maxSelect: operation.maxSelect, remainder: operation.remainder, takeToLife: operation.destination === "life_top" },
    privateToSeat: seat,
    optionCount: options.length,
  };
}

export function resolveDeclarativeSearch(
  state: MatchState,
  seat: Seat,
  choice: PendingChoice,
  selectedOptionId: string | undefined,
  orderedOptionIds: string[] | undefined,
  makeCard: (defId: string, instanceId?: string) => CardInstance,
  events: GameEvent[],
  registry: CompiledAbilityRegistry = ABILITY_REGISTRY,
): string | null {
  const frameIndex = state.resolutionFrames.findIndex((frame) => frame.id === choice.resolutionFrameId);
  if (frameIndex < 0) return "Search continuation is missing";
  const frame = state.resolutionFrames[frameIndex]!;
  if (frame.seat !== seat || frame.sourceDefId !== choice.cardDefId) return "Search continuation does not match this choice";
  const ability = registry.abilities.get(frame.abilityId);
  const operation = ability?.operations[frame.operationIndex];
  if (!ability || operation?.type !== "search_top_deck") return "Search ability is no longer available";
  const search = choice.search;
  if (!search) return "Search details are missing";
  const options = search.options;
  const expectedTop = frame.bindings.expectedTop;
  const expectedInstanceIds = frame.bindings.expectedInstanceIds;
  const currentTop = state.players[seat].deck.slice(0, options.length);
  const currentIds = state.players[seat].zoneInstanceIds.deck.slice(0, options.length);
  if (!Array.isArray(expectedTop) || !Array.isArray(expectedInstanceIds) || currentTop.length !== expectedTop.length || currentTop.some((defId, index) => defId !== expectedTop[index]) || currentIds.some((id, index) => id !== expectedInstanceIds[index])) return "Deck changed while the search was pending";
  const selected = selectedOptionId ? options.find((option) => option.id === selectedOptionId) : undefined;
  if (selectedOptionId && !selected) return "Selected search option is invalid";
  if (selected && !selected.eligible) return "Selected card is not eligible";
  if (selected && operation.maxSelect < 1) return "This search cannot take a card";
  const remaining = options.filter((option) => option.id !== selectedOptionId);
  const ordered = orderedOptionIds ?? [];
  if (ordered.length !== remaining.length || new Set(ordered).size !== ordered.length || ordered.some((id) => !remaining.some((option) => option.id === id))) return "Remainder order must include every unselected card exactly once";
  const player = state.players[seat];
  player.deck.splice(0, options.length);
  const optionInstanceIds = player.zoneInstanceIds.deck.splice(0, options.length);
  for (const id of ordered) {
    const option = remaining.find((candidate) => candidate.id === id)!;
    const optionIndex = options.findIndex((candidate) => candidate.id === id);
    const instanceId = optionInstanceIds[optionIndex]!;
    if (operation.remainder === "trash") { player.trash.push(option.defId); player.zoneInstanceIds.trash.push(instanceId); }
    else { player.deck.push(option.defId); player.zoneInstanceIds.deck.push(instanceId); }
  }
  if (selected) {
    const selectedIndex = options.findIndex((option) => option.id === selectedOptionId);
    const selectedInstanceId = optionInstanceIds[selectedIndex]!;
    if (operation.destination === "life_top") { player.life.unshift(selected.defId); player.faceUpLife.unshift(false); events.push({ type: "life_added", seat, defId: selected.defId, source: "deck_top" }); }
    else player.hand.push(makeCard(selected.defId, selectedInstanceId));
    if (operation.destination === "life_top") player.zoneInstanceIds.life.unshift(selectedInstanceId);
    events.push({ type: "card_revealed", seat, defId: selected.defId, matchedTrait: true });
  }
  frame.operationIndex += 1;
  delete frame.bindings.expectedTop;
  delete frame.bindings.expectedInstanceIds;
  return null;
}
