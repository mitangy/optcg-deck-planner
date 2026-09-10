import React, { useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { Intent, MatchOverMessage, PlayerView, Seat } from "../net/protocol";
import { CardTile } from "./CardTile";
import { IntentBar } from "./IntentBar";

type Props = {
  view: PlayerView | null;
  seat: Seat | null;
  matchId: string | null;
  errorBanner: string | null;
  matchOver: MatchOverMessage["result"] | null;
  onSendIntent: (intent: Intent) => void;
  onLeave: () => void;
  onClearError: () => void;
};

export function DuelBoard({
  view,
  seat,
  matchId,
  errorBanner,
  matchOver,
  onSendIntent,
  onLeave,
  onClearError,
}: Props) {
  const [handFilter, setHandFilter] = useState<number | null>(null);
  const over = matchOver != null || view?.winner != null;

  if (!view) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingText}>Waiting for match view…</Text>
      </View>
    );
  }

  const you = view.you;
  const opp = view.opponent;
  const mySeat = seat ?? view.seat;

  return (
    <View style={styles.root}>
      <View style={styles.chrome}>
        <Text style={styles.chromeText}>
          Phase {view.phase} · Turn {view.turnNumber} · You seat {mySeat}
          {view.activeSeat === mySeat ? " · YOUR TURN" : ""}
        </Text>
        <View style={styles.chromeRow}>
          <Text style={styles.matchId} selectable>
            Room {matchId ?? "—"}
          </Text>
          <Pressable onPress={onLeave} style={styles.leaveBtn}>
            <Text style={styles.leaveText}>Leave</Text>
          </Pressable>
        </View>
      </View>

      {errorBanner ? (
        <Pressable onPress={onClearError} style={styles.errorBanner}>
          <Text style={styles.errorText}>{errorBanner}</Text>
        </Pressable>
      ) : null}

      <ScrollView contentContainerStyle={styles.board} bounces={false}>
        <Text style={styles.zoneLabel}>Opponent</Text>
        <Text style={styles.stats}>
          Life {opp.lifeCount} · Hand {opp.handCount} · DON {opp.activeDonCount}/
          {opp.costAreaCount} · Deck {opp.deckCount}
        </Text>
        <View style={styles.row}>
          {opp.stage ? (
            <CardTile defId={opp.stage.defId} compact rested={opp.stage.rested} />
          ) : null}
          {opp.characters.map((c) => (
            <CardTile
              key={c.id}
              defId={c.defId}
              compact
              rested={c.rested}
              power={c.power}
              attachedDonCount={c.attachedDonCount}
            />
          ))}
          <CardTile
            defId={opp.leader.defId}
            compact
            rested={opp.leader.rested}
            power={opp.leader.power}
            attachedDonCount={opp.leader.attachedDonCount}
          />
        </View>

        {Boolean(view.battle || view.pendingTrigger) && (
          <View style={styles.prompt}>
            <Text style={styles.promptText}>
              {view.pendingTrigger
                ? `Trigger pending: ${JSON.stringify(view.pendingTrigger)}`
                : `Battle: ${JSON.stringify(view.battle)}`}
            </Text>
          </View>
        )}

        <Text style={[styles.zoneLabel, { marginTop: 16 }]}>You</Text>
        <View style={styles.row}>
          <CardTile
            defId={you.leader.defId}
            rested={you.leader.rested}
            power={you.leader.power}
            attachedDonCount={you.leader.attachedDonCount}
          />
          {you.characters.map((c) => (
            <CardTile
              key={c.id}
              defId={c.defId}
              rested={c.rested}
              power={c.power}
              attachedDonCount={c.attachedDonCount}
            />
          ))}
          {you.stage ? <CardTile defId={you.stage.defId} rested={you.stage.rested} /> : null}
        </View>
        <Text style={styles.stats}>
          Life {you.lifeCount} · Active DON {you.activeDonCount} · Cost area{" "}
          {you.costArea.length} · Deck {you.deckCount}
        </Text>

        <Text style={styles.zoneLabel}>Hand</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.hand}
        >
          {you.hand.map((c, idx) => (
            <CardTile
              key={c.id}
              defId={c.defId}
              selected={handFilter === idx}
              onPress={() => setHandFilter((prev) => (prev === idx ? null : idx))}
            />
          ))}
        </ScrollView>
      </ScrollView>

      <IntentBar
        intents={view.legalIntents}
        disabled={over}
        filterHandIndex={handFilter}
        onSend={(intent) => {
          setHandFilter(null);
          onSendIntent(intent);
        }}
      />

      <Modal visible={over} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Match over</Text>
            <Text style={styles.modalBody}>
              Winner: seat {matchOver?.winner ?? view.winner}
              {"\n"}
              Reason: {matchOver?.reason ?? view.winReason ?? "—"}
            </Text>
            <Pressable onPress={onLeave} style={styles.leaveBtn}>
              <Text style={styles.leaveText}>Return home</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#071016" },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#071016",
  },
  loadingText: { color: "#90a4ae" },
  chrome: {
    paddingTop: 8,
    paddingHorizontal: 12,
    paddingBottom: 8,
    backgroundColor: "#0d1b22",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#37474f",
  },
  chromeText: { color: "#eceff1", fontSize: 13, fontWeight: "600" },
  chromeRow: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  matchId: { color: "#90a4ae", fontSize: 12, flex: 1 },
  leaveBtn: {
    backgroundColor: "#455a64",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    minHeight: 36,
    justifyContent: "center",
  },
  leaveText: { color: "#fff", fontWeight: "700", fontSize: 12 },
  errorBanner: {
    backgroundColor: "#b71c1c",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  errorText: { color: "#fff", fontSize: 13 },
  board: { padding: 12, paddingBottom: 24 },
  zoneLabel: {
    color: "#ffcc80",
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 6,
    letterSpacing: 0.3,
  },
  stats: { color: "#b0bec5", fontSize: 12, marginBottom: 8 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },
  hand: { gap: 8, paddingVertical: 4 },
  prompt: {
    backgroundColor: "#1a237e",
    borderRadius: 8,
    padding: 10,
    marginVertical: 10,
  },
  promptText: { color: "#e8eaf6", fontSize: 12 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    backgroundColor: "#102027",
    borderRadius: 12,
    padding: 20,
    width: "100%",
    maxWidth: 360,
    gap: 12,
  },
  modalTitle: { color: "#fff", fontSize: 20, fontWeight: "800" },
  modalBody: { color: "#cfd8dc", fontSize: 14, lineHeight: 20 },
});
