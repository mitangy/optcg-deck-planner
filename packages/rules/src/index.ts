export { createSeededRng, type Rng, type RngState } from "./rng.js";
export { EFFECT_SCHEMA_VERSION } from "./effects/types.js";
export type { Ability, CardAbilities, Effect, Cond, Cost, Static, Trigger, SupportStatus } from "./effects/types.js";
export { ABILITY_REGISTRY, REGISTRY_HASH, abilitiesFor, abilityById, cardAbilities, buildAbilityRegistry, RegistryValidationError } from "./cards/abilities.js";
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
export { cardDataFor, listCardDataIds, CARD_DATA_CANDIDATE, type CardDataRow } from "./cards/cardData.js";
export { TCG_PRODUCTS } from "./cards/tcgProducts.js";
export { CARD_SOURCE_RECORDS, cardSourceRecord, type CardSourceRecord, type FieldVerification } from "./cards/sourceRecords.js";
export { tcgArtForCard, tcgAltsForCard, tcgProductImageUrl, listTcgMappedCardIds } from "./cards/tcgArt.js";
export {
  createMatch,
  applyIntent,
  listLegalIntents,
  getPlayerView,
  getSpectatorView,
  projectGameEvents,
  projectPendingChoice,
  assertInvariants,
  skipMulligans,
  powerOf,
  costOf,
  playCostOf,
  counterOf,
  keywordsOf,
  hasKeyword,
  isNegated,
} from "./engine.js";
export { describeEvents } from "./describeEvents.js";
export { revealsHiddenInfo } from "./revealsHiddenInfo.js";
export { reseedMatch } from "./reseed.js";
export { MATCH_REPLAY_SCHEMA, replayMatch, replayStart, replayApply, type MatchReplay, type ReplayStep } from "./matchReplay.js";
export {
  createTimelineBuilder,
  buildReplayTimeline,
  timelineStateAt,
  getReplayView,
  projectReplayEvents,
  DEFAULT_CHECKPOINT_EVERY,
  type ReplayTimeline,
  type TimelineStep,
} from "./replayTimeline.js";
export { SEAT_LOG_SCHEMA, seatLog, type SeatLog, type SeatLogTurn } from "./seatLog.js";
export type {
  Seat,
  InstanceId,
  CardDefId,
  Phase,
  CardType,
  CardDef,
  CardInstance,
  DonInstance,
  AttackTarget,
  BattleState,
  ChoiceOption,
  ChoiceRequest,
  PendingChoice,
  PendingChoiceKind,
  PendingTrigger,
  PlayerState,
  MatchState,
  Modifier,
  QueuedTrigger,
  ResolutionFrame,
  GameEvent,
  Intent,
  ApplyContext,
  ApplyResult,
  PlayerDeckConfig,
  CreateMatchConfig,
} from "./types.js";
export {
  EFFECT_CATALOG,
  buildEffectCatalog,
  effectsForCard,
  effectsForDef,
  summarizeEffectCoverage,
  abilitySupportForCard,
  abilitySupportForDef,
  enrichAtlasAbilitySupport,
  buildCardSupportManifest,
  summarizeCardSupportManifest,
  unsupportedCardsForDeck,
  type CardEffectEntry,
  type AbilitySupport,
  type CardSupportIssue,
} from "./cards/effectCatalog.js";
export { deckConstructionErrors } from "./cards/deckRules.js";
export {
  GOLDFISH_DUMMY_LEADER,
  GOLDFISH_DUMMY_CARD,
  bestDeploy,
  shouldMulligan,
  wilsonPercent,
  flaggedCards,
  setDummyLife,
  goldfishRun,
  summarizeGoldfish,
  type GoldfishLine,
  type GoldfishSetup,
  type GoldfishTurn,
  type GoldfishRun,
  type GoldfishSummary,
  type DeployCandidate,
} from "./sim/goldfish.js";
