export { createSeededRng, type Rng, type RngState } from "./rng.js";
export { ABILITY_SCHEMA_VERSION, type CardAbilityProgram, type CardAbilityRecord, type CompiledAbilityRegistry } from "./registry/schema.js";
export { compileAbilityRegistry, RegistryValidationError } from "./registry/compiler.js";
export { ABILITY_REGISTRY, abilitiesForCard, abilityForCard, ABILITY_MOBY_DICK_ON_PLAY, ABILITY_MY_ERA_MAIN, ABILITY_MY_ERA_TRIGGER } from "./registry/searchSlice.js";
export { MATCH_STATE_VERSION, RULES_PROTOCOL_VERSION, RULES_VERSION, serializeMatch, deserializeMatch, validateMatchContract, IncompatibleSnapshotError } from "./state/snapshot.js";
export {
  getCardDef,
  listCardDefs,
  hasCardDef,
  ensureCardDef,
  ensureDefsForPlayers,
  isCuratedCardDef,
  normalizeCardDefId,
  buildTestDeck,
  buildCardAtlas,
  getDefsHealthSnapshot,
  DEFAULT_LEADER_ID,
  type CardAtlasEntry,
} from "./cards/definitions.js";
export {
  TCG_PRODUCTS,
} from "./cards/tcgProducts.js";
export { CARD_SOURCE_RECORDS, cardSourceRecord, type CardSourceRecord, type FieldVerification } from "./cards/sourceRecords.js";
export {
  tcgArtForCard,
  tcgAltsForCard,
  tcgProductImageUrl,
  listTcgMappedCardIds,
} from "./cards/tcgArt.js";
export {
  createMatch,
  applyIntent,
  listLegalIntents,
  getPlayerView,
  getSpectatorView,
  projectGameEvents,
  assertInvariants,
  skipMulligans,
} from "./engine.js";
export { describeEvents } from "./describeEvents.js";
export type {
  Seat,
  InstanceId,
  CardDefId,
  Phase,
  CardType,
  CardDef,
  TopDeckSearchEffect,
  ActivateMainSearchEffect,
  CardInstance,
  DonInstance,
  AttackTarget,
  BattleState,
  PendingChoice,
  PendingChoiceKind,
  PendingTrigger,
  PlayerState,
  MatchState,
  ResolutionFrame,
  GameEvent,
  Intent,
  ApplyContext,
  ApplyResult,
  PlayerDeckConfig,
  CreateMatchConfig,
} from "./types.js";

export {
  LEADER_ABILITY_CATALOG,
  type LeaderAbilityEntry,
  type LeaderAbilityTiming,
} from "./cards/leaderAbilities.js";
export {
  ABILITY_LEADER_GIVE_RESTED_DON,
  ABILITY_STAGE_TRASH_GIVE_RESTED_DON,
  ABILITY_LAFFITTE_SEARCH,
  ABILITY_FULLALEAD_SEARCH,
} from "./cards/abilityIds.js";
export {
  EFFECT_CATALOG,
  buildEffectCatalog,
  effectsForCard,
  effectsForDef,
  summarizeEffectCoverage,
  abilitySupportForDef,
  abilitySupportFromEntries,
  enrichAtlasAbilitySupport,
  buildCardSupportManifest,
  summarizeCardSupportManifest,
  unsupportedCardsForDeck,
  type CardEffectEntry,
  type EffectStatus,
  type EffectTiming,
  type AbilitySupport,
  type CardSupportIssue,
} from "./cards/effectCatalog.js";
export {
  applyEffectOrder,
  enqueuePendingChoices,
  sortByApnap,
} from "./effectOrder.js";
