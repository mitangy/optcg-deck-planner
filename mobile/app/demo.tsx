import { useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { DuelBoard } from "../src/board/DuelBoard";
import type { PendingChoiceView, PlayerView } from "../src/net/protocol";

/**
 * Sample board for trying the floating-card prompts without a match:
 * `/demo?prompt=look|satori|effects`. Not linked from the home screen.
 */
const LOOK_OPTIONS = [
  { id: "o0", defId: "OP09-086", zone: "deck", ownerSeat: 0 as const, eligible: true },
  { id: "o1", defId: "ST01-003", zone: "deck", ownerSeat: 0 as const, eligible: false },
  { id: "o2", defId: "OP09-095", zone: "deck", ownerSeat: 0 as const, eligible: true },
  { id: "o3", defId: "ST01-008", zone: "deck", ownerSeat: 0 as const, eligible: false },
  { id: "o4", defId: "OP09-099", zone: "deck", ownerSeat: 0 as const, eligible: true },
];

const PROMPTS: Record<string, PendingChoiceView> = {
  look: {
    id: "demo-look",
    seat: 0,
    kind: "effect",
    cardDefId: "OP09-095",
    prompt: "Laffitte — look at the top 5 cards, choose up to 1, then place the rest at the bottom of the deck in any order.",
    request: {
      type: "look",
      options: LOOK_OPTIONS,
      minSelect: 0,
      maxSelect: 1,
      groups: [{ label: "Up to 1: add to hand", max: 1, eligibleIds: ["o0", "o2", "o4"] }],
      rest: "deck_bottom",
      restLabel: "place the rest at the bottom of the deck in any order",
    },
  },
  satori: {
    id: "demo-satori",
    seat: 0,
    kind: "effect",
    cardDefId: "OP15-066",
    prompt: "Satori — look at the top 2 cards, then place the rest all at the top or all at the bottom of the deck.",
    request: {
      type: "look",
      options: LOOK_OPTIONS.slice(0, 2).map((o) => ({ ...o, eligible: false })),
      minSelect: 0,
      maxSelect: 0,
      groups: [],
      rest: "top_or_bottom",
      restLabel: "place the rest all at the top or all at the bottom of the deck",
    },
  },
  effects: {
    id: "demo-effects",
    seat: 0,
    kind: "order_effects",
    cardDefId: "OP09-095",
    prompt: "These effects trigger at the same time. Choose the order they resolve in.",
    unorderedChoices: [
      { id: "e0", seat: 0, kind: "effect", cardDefId: "OP09-086", prompt: "[On Play] Look at the top 3 cards of your deck and add up to 1 {Revolutionary Army} card to your hand." },
      { id: "e1", seat: 0, kind: "effect", cardDefId: "OP09-095", prompt: "[On Play] Look at the top 5 cards of your deck and add up to 1 card to your hand." },
      { id: "e2", seat: 0, kind: "effect", cardDefId: "ST01-001", prompt: "[Your Turn] Give up to 1 rested DON!! card to your Leader or 1 of your Characters." },
    ],
  },
};

function demoView(choice: PendingChoiceView | undefined): PlayerView {
  return {
    seat: 0,
    you: {
      leader: { id: "y-leader", defId: "ST01-001", power: 5000 },
      characters: [
        { id: "y-c1", defId: "ST01-003", power: 3000 },
        { id: "y-c2", defId: "ST01-008", power: 5000, rested: true },
      ],
      stage: null,
      hand: [
        { id: "y-h1", defId: "ST01-006" },
        { id: "y-h2", defId: "ST01-009" },
        { id: "y-h3", defId: "ST01-014" },
      ],
      deckCount: 33,
      trash: ["ST01-003"],
      lifeCount: 4,
      donDeckCount: 5,
      costArea: [
        { id: "d1", rested: false },
        { id: "d2", rested: false },
        { id: "d3", rested: true },
      ],
      activeDonCount: 2,
      mulliganDone: true,
    },
    opponent: {
      leader: { id: "o-leader", defId: "ST01-001", power: 5000 },
      characters: [{ id: "o-c1", defId: "ST01-008", power: 5000 }],
      stage: null,
      handCount: 5,
      deckCount: 36,
      trash: [],
      lifeCount: 5,
      donDeckCount: 6,
      costAreaCount: 4,
      activeDonCount: 4,
    },
    activeSeat: 0,
    phase: "main",
    turnNumber: 3,
    battle: null,
    pendingTrigger: null,
    pendingChoices: choice ? [choice] : [],
    winner: null,
    winReason: null,
    legalIntents: [{ type: "end_turn" }],
  };
}

export default function DemoScreen() {
  const params = useLocalSearchParams<{ prompt?: string }>();
  // Answering a prompt clears it, like the server would.
  // Client-only: the static web export renders at 0×0, which would size the cards wrong.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [choice, setChoice] = useState<PendingChoiceView | undefined>(() => PROMPTS[params.prompt ?? "look"] ?? PROMPTS.look);
  if (!mounted) return <View style={styles.root} />;
  return (
    <View style={styles.root}>
      <DuelBoard
        view={demoView(choice)}
        seat={0}
        matchId="demo"
        errorBanner={null}
        matchOver={null}
        floatingPrompts
        onSendIntent={() => setChoice(undefined)}
        onLeave={() => setChoice(PROMPTS[params.prompt ?? "look"] ?? PROMPTS.look)}
        onClearError={() => undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: "#071016" } });
